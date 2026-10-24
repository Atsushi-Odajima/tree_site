import '../styles/base.css';
import '../styles/form.css';
import { initCommon, esc } from '../ui/common.ts';
import { icon } from '../ui/icons.ts';
import { AREA_OTHER, PLACE_TYPES, SERVICE_AREAS, areaLabel, placeLabel } from '../data/business.ts';
import { EXTRA_OPTIONS, WORK_LABELS, extraLabel, type ExtraId, type MainWorkId } from '../data/services.ts';
import { GRASS_HEIGHTS, TREE_COUNTS, TREE_HEIGHTS, TREE_SURROUNDINGS, labelOf } from '../data/pricing.ts';
import { DAY_STATUS_MESSAGE, addDays, dayStatus, formatYmd, nextOpenDay, todayJst } from '../data/calendar.ts';
import { DEMO_PHOTOS, getPhoto, photoSrc } from '../data/photos.ts';
import { describeArea, displayValue, parseAreaInput, type AreaUnit } from '../lib/area.ts';
import {
  StorageError,
  clearHandoff,
  loadHandoff,
  repository,
  type EstimateSnapshot,
  type Handoff,
  type Inquiry,
} from '../lib/storage.ts';

const MAX_PHOTOS = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];
const STEPS = ['困りごと・作業内容', '場所の状態・写真', '連絡先・希望日', '確認', '受付完了'];

interface LocalPhoto {
  key: string;
  url: string;
  size: number;
}

interface FormState {
  mainWork: MainWorkId | null;
  extras: ExtraId[];
  trouble: string;
  placeType: string | null;
  unit: AreaUnit;
  areaM2: number | null;
  areaText: string;
  areaUnknown: boolean;
  grassHeight: string | null;
  treeHeight: string | null;
  treeCount: string | null;
  surroundings: string[];
  siteNote: string;
  demoPhotoIds: string[];
  areaId: string | null;
  dates: [string, string, string];
  attendance: 'yes' | 'no' | 'consult' | null;
  farAway: boolean;
  name: string;
  phone: string;
  email: string;
  message: string;
}

const emptyState = (): FormState => ({
  mainWork: null,
  extras: [],
  trouble: '',
  placeType: null,
  unit: 'm2',
  areaM2: null,
  areaText: '',
  areaUnknown: false,
  grassHeight: null,
  treeHeight: null,
  treeCount: null,
  surroundings: [],
  siteNote: '',
  demoPhotoIds: [],
  areaId: null,
  dates: ['', '', ''],
  attendance: null,
  farAway: false,
  name: '',
  phone: '',
  email: '',
  message: '',
});

function newToken(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

const radio = (name: string, value: string, label: string, checked: boolean, extra = '') =>
  `<label class="choice"><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''} ${extra} /><span>${label}</span></label>`;
const checkbox = (name: string, value: string, label: string, checked: boolean, extra = '') =>
  `<label class="choice"><input type="checkbox" name="${name}" value="${value}" ${checked ? 'checked' : ''} ${extra} /><span>${label}</span></label>`;

class EstimateApp {
  private root: HTMLElement;
  private s: FormState = emptyState();
  private step = 0;
  private token = newToken();
  private submitting = false;
  private saveError = '';
  private errors: Record<string, string> = {};
  private photoMessages: string[] = [];
  private localPhotos: LocalPhoto[] = [];
  private handoff: Handoff | null = null;
  private done: Inquiry | null = null;
  private today = todayJst();

  constructor(root: HTMLElement) {
    this.root = root;
    this.applyQuery();
    this.render(false);
    root.addEventListener('input', (e) => this.onInput(e.target as HTMLInputElement));
    root.addEventListener('change', (e) => this.onChange(e.target as HTMLInputElement));
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('submit', (e) => e.preventDefault());
  }

  /* ---------- 初期値（URL・費用目安からの引き継ぎ） ---------- */

  private applyQuery(): void {
    const params = new URLSearchParams(location.search);
    const work = params.get('work');
    if (work && work in WORK_LABELS) this.s.mainWork = work as MainWorkId;
    if (params.get('from') === 'estimate') {
      const h = loadHandoff();
      if (h) {
        this.handoff = h;
        this.s.mainWork = h.mainWork;
        this.s.extras = [...h.extras];
        this.s.areaM2 = h.site.areaM2;
        this.s.areaText = h.site.areaM2 !== null ? displayValue(h.site.areaM2, 'm2') : '';
        this.s.areaUnknown = h.mainWork !== 'bassai' && h.site.areaM2 === null;
        this.s.grassHeight = h.site.grassHeight ?? null;
        this.s.treeHeight = h.site.treeHeight ?? null;
        this.s.treeCount = h.site.treeCount ?? null;
        this.s.surroundings = h.site.surroundings ?? [];
      }
    }
  }

  /** 引き継いだ概算が、今の入力内容と一致しているか（作業や面積を変えたら引き継がない） */
  private handoffEstimate(): EstimateSnapshot | null {
    const h = this.handoff;
    if (!h?.estimate) return null;
    const s = this.s;
    if (s.mainWork !== h.mainWork) return null;
    if (s.mainWork === 'bassai') {
      if ((s.treeHeight ?? 'unknown') !== (h.site.treeHeight ?? 'unknown')) return null;
      if ((s.treeCount ?? 'unknown') !== (h.site.treeCount ?? 'unknown')) return null;
    } else {
      const area = s.areaUnknown ? null : s.areaM2;
      if (area !== h.site.areaM2) return null;
      if ((s.grassHeight ?? 'unknown') !== (h.site.grassHeight ?? 'unknown')) return null;
    }
    return h.estimate;
  }

  /* ---------- イベント ---------- */

  private onInput(t: HTMLInputElement): void {
    const s = this.s;
    switch (t.name) {
      case 'trouble':
      case 'siteNote':
      case 'name':
      case 'phone':
      case 'email':
      case 'message': {
        const key = t.name as 'trouble' | 'siteNote' | 'name' | 'phone' | 'email' | 'message';
        s[key] = t.value;
        if (this.errors[key]) this.clearError(key);
        break;
      }
      case 'area': {
        s.areaText = t.value;
        const v = parseAreaInput(t.value, s.unit, s.areaM2);
        s.areaM2 = v === null || Number.isNaN(v) ? null : v;
        if (Number.isNaN(v)) this.setError('area', '面積は0より大きい数字で入力してください（分からなければ「分からない」を選んでください）。');
        else this.clearError('area');
        this.updateAreaConv();
        break;
      }
    }
  }

  private onChange(t: HTMLInputElement): void {
    const s = this.s;
    switch (t.name) {
      case 'mainWork':
        s.mainWork = t.value as MainWorkId;
        s.extras = s.extras.filter((x) => x !== s.mainWork);
        this.clearError('mainWork');
        this.render(false);
        return;
      case 'extras':
        s.extras = this.checkedValues('extras') as ExtraId[];
        return;
      case 'placeType':
        s.placeType = t.value;
        this.clearError('placeType');
        return;
      case 'unit':
        s.unit = t.value as AreaUnit;
        if (s.areaM2 !== null) s.areaText = displayValue(s.areaM2, s.unit);
        this.render(false);
        return;
      case 'areaUnknown':
        s.areaUnknown = t.checked;
        this.clearError('area');
        this.render(false);
        return;
      case 'grassHeight':
      case 'treeHeight':
      case 'treeCount':
        s[t.name as 'grassHeight' | 'treeHeight' | 'treeCount'] = t.value;
        return;
      case 'surroundings':
        s.surroundings = this.checkedValues('surroundings');
        return;
      case 'demoPhoto':
        this.toggleDemoPhoto(t);
        return;
      case 'localPhoto':
        this.addLocalFiles(t);
        return;
      case 'areaId':
        s.areaId = t.value;
        this.clearError('areaId');
        return;
      case 'date0':
      case 'date1':
      case 'date2': {
        const i = Number(t.name.slice(4));
        s.dates[i] = t.value;
        this.validateDates();
        this.renderDateErrors();
        return;
      }
      case 'attendance':
        s.attendance = t.value as FormState['attendance'];
        this.clearError('attendance');
        return;
      case 'farAway':
        s.farAway = t.checked;
        return;
    }
  }

  private onClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!el) return;
    const action = el.dataset.action!;
    switch (action) {
      case 'next':
        this.next();
        break;
      case 'back':
        this.go(this.step - 1);
        break;
      case 'goto':
        this.go(Number(el.dataset.step));
        break;
      case 'sample':
        this.fillSample();
        break;
      case 'remove-photo':
        this.removeLocal(el.dataset.key!);
        break;
      case 'clear-date': {
        const i = Number(el.dataset.index);
        this.s.dates[i] = '';
        this.validateDates();
        this.render(false);
        break;
      }
      case 'submit':
        void this.submit();
        break;
      case 'restart':
        this.restart();
        break;
    }
  }

  private checkedValues(name: string): string[] {
    return [...this.root.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)].map((i) => i.value);
  }

  /* ---------- エラー表示 ---------- */

  private setError(name: string, msg: string): void {
    this.errors[name] = msg;
    const box = this.root.querySelector(`[data-error-for="${name}"]`);
    if (box) box.innerHTML = `${icon('alert')}<span>${esc(msg)}</span>`;
    this.root.querySelector(`[name="${name}"]`)?.setAttribute('aria-invalid', 'true');
  }
  private clearError(name: string): void {
    delete this.errors[name];
    const box = this.root.querySelector(`[data-error-for="${name}"]`);
    if (box) box.innerHTML = '';
    this.root.querySelector(`[name="${name}"]`)?.removeAttribute('aria-invalid');
  }
  private err(name: string): string {
    const m = this.errors[name];
    return `<p class="field__error" data-error-for="${name}" id="err-${name}" role="alert">${m ? `${icon('alert')}<span>${esc(m)}</span>` : ''}</p>`;
  }

  /* ---------- 希望日 ---------- */

  private validateDates(): void {
    const seen = new Map<string, number>();
    this.s.dates.forEach((d, i) => {
      const key = `date${i}`;
      delete this.errors[key];
      if (!d) return;
      const st = dayStatus(d, this.today);
      if (st !== 'open') {
        this.errors[key] = DAY_STATUS_MESSAGE[st];
        return;
      }
      if (seen.has(d)) {
        this.errors[key] = `第${seen.get(d)! + 1}希望と同じ日です。別の日を選んでください。`;
        return;
      }
      seen.set(d, i);
    });
  }

  private renderDateErrors(): void {
    [0, 1, 2].forEach((i) => {
      const key = `date${i}`;
      const box = this.root.querySelector(`[data-error-for="${key}"]`);
      const input = this.root.querySelector<HTMLInputElement>(`[name="${key}"]`);
      const msg = this.errors[key];
      if (box) box.innerHTML = msg ? `${icon('alert')}<span>${esc(msg)}</span>` : '';
      if (input) {
        if (msg) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
      }
      const label = this.root.querySelector(`[data-date-label="${i}"]`);
      if (label) label.textContent = this.s.dates[i] && !msg ? formatYmd(this.s.dates[i]) : '';
    });
  }

  /* ---------- 写真 ---------- */

  private photoCount(): number {
    return this.s.demoPhotoIds.length + this.localPhotos.length;
  }

  private toggleDemoPhoto(t: HTMLInputElement): void {
    const id = t.value;
    if (t.checked) {
      if (this.photoCount() >= MAX_PHOTOS) {
        t.checked = false;
        this.photoMessages = [`写真は合計${MAX_PHOTOS}枚までです。ほかの写真を外してから選んでください。`];
      } else {
        this.s.demoPhotoIds.push(id);
        this.photoMessages = [];
      }
    } else {
      this.s.demoPhotoIds = this.s.demoPhotoIds.filter((x) => x !== id);
      this.photoMessages = [];
    }
    this.renderPhotos();
  }

  private addLocalFiles(input: HTMLInputElement): void {
    const files = [...(input.files ?? [])];
    const msgs: string[] = [];
    let added = 0;
    for (const f of files) {
      if (!ACCEPT.includes(f.type)) {
        msgs.push(`選んだファイルのうち1つは対応していない形式です。JPEG・PNG・WebPの写真を選んでください。`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        msgs.push(`${(f.size / 1024 / 1024).toFixed(1)}MBの写真は大きすぎます。1枚5MBまでの写真を選んでください。`);
        continue;
      }
      if (this.photoCount() >= MAX_PHOTOS) {
        msgs.push(`写真は合計${MAX_PHOTOS}枚までです。追加できなかった写真があります。`);
        break;
      }
      // 画像本体はメモリ上のプレビュー用URLだけで扱い、保存・送信しない（ファイル名も保持しない）
      this.localPhotos.push({ key: newToken(), url: URL.createObjectURL(f), size: f.size });
      added++;
    }
    input.value = '';
    if (added) msgs.unshift(`${added}枚の写真を追加しました（この画面でのプレビューのみ）。`);
    this.photoMessages = [...new Set(msgs)];
    this.renderPhotos();
  }

  private removeLocal(key: string): void {
    const p = this.localPhotos.find((x) => x.key === key);
    if (p) URL.revokeObjectURL(p.url);
    this.localPhotos = this.localPhotos.filter((x) => x.key !== key);
    this.photoMessages = ['写真を1枚削除しました。'];
    this.renderPhotos();
    this.root.querySelector<HTMLElement>('[data-file-button]')?.focus();
  }

  private releaseLocal(): void {
    this.localPhotos.forEach((p) => URL.revokeObjectURL(p.url));
    this.localPhotos = [];
  }

  private photosHtml(): string {
    const count = this.photoCount();
    const full = count >= MAX_PHOTOS;
    return `
      <p class="photo-count" aria-live="polite"><strong>${count}</strong> / ${MAX_PHOTOS}枚 選択中</p>
      <div class="photo-msgs" role="status" aria-live="polite">${this.photoMessages.map((m) => `<p>${esc(m)}</p>`).join('')}</div>

      <fieldset class="field photo-block">
        <legend>① サイト内のデモ写真から選ぶ <span class="badge">体験用</span></legend>
        <p class="field__hint">デモ用の写真です。選んだ写真の番号（素材ID）が保存され、管理画面でも表示されます。</p>
        <div class="demo-photos">
          ${DEMO_PHOTOS.map((p) => {
            const on = this.s.demoPhotoIds.includes(p.id);
            return `<label class="demo-photo">
              <input type="checkbox" name="demoPhoto" value="${p.id}" ${on ? 'checked' : ''} ${!on && full ? 'disabled' : ''} />
              <img src="${photoSrc(p.id, 480)}" alt="" width="480" height="${Math.round((p.height / p.width) * 480)}" loading="lazy" />
              <span class="demo-photo__label">${esc(p.demoLabel ?? p.alt)}</span>
            </label>`;
          }).join('')}
        </div>
      </fieldset>

      <div class="field photo-block">
        <p class="field__label">② お手元の写真を選ぶ <span class="badge">プレビューのみ</span></p>
        <p class="field__hint">選んだ写真は<strong>この画面で表示するだけ</strong>で、送信・保存はしません。画面を離れたり再読み込みしたりすると消えます。JPEG・PNG・WebP、1枚5MBまで。</p>
        <label class="btn file-btn ${full ? 'is-disabled' : ''}">
          ${icon('upload')}<span>写真を選ぶ</span>
          <input class="file-input" data-file-button type="file" name="localPhoto" accept="image/jpeg,image/png,image/webp" multiple ${full ? 'disabled' : ''} aria-label="お手元の写真を選ぶ（プレビューのみ）" />
        </label>
        ${
          this.localPhotos.length
            ? `<ul class="local-photos">${this.localPhotos
                .map(
                  (p, i) => `<li class="local-photo">
                    <img src="${p.url}" alt="選んだ写真${i + 1}のプレビュー" />
                    <span>写真${i + 1}（${(p.size / 1024 / 1024).toFixed(1)}MB）</span>
                    <button type="button" class="btn btn--small btn--plain" data-action="remove-photo" data-key="${p.key}">${icon('trash')}削除</button>
                  </li>`,
                )
                .join('')}</ul>`
            : ''
        }
      </div>`;
  }

  private renderPhotos(): void {
    const box = this.root.querySelector('[data-photos]');
    if (box) box.innerHTML = this.photosHtml();
  }

  /* ---------- 画面描画 ---------- */

  private render(moveFocus: boolean): void {
    const stepper = `<ol class="stepper" aria-label="入力の手順">${STEPS.map(
      (name, i) =>
        `<li class="stepper__item ${i < this.step ? 'is-done' : ''} ${i === this.step ? 'is-current' : ''}" ${
          i === this.step ? 'aria-current="step"' : ''
        }><span class="stepper__no">${i < this.step ? icon('check') : i + 1}</span><span class="stepper__name">${name}</span></li>`,
    ).join('')}</ol>`;
    const toolbar =
      this.step < 3
        ? `<div class="form-toolbar"><button type="button" class="btn btn--small btn--plain" data-action="sample">${icon('fileText')}サンプル情報を入力する</button><span class="note">デモ体験用の架空の内容が入ります。</span></div>`
        : '';
    const body = [this.step1, this.step2, this.step3, this.step4, this.step5][this.step].call(this);
    this.root.innerHTML = `${toolbar}${stepper}<form class="form-step" novalidate>${body}</form>`;
    if (this.step === 2) this.renderDateErrors();
    if (moveFocus) {
      const h = this.root.querySelector<HTMLElement>('.form-step__title');
      h?.focus({ preventScroll: true });
      this.root.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }

  private head(title: string, desc: string): string {
    return `<h2 class="form-step__title" tabindex="-1"><span class="form-step__count">手順 ${this.step + 1}/5</span>${title}</h2><p class="form-step__desc">${desc}</p>`;
  }

  private nav(nextLabel = '次へ進む'): string {
    return `<div class="form-nav">
      ${this.step > 0 ? `<button type="button" class="btn btn--plain" data-action="back">戻る</button>` : '<span></span>'}
      <button type="button" class="btn btn--primary" data-action="next">${nextLabel}${icon('chevronRight')}</button>
    </div>`;
  }

  private handoffBox(): string {
    if (!this.handoff) return '';
    const est = this.handoffEstimate();
    if (!est) {
      return `<p class="notice notice--info">${icon('info')}<span>費用の目安から内容を引き継ぎましたが、作業内容や面積を変更したため、概算は相談内容に含めません（写真・現地確認後にお見積もり）。</span></p>`;
    }
    return `<div class="handoff">
      <p class="handoff__title">${icon('calculator')}費用の目安から引き継いだ内容</p>
      <p class="handoff__amount">${esc(est.summary)}</p>
      <ul>${est.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <p class="note">概算は確定金額ではありません。作業内容や面積を変更すると、概算は引き継がれません。</p>
    </div>`;
  }

  private step1(): string {
    const s = this.s;
    return `${this.head('困りごと・作業内容', '分かる範囲で選んでください。作業名が分からない場合も、そのまま相談できます。')}
      ${this.handoffBox()}
      <fieldset class="field" aria-describedby="err-mainWork">
        <legend>主な作業 <span class="badge badge--req">必須</span></legend>
        <div class="choices choices--2">
          ${(['kusakari', 'kusatori', 'bassai', 'unknown'] as MainWorkId[])
            .map((w) => radio('mainWork', w, esc(WORK_LABELS[w]), s.mainWork === w))
            .join('')}
        </div>
        ${this.err('mainWork')}
      </fieldset>
      <fieldset class="field">
        <legend>追加で相談したいこと <span class="badge">任意・複数可</span></legend>
        <div class="choices choices--2">
          ${EXTRA_OPTIONS.map((x) =>
            radioOrCheck(x.id, x.label, s.extras.includes(x.id), x.id === s.mainWork),
          ).join('')}
        </div>
        <p class="field__hint">追加の作業は、個別にお見積もりします。</p>
      </fieldset>
      <div class="field">
        <label class="field__label" for="f-trouble">困っていること <span class="badge">任意</span></label>
        <textarea id="f-trouble" class="textarea" name="trouble" rows="4" placeholder="例：実家の敷地の草が伸びて、近所に迷惑をかけていないか心配です。">${esc(s.trouble)}</textarea>
      </div>
      <fieldset class="field" aria-describedby="err-placeType">
        <legend>場所の種類 <span class="badge badge--req">必須</span></legend>
        <div class="choices choices--2">${PLACE_TYPES.map((p) => radio('placeType', p.id, p.label, s.placeType === p.id)).join('')}</div>
        ${this.err('placeType')}
      </fieldset>
      ${this.nav()}`;

    function radioOrCheck(id: string, label: string, checked: boolean, disabled: boolean): string {
      return checkbox('extras', id, esc(label) + (disabled ? '<small>（主な作業で選択中）</small>' : ''), checked && !disabled, disabled ? 'disabled' : '');
    }
  }

  private step2(): string {
    const s = this.s;
    const tree = s.mainWork === 'bassai';
    const grassFields = `
      <div class="field">
        <label class="field__label" for="f-area">おおよその面積 <span class="badge">任意</span></label>
        <div class="area-row">
          <input id="f-area" class="input input--area" name="area" type="text" inputmode="decimal" autocomplete="off" value="${esc(s.areaText)}" ${
            s.areaUnknown ? 'disabled' : ''
          } aria-describedby="f-area-conv err-area" placeholder="${s.unit === 'm2' ? '例：100' : '例：30'}" />
          <div class="unit-toggle" role="radiogroup" aria-label="面積の単位">
            <label><input type="radio" name="unit" value="m2" ${s.unit === 'm2' ? 'checked' : ''} />㎡</label>
            <label><input type="radio" name="unit" value="tsubo" ${s.unit === 'tsubo' ? 'checked' : ''} />坪</label>
          </div>
        </div>
        <p id="f-area-conv" class="note" data-area-conv>${this.areaConvText()}</p>
        ${this.err('area')}
        ${checkbox('areaUnknown', '1', '分からない<small>写真で確認します</small>', s.areaUnknown)}
      </div>
      <fieldset class="field">
        <legend>草の高さ <span class="badge">任意</span></legend>
        <div class="choices choices--2">${GRASS_HEIGHTS.map((h) => radio('grassHeight', h.id, h.label, s.grassHeight === h.id)).join('')}</div>
      </fieldset>`;
    const treeFields = `
      <fieldset class="field">
        <legend>おおよその木の高さ <span class="badge">任意</span></legend>
        <div class="choices choices--2">${TREE_HEIGHTS.map((h) => radio('treeHeight', h.id, h.label, s.treeHeight === h.id)).join('')}</div>
      </fieldset>
      <fieldset class="field">
        <legend>本数 <span class="badge">任意</span></legend>
        <div class="choices choices--2">${TREE_COUNTS.map((h) => radio('treeCount', h.id, h.label, s.treeCount === h.id)).join('')}</div>
      </fieldset>
      <fieldset class="field">
        <legend>木のまわりの状況 <span class="badge">任意・複数可</span></legend>
        <div class="choices choices--2">${TREE_SURROUNDINGS.map((h) => checkbox('surroundings', h.id, h.label, s.surroundings.includes(h.id))).join('')}</div>
      </fieldset>`;
    return `${this.head('場所の状態・写真', '詳しい寸法や住所の番地は不要です。分かる範囲で教えてください。')}
      ${s.mainWork === 'unknown' ? `<p class="notice notice--info">${icon('info')}<span>作業名が分からない場合は、草の様子だけ教えてください。木についての相談は、下の「その他の状態」に書いてください。</span></p>` : ''}
      ${tree ? treeFields : grassFields}
      <div class="field">
        <label class="field__label" for="f-siteNote">その他の状態 <span class="badge">任意</span></label>
        <textarea id="f-siteNote" class="textarea" name="siteNote" rows="3" placeholder="例：傾斜がある、物置がある、車を停める場所がある など">${esc(s.siteNote)}</textarea>
      </div>
      <section class="photos" aria-labelledby="photos-title">
        <h3 id="photos-title" class="photos__title">${icon('camera')}写真 <span class="badge">任意・合計5枚まで</span></h3>
        <div data-photos>${this.photosHtml()}</div>
      </section>
      ${this.nav()}`;
  }

  private areaConvText(): string {
    const s = this.s;
    if (s.areaUnknown) return '面積は写真で確認します。';
    if (s.areaM2 === null) return '㎡と坪は切り替えられます（1坪 ≒ 3.31㎡）。';
    return `${describeArea(s.areaM2)}`;
  }

  private updateAreaConv(): void {
    const el = this.root.querySelector('[data-area-conv]');
    if (el) el.textContent = this.areaConvText();
  }

  private step3(): string {
    const s = this.s;
    const min = addDays(this.today, 1);
    const dateField = (i: number) => `
      <div class="date-field">
        <label class="field__label" for="f-date${i}">第${i + 1}希望</label>
        <div class="date-field__row">
          <input id="f-date${i}" class="input input--date" type="date" name="date${i}" min="${min}" value="${esc(s.dates[i])}" aria-describedby="err-date${i}" />
          ${s.dates[i] ? `<button type="button" class="btn btn--small btn--plain" data-action="clear-date" data-index="${i}">${icon('x')}クリア</button>` : ''}
        </div>
        <p class="date-field__label" data-date-label="${i}"></p>
        <p class="field__error" data-error-for="date${i}" id="err-date${i}" role="alert"></p>
      </div>`;
    return `${this.head('連絡先・希望日', '氏名と電話番号は、デモ用の架空の内容を入力してください。')}
      <fieldset class="field" aria-describedby="err-areaId">
        <legend>対応エリア <span class="badge badge--req">必須</span></legend>
        <div class="choices choices--2">
          ${SERVICE_AREAS.map((a) => radio('areaId', a.id, a.label, s.areaId === a.id)).join('')}
          ${radio('areaId', AREA_OTHER.id, AREA_OTHER.label, s.areaId === AREA_OTHER.id)}
        </div>
        ${this.err('areaId')}
      </fieldset>
      <fieldset class="field">
        <legend>現地確認・相談の希望日 <span class="badge">任意・3つまで</span></legend>
        <p class="field__hint">明日以降の営業日を選んでください。日曜日は休業（5〜9月は相談対応）、年末年始（12/30〜1/3）は休業です。<strong>希望日は確定ではありません。</strong>日程は後日相談して決めます。</p>
        <div class="dates">${[0, 1, 2].map(dateField).join('')}</div>
      </fieldset>
      <fieldset class="field" aria-describedby="err-attendance">
        <legend>当日の立ち会い <span class="badge badge--req">必須</span></legend>
        <div class="choices choices--2">
          ${radio('attendance', 'yes', '立ち会いできる', s.attendance === 'yes')}
          ${radio('attendance', 'no', '立ち会いは難しい', s.attendance === 'no')}
          ${radio('attendance', 'consult', 'まだ分からない・相談したい', s.attendance === 'consult')}
        </div>
        ${this.err('attendance')}
        ${checkbox('farAway', '1', '遠方に住んでいる<small>写真での報告など、方法を相談します</small>', s.farAway)}
      </fieldset>
      <div class="field">
        <label class="field__label" for="f-name">お名前 <span class="badge badge--req">必須</span></label>
        <input id="f-name" class="input" name="name" type="text" autocomplete="off" value="${esc(s.name)}" aria-describedby="err-name" placeholder="例：見本 太郎" />
        ${this.err('name')}
      </div>
      <div class="field">
        <label class="field__label" for="f-phone">電話番号 <span class="badge badge--req">必須</span></label>
        <input id="f-phone" class="input" name="phone" type="tel" inputmode="tel" autocomplete="off" value="${esc(s.phone)}" aria-describedby="hint-phone err-phone" placeholder="例：000-0000-0000" />
        <p id="hint-phone" class="field__hint">デモでは 000-0000-0000 のような架空の番号を入力してください。</p>
        ${this.err('phone')}
      </div>
      <div class="field">
        <label class="field__label" for="f-email">メールアドレス <span class="badge">任意</span></label>
        <input id="f-email" class="input" name="email" type="email" inputmode="email" autocomplete="off" value="${esc(s.email)}" aria-describedby="err-email" placeholder="例：sample@example.com" />
        ${this.err('email')}
      </div>
      <div class="field">
        <label class="field__label" for="f-message">その他のご要望 <span class="badge">任意</span></label>
        <textarea id="f-message" class="textarea" name="message" rows="3">${esc(s.message)}</textarea>
      </div>
      ${this.nav('入力内容を確認する')}`;
  }

  private siteLines(): string[] {
    const s = this.s;
    if (s.mainWork === 'bassai') {
      const lines = [`木の高さ：${labelOf(TREE_HEIGHTS, s.treeHeight ?? 'unknown')}`, `本数：${labelOf(TREE_COUNTS, s.treeCount ?? 'unknown')}`];
      if (s.surroundings.length) lines.push(`まわり：${s.surroundings.map((x) => labelOf(TREE_SURROUNDINGS, x)).join('／')}`);
      return lines;
    }
    return [
      `面積：${s.areaUnknown || s.areaM2 === null ? '分からない' : describeArea(s.areaM2)}`,
      `草の高さ：${s.grassHeight ? labelOf(GRASS_HEIGHTS, s.grassHeight) : '未選択'}`,
    ];
  }

  private step4(): string {
    const s = this.s;
    const est = this.handoffEstimate();
    const dates = s.dates.filter(Boolean);
    const row = (k: string, v: string) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
    const section = (title: string, step: number, rows: string) => `
      <section class="confirm__section">
        <div class="confirm__head"><h3>${title}</h3><button type="button" class="text-btn" data-action="goto" data-step="${step}">修正する</button></div>
        <dl class="confirm__list">${rows}</dl>
      </section>`;
    return `${this.head('入力内容の確認', 'この内容でデモ相談を受け付けます。送信・見積もり・作業予約は行われません。')}
      ${this.saveError ? `<div class="notice notice--error" role="alert">${icon('alert')}<div><p><strong>保存できなかったため、受付は完了していません。</strong></p><p>${esc(this.saveError)}</p><p>ブラウザのプライベートモードや保存容量の設定をご確認のうえ、もう一度お試しください。</p></div></div>` : ''}
      ${section(
        '困りごと・作業内容',
        0,
        row('主な作業', esc(WORK_LABELS[s.mainWork!])) +
          row('追加で相談したいこと', s.extras.length ? s.extras.map((x) => esc(extraLabel(x))).join('<br />') : 'なし') +
          row('困っていること', s.trouble ? esc(s.trouble).replace(/\n/g, '<br />') : '（未記入）') +
          row('場所の種類', esc(placeLabel(s.placeType ?? ''))),
      )}
      ${section(
        '場所の状態・写真',
        1,
        row('状態', this.siteLines().map(esc).join('<br />')) +
          row('その他の状態', s.siteNote ? esc(s.siteNote) : '（未記入）') +
          row(
            '写真',
            `${s.demoPhotoIds.length ? `デモ写真 ${s.demoPhotoIds.length}枚：${s.demoPhotoIds.map((id) => esc(getPhoto(id)?.demoLabel ?? id)).join('、')}` : 'デモ写真なし'}<br />
            ${this.localPhotos.length ? `お手元の写真 ${this.localPhotos.length}枚（プレビューのみ。送信・保存されません）` : 'お手元の写真なし'}`,
          ) +
          row('費用の目安', est ? `${esc(est.summary)}<br /><span class="note">${est.lines.map(esc).join('／')}</span>` : '概算なし（写真・現地確認後にお見積もり）'),
      )}
      ${section(
        '連絡先・希望日',
        2,
        row('対応エリア', esc(areaLabel(s.areaId ?? ''))) +
          row('希望日（確定ではありません）', dates.length ? dates.map((d, i) => `第${i + 1}希望：${formatYmd(d)}`).join('<br />') : '指定なし') +
          row('立ち会い', { yes: '立ち会いできる', no: '立ち会いは難しい', consult: 'まだ分からない・相談したい' }[s.attendance!]) +
          row('遠方にお住まい', s.farAway ? 'はい' : '—') +
          row('お名前', esc(s.name)) +
          row('電話番号', esc(s.phone)) +
          row('メールアドレス', s.email ? esc(s.email) : '（未記入）') +
          row('その他のご要望', s.message ? esc(s.message) : '（未記入）'),
      )}
      <p class="notice">${icon('info')}<span>このボタンを押しても、事業者への送信・見積もり・作業予約は行われません。内容はこのブラウザ内にだけ保存されます。</span></p>
      <div class="form-nav">
        <button type="button" class="btn btn--plain" data-action="back">戻る</button>
        <button type="button" class="btn btn--primary" data-action="submit" ${this.submitting ? 'disabled aria-disabled="true"' : ''}>${
          this.submitting ? '受付中…' : `${icon('check')}デモ相談を受け付ける`
        }</button>
      </div>`;
  }

  private step5(): string {
    const d = this.done!;
    return `<div class="done">
      <h2 class="form-step__title" tabindex="-1">${icon('check', 'icon done__icon')}デモ相談を受け付けました</h2>
      <dl class="done__no"><dt>受付番号</dt><dd>${esc(d.id)}</dd></dl>
      <p class="done__fixed"><strong>作業日・料金は確定していません。</strong><br />本番では、事業者が内容を確認してから、作業範囲・費用・日程をご連絡します。このデモでは連絡はありません。</p>
      <dl class="confirm__list">
        <div><dt>相談内容</dt><dd>${esc(WORK_LABELS[d.mainWork])}${d.extras.length ? `<br />追加：${d.extras.map((x) => esc(extraLabel(x))).join('、')}` : ''}</dd></div>
        <div><dt>場所</dt><dd>${esc(placeLabel(d.placeType))}／${esc(areaLabel(d.areaId))}</dd></div>
        <div><dt>希望日</dt><dd>${d.preferredDates.length ? d.preferredDates.map((x, i) => `第${i + 1}希望：${formatYmd(x)}`).join('<br />') : '指定なし'}</dd></div>
        <div><dt>費用の目安</dt><dd>${d.estimate ? esc(d.estimate.summary) : '写真・現地確認後にお見積もり'}</dd></div>
        <div><dt>写真</dt><dd>デモ写真 ${d.demoPhotoIds.length}枚${d.localPhotoCount ? `／お手元の写真 ${d.localPhotoCount}枚（保存していません）` : ''}</dd></div>
      </dl>
      <div class="done__actions">
        <a class="btn btn--primary" href="/admin">${icon('list')}管理画面で確認する（デモ）</a>
        <a class="btn" href="/">トップページへ戻る</a>
        <button type="button" class="btn btn--plain" data-action="restart">別の相談を入力する</button>
      </div>
    </div>`;
  }

  /* ---------- 手順の移動と検証 ---------- */

  private validate(step: number): string[] {
    const s = this.s;
    this.errors = {};
    if (step === 0) {
      if (!s.mainWork) this.errors.mainWork = '主な作業を選んでください（分からない場合は「作業名が分からない」）。';
      if (!s.placeType) this.errors.placeType = '場所の種類を選んでください。';
    }
    if (step === 1) {
      if (s.mainWork !== 'bassai' && !s.areaUnknown && s.areaText.trim() && s.areaM2 === null) {
        this.errors.area = '面積は0より大きい数字で入力してください（分からなければ「分からない」を選んでください）。';
      }
    }
    if (step === 2) {
      if (!s.areaId) this.errors.areaId = '対応エリアを選んでください（分からない場合は「エリア外・分からない」）。';
      if (!s.attendance) this.errors.attendance = '立ち会いについて選んでください。';
      if (!s.name.trim()) this.errors.name = 'お名前を入力してください（デモ用の架空の名前で構いません）。';
      const digits = s.phone.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[^0-9]/g, '');
      if (!s.phone.trim()) this.errors.phone = '電話番号を入力してください（000-0000-0000 のような架空の番号で構いません）。';
      else if (digits.length < 10 || digits.length > 11 || /[^0-9０-９\-－ー()（）\s]/.test(s.phone))
        this.errors.phone = '電話番号は10〜11桁の数字で入力してください（ハイフンはあってもなくても構いません）。';
      if (s.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email.trim())) this.errors.email = 'メールアドレスの形式を確認してください。';
      this.validateDates();
    }
    return Object.keys(this.errors);
  }

  private next(): void {
    const keys = this.validate(this.step);
    if (keys.length) {
      this.render(false);
      const first = keys[0];
      const target =
        this.root.querySelector<HTMLElement>(`[name="${first}"]:not([disabled])`) ??
        this.root.querySelector<HTMLElement>(`[data-error-for="${first}"]`);
      target?.focus();
      return;
    }
    this.go(this.step + 1);
  }

  private go(step: number): void {
    if (step < 0 || step > 3) return;
    this.saveError = '';
    this.photoMessages = [];
    this.step = step;
    this.render(true);
  }

  private async submit(): Promise<void> {
    if (this.submitting || this.done) return; // 二重クリック防止
    this.submitting = true;
    this.saveError = '';
    this.render(false);
    const s = this.s;
    try {
      const inquiry = await repository.create({
        token: this.token,
        mainWork: s.mainWork!,
        extras: s.extras,
        trouble: s.trouble.trim(),
        placeType: s.placeType!,
        areaId: s.areaId!,
        site:
          s.mainWork === 'bassai'
            ? {
                areaM2: null,
                treeHeight: s.treeHeight ?? 'unknown',
                treeCount: s.treeCount ?? 'unknown',
                surroundings: s.surroundings,
                note: s.siteNote.trim(),
              }
            : { areaM2: s.areaUnknown ? null : s.areaM2, grassHeight: s.grassHeight ?? 'unknown', note: s.siteNote.trim() },
        preferredDates: s.dates.filter(Boolean),
        attendance: s.attendance!,
        farAway: s.farAway,
        name: s.name.trim(),
        phone: s.phone.trim(),
        email: s.email.trim(),
        message: s.message.trim(),
        estimate: this.handoffEstimate(),
        demoPhotoIds: [...s.demoPhotoIds],
        localPhotoCount: this.localPhotos.length,
      });
      this.done = inquiry;
      this.submitting = false;
      clearHandoff();
      this.releaseLocal();
      this.step = 4;
      this.render(true);
    } catch (e) {
      this.submitting = false;
      this.saveError = e instanceof StorageError ? e.message : '予期しないエラーが発生しました。';
      this.render(false);
      this.root.querySelector<HTMLElement>('.notice--error')?.scrollIntoView({ block: 'center' });
    }
  }

  private restart(): void {
    this.releaseLocal();
    this.s = emptyState();
    this.handoff = null;
    this.done = null;
    this.token = newToken();
    this.errors = {};
    this.step = 0;
    history.replaceState(null, '', '/estimate');
    this.render(true);
  }

  private fillSample(): void {
    const t = this.today;
    this.s = {
      ...emptyState(),
      mainWork: 'kusakari',
      extras: ['disposal'],
      trouble: '遠方に住んでいて、実家の敷地の草が伸びているのが気になります。（サンプル）',
      placeType: 'family-home',
      areaM2: 100,
      areaText: '100',
      grassHeight: 'mid',
      siteNote: '敷地の奥に物置があります。（サンプル）',
      demoPhotoIds: ['overgrown-yard'],
      areaId: 'town-b',
      dates: [nextOpenDay(t, 2), nextOpenDay(t, 4), ''],
      attendance: 'no',
      farAway: true,
      name: '見本 太郎（サンプル）',
      phone: '000-0000-0000',
      email: 'sample@example.com',
      message: '作業前後の写真を送ってもらえると助かります。（サンプル）',
    };
    // 引き継いだ概算とは条件が変わるので、概算は引き継がない
    this.errors = {};
    this.validateDates();
    this.photoMessages = [];
    this.render(false);
    const msg = document.createElement('p');
    msg.className = 'notice notice--info sample-msg';
    msg.setAttribute('role', 'status');
    msg.innerHTML = `${icon('info')}<span>サンプル情報を入力しました。各手順で内容を確認できます。</span>`;
    this.root.querySelector('.form-step')?.prepend(msg);
  }
}

initCommon();
try {
  const root = document.querySelector<HTMLElement>('[data-estimate-app]');
  if (root) new EstimateApp(root);
} catch (e) {
  console.error(e);
  const root = document.querySelector<HTMLElement>('[data-estimate-app]');
  if (root) root.innerHTML = '<p class="notice notice--error">フォームを表示できませんでした。ページを再読み込みしてください。</p>';
}
