import '../styles/base.css';
import '../styles/admin.css';
import { initCommon, esc } from '../ui/common.ts';
import { icon } from '../ui/icons.ts';
import { areaLabel, placeLabel } from '../data/business.ts';
import { WORK_LABELS, extraLabel } from '../data/services.ts';
import { GRASS_HEIGHTS, TREE_COUNTS, TREE_HEIGHTS, TREE_SURROUNDINGS, labelOf } from '../data/pricing.ts';
import { dayStatus, formatYmd, parseYmd, todayJst, weekday } from '../data/calendar.ts';
import { getPhoto, photoSrc } from '../data/photos.ts';
import { describeArea } from '../lib/area.ts';
import {
  STATUSES,
  StorageError,
  isAdminAuthed,
  repository,
  setAdminAuthed,
  type Inquiry,
  type InquiryStatus,
} from '../lib/storage.ts';

const DEMO_PASSWORD = 'demo';
const ATTENDANCE: Record<Inquiry['attendance'], string> = {
  yes: '立ち会いできる',
  no: '立ち会いは難しい',
  consult: 'まだ分からない・相談したい',
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function statusBadge(s: InquiryStatus): string {
  const cls = {
    新規: 'new',
    確認中: 'checking',
    見積もり提示済み: 'quoted',
    作業日確定: 'fixed',
    完了: 'done',
    キャンセル: 'cancel',
  }[s];
  return `<span class="status status--${cls}">${s}</span>`;
}

class AdminApp {
  private root: HTMLElement;
  private items: Inquiry[] = [];
  private selectedId: string | null = null;
  private view: 'list' | 'calendar' = 'list';
  private filter: InquiryStatus | 'all' = 'all';
  private month: { y: number; m: number };
  private flash = '';
  private formError = '';

  constructor(root: HTMLElement) {
    this.root = root;
    const t = parseYmd(todayJst())!;
    this.month = { y: t.y, m: t.m };
    root.addEventListener('click', (e) => void this.onClick(e));
    root.addEventListener('submit', (e) => void this.onSubmit(e));
    root.addEventListener('change', (e) => this.onChange(e.target as HTMLInputElement));
    void this.start();
  }

  private async start(): Promise<void> {
    if (!isAdminAuthed()) {
      this.renderGate();
      return;
    }
    await this.reload();
  }

  private async reload(): Promise<void> {
    this.items = await repository.list();
    this.render();
  }

  /* ---------- ログイン（簡易・デモ用） ---------- */

  private renderGate(error = ''): void {
    this.root.innerHTML = `<section class="gate" aria-labelledby="gate-title">
      <h1 id="gate-title" class="gate__title">${icon('lock')}案件管理（デモ）</h1>
      <p class="notice notice--info">${icon('info')}<span>デモ用の簡易パスワードは <strong>demo</strong> です。<br />本番の認証機能ではありません。</span></p>
      <form class="gate__form" data-form="login" novalidate>
        <div class="field">
          <label class="field__label" for="pw">パスワード</label>
          <input id="pw" class="input" type="password" name="password" autocomplete="off" aria-describedby="pw-error" ${error ? 'aria-invalid="true"' : ''} />
          <p id="pw-error" class="field__error" role="alert">${error ? `${icon('alert')}<span>${esc(error)}</span>` : ''}</p>
        </div>
        <button class="btn btn--primary btn--block" type="submit">管理画面を開く</button>
      </form>
    </section>`;
    this.root.querySelector<HTMLInputElement>('#pw')?.focus();
  }

  /* ---------- 画面 ---------- */

  private render(focusSel?: string): void {
    const selected = this.items.find((i) => i.id === this.selectedId) ?? null;
    this.root.innerHTML = `
      <div class="admin-top">
        <h1 class="admin-title">相談案件の管理</h1>
        <div class="admin-top__actions">
          <button type="button" class="btn btn--small btn--plain" data-action="reset">${icon('refresh')}デモ初期化</button>
          <button type="button" class="btn btn--small btn--plain" data-action="logout">ログアウト</button>
        </div>
      </div>
      <p class="notice notice--info admin-note">${icon('info')}<span>データは<strong>このブラウザ内だけ</strong>に保存されます。別の端末への共有や、新しい相談の通知は行われません。「デモ初期化」は、このサイトが保存したデータだけを削除してサンプル案件に戻します。</span></p>
      ${this.flash ? `<p class="notice notice--info flash" role="status">${icon('check')}<span>${esc(this.flash)}</span></p>` : ''}
      <div class="admin-tabs" role="tablist" aria-label="表示の切り替え">
        <button type="button" role="tab" id="tab-list" aria-controls="panel" aria-selected="${this.view === 'list'}" data-action="view" data-view="list">${icon('list')}案件一覧</button>
        <button type="button" role="tab" id="tab-calendar" aria-controls="panel" aria-selected="${this.view === 'calendar'}" data-action="view" data-view="calendar">${icon('calendar')}作業予定カレンダー</button>
      </div>
      <div id="panel" role="tabpanel" aria-labelledby="tab-${this.view}" class="admin-layout ${selected ? 'has-detail' : ''}">
        <div class="admin-main">${this.view === 'list' ? this.listHtml() : this.calendarHtml()}</div>
        ${selected ? `<aside class="admin-detail" aria-labelledby="detail-title">${this.detailHtml(selected)}</aside>` : ''}
      </div>`;
    this.flash = '';
    if (focusSel) this.root.querySelector<HTMLElement>(focusSel)?.focus();
  }

  private listHtml(): string {
    const counts = new Map<string, number>();
    this.items.forEach((i) => counts.set(i.status, (counts.get(i.status) ?? 0) + 1));
    const rows = this.items.filter((i) => this.filter === 'all' || i.status === this.filter);
    const est = (i: Inquiry) => (i.estimate ? (i.estimate.calculated ? esc(i.estimate.summary) : '要見積もり') : 'なし');
    const hopes = (i: Inquiry) => (i.preferredDates.length ? i.preferredDates.map((d) => formatYmd(d).replace(/^\d+年/, '')).join('<br />') : '指定なし');
    return `
      <div class="list-tools">
        <label class="field__label" for="filter">状況で絞り込み</label>
        <select id="filter" class="select" name="filter">
          <option value="all" ${this.filter === 'all' ? 'selected' : ''}>すべて（${this.items.length}件）</option>
          ${STATUSES.map((s) => `<option value="${s}" ${this.filter === s ? 'selected' : ''}>${s}（${counts.get(s) ?? 0}件）</option>`).join('')}
        </select>
      </div>
      ${
        rows.length === 0
          ? '<p class="empty">該当する案件はありません。</p>'
          : `<div class="table-wrap"><table class="case-table">
        <caption class="visually-hidden">相談案件の一覧</caption>
        <thead><tr><th scope="col">受付番号・受付日</th><th scope="col">相談者</th><th scope="col">作業</th><th scope="col">場所・エリア</th><th scope="col">希望日</th><th scope="col">概算</th><th scope="col">状況・確定作業日</th></tr></thead>
        <tbody>${rows
          .map(
            (i) => `<tr class="${i.id === this.selectedId ? 'is-selected' : ''}">
            <td><button type="button" class="link-btn" data-action="open" data-id="${i.id}">${esc(i.id)}</button><br /><span class="note">${formatDateTime(i.createdAt)}</span></td>
            <td>${esc(i.name)}</td>
            <td>${esc(WORK_LABELS[i.mainWork])}${i.extras.length ? `<br /><span class="note">＋${i.extras.map((x) => esc(extraLabel(x).replace(/について.*|も相談したい/, ''))).join('、')}</span>` : ''}</td>
            <td>${esc(placeLabel(i.placeType))}<br /><span class="note">${esc(areaLabel(i.areaId))}</span></td>
            <td class="nowrap">${hopes(i)}</td>
            <td>${est(i)}</td>
            <td>${statusBadge(i.status)}${i.confirmedDate ? `<br /><span class="fixed-date">${icon('calendar')}${formatYmd(i.confirmedDate)}</span>` : ''}</td>
          </tr>`,
          )
          .join('')}</tbody></table></div>
        <ul class="case-cards">${rows
          .map(
            (i) => `<li class="case-card ${i.id === this.selectedId ? 'is-selected' : ''}">
            <div class="case-card__head">${statusBadge(i.status)}<span class="note">${formatDateTime(i.createdAt)}</span></div>
            <p class="case-card__title">${esc(WORK_LABELS[i.mainWork])}｜${esc(i.name)}</p>
            <dl class="case-card__meta">
              <div><dt>受付番号</dt><dd>${esc(i.id)}</dd></div>
              <div><dt>場所</dt><dd>${esc(placeLabel(i.placeType))}・${esc(areaLabel(i.areaId))}</dd></div>
              <div><dt>希望日</dt><dd>${hopes(i)}</dd></div>
              <div><dt>確定作業日</dt><dd>${i.confirmedDate ? formatYmd(i.confirmedDate) : '未確定'}</dd></div>
            </dl>
            <button type="button" class="btn btn--small btn--block" data-action="open" data-id="${i.id}">詳細・対応状況を見る${icon('chevronRight')}</button>
          </li>`,
          )
          .join('')}</ul>`
      }`;
  }

  private detailHtml(i: Inquiry): string {
    const row = (k: string, v: string) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
    const site =
      i.mainWork === 'bassai'
        ? [
            `木の高さ：${labelOf(TREE_HEIGHTS, i.site.treeHeight ?? 'unknown')}`,
            `本数：${labelOf(TREE_COUNTS, i.site.treeCount ?? 'unknown')}`,
            ...(i.site.surroundings?.length ? [`まわり：${i.site.surroundings.map((s) => labelOf(TREE_SURROUNDINGS, s)).join('／')}`] : []),
          ]
        : [
            `面積：${i.site.areaM2 ? describeArea(i.site.areaM2) : '分からない'}`,
            `草の高さ：${labelOf(GRASS_HEIGHTS, i.site.grassHeight ?? 'unknown')}`,
          ];
    if (i.site.note) site.push(`その他：${i.site.note}`);
    const photos = i.demoPhotoIds
      .map((id) => getPhoto(id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map(
        (p) => `<figure class="detail-photo"><img src="${photoSrc(p.id, 480)}" alt="${esc(p.alt)}" width="480" height="${Math.round((p.height / p.width) * 480)}" loading="lazy" /><figcaption>デモ写真：${esc(p.demoLabel ?? '')}<br /><span class="note">素材ID ${esc(p.id)}</span></figcaption></figure>`,
      )
      .join('');
    const needsDate = i.status === '作業日確定';
    return `
      <div class="detail-head">
        <button type="button" class="btn btn--small btn--plain detail-back" data-action="close">${icon('chevronRight', 'icon icon--flip')}一覧に戻る</button>
        <button type="button" class="icon-btn detail-close" data-action="close" aria-label="詳細を閉じる">${icon('x')}</button>
      </div>
      <h2 id="detail-title" class="detail-title" tabindex="-1">${esc(i.id)} ${statusBadge(i.status)}</h2>
      ${i.isSample ? '<p class="note">初期表示用の架空のサンプル案件です。</p>' : ''}
      <dl class="detail-list">
        ${row('受付日時', formatDateTime(i.createdAt))}
        ${row('相談者（サンプル）', `${esc(i.name)}<br />${esc(i.phone)}${i.email ? `<br />${esc(i.email)}` : ''}`)}
        ${row('主な作業', esc(WORK_LABELS[i.mainWork]))}
        ${row('追加で相談', i.extras.length ? i.extras.map((x) => esc(extraLabel(x))).join('<br />') : 'なし')}
        ${row('困りごと', i.trouble ? esc(i.trouble) : '（未記入）')}
        ${row('場所の種類', esc(placeLabel(i.placeType)))}
        ${row('対応エリア', esc(areaLabel(i.areaId)))}
        ${row('場所の状態', site.map(esc).join('<br />'))}
        ${row('立ち会い', `${ATTENDANCE[i.attendance]}${i.farAway ? '<br />遠方にお住まい' : ''}`)}
        ${row('その他の要望', i.message ? esc(i.message) : '（未記入）')}
      </dl>

      <section class="detail-block">
        <h3>相談者の希望日 <span class="note">（確定日ではありません）</span></h3>
        ${
          i.preferredDates.length
            ? `<ol class="hope-list">${i.preferredDates.map((d, n) => `<li>第${n + 1}希望：${formatYmd(d)}</li>`).join('')}</ol>`
            : '<p>指定なし</p>'
        }
      </section>

      <section class="detail-block">
        <h3>費用の目安</h3>
        ${
          i.estimate
            ? `<p class="detail-estimate">${esc(i.estimate.summary)}</p><ul class="small-list">${i.estimate.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>${
                i.estimate.calculated ? '<p class="note">相談者が「費用の目安」で算出した架空の概算です（確定金額ではありません）。</p>' : ''
              }`
            : '<p>概算なし（写真・現地確認後にお見積もり）</p>'
        }
      </section>

      <section class="detail-block">
        <h3>写真</h3>
        ${photos ? `<div class="detail-photos">${photos}</div>` : '<p>デモ写真の選択なし</p>'}
        ${
          i.localPhotoCount
            ? `<p class="notice">${icon('image')}<span>相談者が選んだ写真 ${i.localPhotoCount}枚：<strong>デモでは写真を保存していません。</strong></span></p>`
            : ''
        }
      </section>

      <form class="detail-block detail-form" data-form="status" data-id="${i.id}" novalidate>
        <h3>対応状況</h3>
        ${this.formError ? `<p class="notice notice--error" role="alert">${icon('alert')}<span>${esc(this.formError)}</span></p>` : ''}
        <div class="field">
          <label class="field__label" for="d-status">状況</label>
          <select id="d-status" class="select" name="status">
            ${STATUSES.map((s) => `<option value="${s}" ${i.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="d-date">確定した作業日 <span class="badge ${needsDate ? 'badge--req' : ''}" data-date-badge>${needsDate ? '必須' : '「作業日確定」で必須'}</span></label>
          <input id="d-date" class="input input--date" type="date" name="confirmedDate" value="${i.confirmedDate ?? ''}" aria-describedby="d-date-hint" />
          <p id="d-date-hint" class="field__hint">希望日は自動では入りません。相談者と決めた日を入力してください。</p>
        </div>
        <div class="field">
          <label class="field__label" for="d-memo">対応メモ</label>
          <textarea id="d-memo" class="textarea" name="memo" rows="3">${esc(i.adminMemo)}</textarea>
        </div>
        <button type="submit" class="btn btn--primary btn--block">対応状況を保存</button>
      </form>`;
  }

  private calendarHtml(): string {
    const { y, m } = this.month;
    const first = `${y}-${String(m).padStart(2, '0')}-01`;
    const startW = weekday(first);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const today = todayJst();
    const fixed = this.items.filter((i) => i.confirmedDate && (i.status === '作業日確定' || i.status === '完了'));
    const cells: string[] = [];
    for (let k = 0; k < startW; k++) cells.push('<div class="cal__cell cal__cell--empty" aria-hidden="true"></div>');
    for (let d = 1; d <= days; d++) {
      const ymd = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const events = fixed.filter((i) => i.confirmedDate === ymd);
      const st = dayStatus(ymd, '0000-00-00');
      const closed = st === 'closed-sunday' || st === 'closed-yearend';
      cells.push(`<div class="cal__cell ${closed ? 'is-closed' : ''} ${ymd === today ? 'is-today' : ''}">
        <span class="cal__day">${d}${closed ? '<small>休</small>' : ''}${ymd === today ? '<small class="cal__today">今日</small>' : ''}</span>
        ${events
          .map(
            (i) =>
              `<button type="button" class="cal__event ${i.status === '完了' ? 'is-done' : ''}" data-action="open" data-id="${i.id}">${esc(WORK_LABELS[i.mainWork].replace(/（.*/, ''))}<span>${esc(i.name.replace(/（サンプル）/, ''))}</span></button>`,
          )
          .join('')}
      </div>`);
    }
    const monthFixed = fixed
      .filter((i) => i.confirmedDate!.startsWith(`${y}-${String(m).padStart(2, '0')}`))
      .sort((a, b) => a.confirmedDate!.localeCompare(b.confirmedDate!));
    const hopes = this.items
      .filter((i) => i.status !== 'キャンセル' && i.status !== '完了' && i.status !== '作業日確定')
      .flatMap((i) => i.preferredDates.map((d, n) => ({ d, n, i })))
      .sort((a, b) => a.d.localeCompare(b.d));
    return `
      <section class="cal" aria-labelledby="cal-title">
        <div class="cal__head">
          <button type="button" class="btn btn--small btn--plain" data-action="month" data-delta="-1" aria-label="前の月">${icon('chevronRight', 'icon icon--flip')}前の月</button>
          <h2 id="cal-title" class="cal__title" aria-live="polite">${y}年${m}月の作業予定</h2>
          <button type="button" class="btn btn--small btn--plain" data-action="month" data-delta="1" aria-label="次の月">次の月${icon('chevronRight')}</button>
        </div>
        <p class="note">カレンダーには<strong>確定した作業日</strong>だけを表示します（「作業日確定」「完了」の案件）。希望日は下の一覧で確認できます。</p>
        <div class="cal__grid" aria-hidden="false">
          ${['日', '月', '火', '水', '木', '金', '土'].map((w) => `<div class="cal__w">${w}</div>`).join('')}
          ${cells.join('')}
        </div>
        <div class="cal__list">
          <h3>この月の確定作業日</h3>
          ${
            monthFixed.length
              ? `<ul>${monthFixed.map((i) => `<li><strong>${formatYmd(i.confirmedDate!)}</strong> ${esc(WORK_LABELS[i.mainWork])}／${esc(i.name)} <button type="button" class="link-btn" data-action="open" data-id="${i.id}">${esc(i.id)}</button></li>`).join('')}</ul>`
              : '<p>この月に確定した作業日はありません。</p>'
          }
        </div>
      </section>
      <section class="hopes" aria-labelledby="hopes-title">
        <h2 id="hopes-title" class="hopes__title">未確定の案件の希望日（確定日ではありません）</h2>
        ${
          hopes.length
            ? `<div class="table-wrap"><table class="case-table case-table--simple"><thead><tr><th scope="col">希望日</th><th scope="col">順位</th><th scope="col">案件</th><th scope="col">状況</th></tr></thead><tbody>${hopes
                .map(
                  (h) =>
                    `<tr><td class="nowrap">${formatYmd(h.d)}</td><td>第${h.n + 1}希望</td><td><button type="button" class="link-btn" data-action="open" data-id="${h.i.id}">${esc(h.i.id)}</button> ${esc(h.i.name)}</td><td>${statusBadge(h.i.status)}</td></tr>`,
                )
                .join('')}</tbody></table></div>`
            : '<p>未確定の希望日はありません。</p>'
        }
      </section>`;
  }

  /* ---------- 操作 ---------- */

  private async onClick(e: Event): Promise<void> {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!el) return;
    switch (el.dataset.action) {
      case 'open':
        this.selectedId = el.dataset.id!;
        this.formError = '';
        this.render('#detail-title');
        if (matchMedia('(max-width: 1023px)').matches) {
          this.root.querySelector('.admin-detail')?.scrollIntoView({ block: 'start' });
        }
        break;
      case 'close': {
        const id = this.selectedId;
        this.selectedId = null;
        this.formError = '';
        this.render();
        this.root.querySelector<HTMLElement>(`[data-action="open"][data-id="${id}"]`)?.focus();
        break;
      }
      case 'view':
        this.view = el.dataset.view as 'list' | 'calendar';
        this.render(`#tab-${this.view}`);
        break;
      case 'month': {
        const delta = Number(el.dataset.delta);
        let { y, m } = this.month;
        m += delta;
        if (m < 1) {
          m = 12;
          y--;
        } else if (m > 12) {
          m = 1;
          y++;
        }
        this.month = { y, m };
        this.render(`[data-action="month"][data-delta="${delta}"]`);
        break;
      }
      case 'reset':
        if (!window.confirm('このサイトが保存した相談データを削除し、サンプル案件に戻します。よろしいですか？')) return;
        await repository.reset();
        setAdminAuthed(true);
        this.selectedId = null;
        this.flash = 'デモを初期化しました（このサイトのデータだけを削除し、サンプル案件に戻しました）。';
        await this.reload();
        break;
      case 'logout':
        setAdminAuthed(false);
        this.selectedId = null;
        this.renderGate();
        break;
    }
  }

  private onChange(t: HTMLInputElement): void {
    if (t.name === 'filter') {
      this.filter = t.value as InquiryStatus | 'all';
      this.render('#filter');
    }
    if (t.name === 'status') {
      const badge = this.root.querySelector('[data-date-badge]');
      const need = t.value === '作業日確定';
      if (badge) {
        badge.textContent = need ? '必須' : '「作業日確定」で必須';
        badge.classList.toggle('badge--req', need);
      }
    }
  }

  private async onSubmit(e: Event): Promise<void> {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    if (form.dataset.form === 'login') {
      const pw = (form.elements.namedItem('password') as HTMLInputElement).value;
      if (pw === DEMO_PASSWORD) {
        setAdminAuthed(true);
        await this.reload();
        this.root.querySelector<HTMLElement>('.admin-title')?.setAttribute('tabindex', '-1');
        this.root.querySelector<HTMLElement>('.admin-title')?.focus();
      } else {
        this.renderGate('パスワードが違います（デモ用パスワードは demo です）。');
      }
      return;
    }
    if (form.dataset.form === 'status') {
      const id = form.dataset.id!;
      const status = (form.elements.namedItem('status') as HTMLSelectElement).value as InquiryStatus;
      const date = (form.elements.namedItem('confirmedDate') as HTMLInputElement).value;
      const memo = (form.elements.namedItem('memo') as HTMLTextAreaElement).value;
      if (status === '作業日確定' && !date) {
        this.formError = '「作業日確定」にするには、確定した作業日を入力してください。希望日は自動では入りません。';
        this.render();
        this.root.querySelector<HTMLInputElement>('#d-date')?.focus();
        return;
      }
      if (date && !parseYmd(date)) {
        this.formError = '確定した作業日の形式が正しくありません。';
        this.render('#d-date');
        return;
      }
      try {
        await repository.update(id, { status, confirmedDate: date || null, adminMemo: memo });
        this.formError = '';
        const st = date ? dayStatus(date, '0000-00-00') : 'open';
        this.flash = `${id} の対応状況を保存しました。${
          st === 'closed-sunday' || st === 'closed-yearend' ? '（確定日が休業日です。日程をご確認ください）' : ''
        }`;
        await this.reload();
        this.root.querySelector<HTMLElement>('#detail-title')?.focus();
      } catch (err) {
        this.formError = err instanceof StorageError ? err.message : '保存できませんでした。';
        this.render();
      }
    }
  }
}

initCommon();
const root = document.querySelector<HTMLElement>('[data-admin-app]');
if (root) {
  try {
    new AdminApp(root);
  } catch (e) {
    console.error(e);
    root.innerHTML = '<p class="notice notice--error">管理画面を表示できませんでした。ページを再読み込みしてください。</p>';
  }
}
