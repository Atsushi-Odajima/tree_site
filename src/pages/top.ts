import '../styles/base.css';
import '../styles/top.css';
import { initCommon, esc } from '../ui/common.ts';
import { icon } from '../ui/icons.ts';
import {
  CONDITIONS,
  ESTIMATE_INCLUDED,
  ESTIMATE_SEPARATE,
  GRASS_HEIGHTS,
  TREE_CLEANUP,
  TREE_COUNTS,
  TREE_HEIGHTS,
  TREE_SURROUNDINGS,
  labelOf,
  type ConditionId,
  type GrassHeightId,
} from '../data/pricing.ts';
import { SERVICES, isWorkId, type WorkId, type ExtraId } from '../data/services.ts';
import { calculateEstimate, describeResult, type EstimateInput, type EstimateResult } from '../lib/estimate.ts';
import { describeArea, displayValue, parseAreaInput, unitLabel, type AreaUnit } from '../lib/area.ts';
import { saveHandoff, type EstimateSnapshot, type Handoff } from '../lib/storage.ts';

/* ---------------- 困りごと選択 ↔ サービス説明 ↔ 費用ツール ---------------- */

let tool: EstimateTool | null = null;

function markSelected(work: WorkId): void {
  document.querySelectorAll<HTMLElement>('[data-work-item]').forEach((el) => {
    const on = el.dataset.workItem === work;
    el.classList.toggle('is-selected', on);
    el.querySelector('[data-select-work]')?.setAttribute('aria-current', on ? 'true' : 'false');
  });
  document.querySelectorAll<HTMLElement>('[data-service]').forEach((el) => {
    el.classList.toggle('is-selected', el.dataset.service === work);
  });
  document.querySelectorAll<SVGAElement>('.site-map__zone').forEach((el) => {
    el.classList.toggle('is-selected', el.dataset.selectWork === work);
  });
}

function initSelection(): void {
  document.addEventListener('click', (e) => {
    const trigger = (e.target as Element).closest<HTMLElement | SVGAElement>('[data-select-work]');
    if (!trigger) return;
    const work = (trigger as HTMLElement).dataset.selectWork;
    if (!isWorkId(work)) return;
    markSelected(work);
    tool?.setWork(work);
    // サービス説明へ移動した場合は見出しにフォーカスを移す（キーボード・読み上げ利用者向け）
    const href = trigger.getAttribute('href') ?? '';
    if (href.startsWith('#service-')) {
      const target = document.querySelector<HTMLElement>(href);
      window.setTimeout(() => target?.focus({ preventScroll: true }), 0);
    }
  });
}

/* ---------------- 費用の目安を調べる ---------------- */

interface ToolState {
  work: WorkId;
  unit: AreaUnit;
  areaM2: number | null;
  areaInvalid: boolean;
  areaUnknown: boolean;
  height: GrassHeightId | null;
  conditions: ConditionId[];
  disposal: 'yes' | 'no' | null;
  treeHeight: string | null;
  treeCount: string | null;
  surroundings: string[];
  cleanup: string | null;
  extras: WorkId[];
}

function radios(name: string, items: readonly { id: string; label: string }[], cls = 'choices choices--2'): string {
  return `<div class="${cls}">${items
    .map((i) => `<label class="choice"><input type="radio" name="${name}" value="${i.id}" /><span>${esc(i.label)}</span></label>`)
    .join('')}</div>`;
}
function checks(name: string, items: readonly { id: string; label: string }[]): string {
  return `<div class="choices choices--2">${items
    .map((i) => `<label class="choice"><input type="checkbox" name="${name}" value="${i.id}" /><span>${esc(i.label)}</span></label>`)
    .join('')}</div>`;
}

class EstimateTool {
  private root: HTMLElement;
  private state: ToolState = {
    work: 'kusakari',
    unit: 'm2',
    areaM2: null,
    areaInvalid: false,
    areaUnknown: false,
    height: null,
    conditions: [],
    disposal: null,
    treeHeight: null,
    treeCount: null,
    surroundings: [],
    cleanup: null,
    extras: [],
  };

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = this.template();
    this.bind();
    this.syncWorkUi();
    this.update();
  }

  private template(): string {
    return `<div class="tool__layout">
  <form class="tool__form" novalidate aria-label="費用の目安の条件">
    <div class="tool__group">
      <fieldset class="field">
        <legend>主な作業 <span class="badge">1つ選択</span></legend>
        <div class="work-tabs">${SERVICES.map(
          (s) =>
            `<label class="choice"><input type="radio" name="work" value="${s.id}" ${s.id === 'kusakari' ? 'checked' : ''} /><span>${s.name}</span></label>`,
        ).join('')}</div>
        <p class="field__hint">複数の作業を希望する場合は、主な作業を1つ選び、ほかの作業は下の「追加で相談したい作業」で選んでください。</p>
      </fieldset>
    </div>

    <div class="tool__group" data-grass-fields>
      <div class="field">
        <label class="field__label" for="tool-area">おおよその面積</label>
        <div class="area-input">
          <input id="tool-area" class="input" type="text" inputmode="decimal" autocomplete="off" aria-describedby="tool-area-conv tool-area-error" placeholder="例：100" />
          <div class="unit-toggle" role="radiogroup" aria-label="面積の単位">
            <label><input type="radio" name="unit" value="m2" checked />㎡</label>
            <label><input type="radio" name="unit" value="tsubo" />坪</label>
          </div>
          <p id="tool-area-conv" class="area-input__conv" aria-live="polite"></p>
        </div>
        <p id="tool-area-error" class="field__error" role="alert"></p>
        <label class="choice"><input type="checkbox" name="areaUnknown" value="1" /><span>面積が分からない<small>写真で広さを確認します</small></span></label>
      </div>
      <fieldset class="field">
        <legend>草の高さ</legend>
        ${radios('height', GRASS_HEIGHTS)}
      </fieldset>
      <fieldset class="field">
        <legend>場所の状況 <span class="badge">分かる範囲で・複数可</span></legend>
        ${checks('conditions', CONDITIONS)}
      </fieldset>
      <fieldset class="field">
        <legend>草の処分</legend>
        ${radios('disposal', [
          { id: 'no', label: '敷地内にまとめてもらえればよい' },
          { id: 'yes', label: '処分についても相談したい' },
        ])}
      </fieldset>
    </div>

    <div class="tool__group" data-tree-fields hidden>
      <p class="notice notice--info">${icon('info')}<span>伐採は、木の大きさや周囲の状況で作業方法が変わるため、<strong>金額は自動で計算しません</strong>。分かる範囲で選ぶと、相談時の確認がスムーズになります。</span></p>
      <fieldset class="field">
        <legend>おおよその木の高さ</legend>
        ${radios('treeHeight', TREE_HEIGHTS)}
      </fieldset>
      <fieldset class="field">
        <legend>本数</legend>
        ${radios('treeCount', TREE_COUNTS, 'choices choices--2')}
      </fieldset>
      <fieldset class="field">
        <legend>木のまわりの状況 <span class="badge">複数可</span></legend>
        ${checks('surroundings', TREE_SURROUNDINGS)}
      </fieldset>
      <fieldset class="field">
        <legend>枝や幹の片付け・処分</legend>
        ${radios('cleanup', TREE_CLEANUP)}
      </fieldset>
    </div>

    <div class="tool__group">
      <fieldset class="field">
        <legend>追加で相談したい作業 <span class="badge">任意</span></legend>
        <div class="choices choices--2" data-extras></div>
        <p class="field__hint">追加の作業は、この目安には足さずに「個別見積もり」として分けて表示します。</p>
      </fieldset>
    </div>
  </form>

  <section class="result" aria-labelledby="result-title">
    <h4 id="result-title" class="visually-hidden">費用の目安の結果</h4>
    <div data-result aria-live="polite"></div>
  </section>
</div>`;
  }

  private q<T extends Element = HTMLElement>(sel: string): T {
    return this.root.querySelector(sel) as T;
  }

  private bind(): void {
    const form = this.q<HTMLFormElement>('form');
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('change', (e) => this.onChange(e.target as HTMLInputElement));
    const area = this.q<HTMLInputElement>('#tool-area');
    area.addEventListener('input', () => this.readArea());
    area.addEventListener('blur', () => this.syncAreaInput());
    this.root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-handoff]');
      if (btn) this.handoff();
    });
  }

  private onChange(t: HTMLInputElement): void {
    const s = this.state;
    switch (t.name) {
      case 'work':
        this.setWork(t.value as WorkId, false);
        markSelected(t.value as WorkId);
        return;
      case 'unit':
        // 単位を切り替えても保持している㎡は変えない。表示だけ換算する
        s.unit = t.value as AreaUnit;
        this.syncAreaInput();
        break;
      case 'areaUnknown':
        s.areaUnknown = t.checked;
        this.q<HTMLInputElement>('#tool-area').disabled = t.checked;
        break;
      case 'height':
        s.height = t.value as GrassHeightId;
        break;
      case 'conditions':
        s.conditions = this.checked('conditions') as ConditionId[];
        break;
      case 'disposal':
        s.disposal = t.value as 'yes' | 'no';
        break;
      case 'treeHeight':
        s.treeHeight = t.value;
        break;
      case 'treeCount':
        s.treeCount = t.value;
        break;
      case 'surroundings':
        s.surroundings = this.checked('surroundings');
        break;
      case 'cleanup':
        s.cleanup = t.value;
        break;
      case 'extras':
        s.extras = this.checked('extras') as WorkId[];
        break;
    }
    this.update();
  }

  private checked(name: string): string[] {
    return [...this.root.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)].map((i) => i.value);
  }

  private readArea(): void {
    const input = this.q<HTMLInputElement>('#tool-area');
    const v = parseAreaInput(input.value, this.state.unit, this.state.areaM2);
    this.state.areaInvalid = Number.isNaN(v);
    this.state.areaM2 = v === null || Number.isNaN(v) ? null : v;
    this.update();
  }

  private syncAreaInput(): void {
    const input = this.q<HTMLInputElement>('#tool-area');
    if (this.state.areaM2 !== null) input.value = displayValue(this.state.areaM2, this.state.unit);
    input.placeholder = this.state.unit === 'm2' ? '例：100' : '例：30';
  }

  setWork(work: WorkId, syncRadio = true): void {
    this.state.work = work;
    this.state.extras = this.state.extras.filter((x) => x !== work);
    if (syncRadio) {
      const r = this.root.querySelector<HTMLInputElement>(`input[name="work"][value="${work}"]`);
      if (r) r.checked = true;
    }
    this.syncWorkUi();
    this.update();
  }

  private syncWorkUi(): void {
    const isTree = this.state.work === 'bassai';
    this.q('[data-grass-fields]').hidden = isTree;
    this.q('[data-tree-fields]').hidden = !isTree;
    this.q('[data-extras]').innerHTML = SERVICES.filter((s) => s.id !== this.state.work)
      .map(
        (s) =>
          `<label class="choice"><input type="checkbox" name="extras" value="${s.id}" ${this.state.extras.includes(s.id) ? 'checked' : ''} /><span>${s.name}も相談したい</span></label>`,
      )
      .join('');
  }

  private input(): EstimateInput {
    const s = this.state;
    if (s.work === 'bassai') {
      return {
        work: 'bassai',
        height: s.treeHeight ?? 'unknown',
        count: s.treeCount ?? 'unknown',
        surroundings: s.surroundings,
        cleanup: s.cleanup ?? 'undecided',
      };
    }
    return {
      work: s.work,
      areaM2: s.areaUnknown ? null : s.areaM2,
      height: s.height ?? 'unknown',
      conditions: s.conditions,
      disposal: s.disposal === 'yes',
    };
  }

  /** 金額を出すのに必要な項目が未入力か */
  private missing(): string[] {
    const s = this.state;
    if (s.work === 'bassai') return [];
    const m: string[] = [];
    if (!s.areaUnknown && s.areaM2 === null) m.push('おおよその面積（分からない場合は「面積が分からない」）');
    if (!s.height) m.push('草の高さ');
    return m;
  }

  private conditionLines(result: EstimateResult | null): string[] {
    const s = this.state;
    const lines: string[] = [];
    const name = SERVICES.find((x) => x.id === s.work)!.name;
    if (s.work === 'bassai') {
      lines.push(`${name}・高さ：${labelOf(TREE_HEIGHTS, s.treeHeight ?? 'unknown')}・本数：${labelOf(TREE_COUNTS, s.treeCount ?? 'unknown')}`);
      if (s.surroundings.length) lines.push(`まわり：${s.surroundings.map((x) => labelOf(TREE_SURROUNDINGS, x)).join('／')}`);
      lines.push(`片付け：${labelOf(TREE_CLEANUP, s.cleanup ?? 'undecided')}`);
    } else {
      const area = s.areaUnknown || s.areaM2 === null ? '面積：分からない' : describeArea(s.areaM2);
      lines.push(`${name}・${area}・草の高さ：${labelOf(GRASS_HEIGHTS, s.height ?? 'unknown')}`);
      const conds = s.conditions.map((c) => labelOf(CONDITIONS, c));
      if (conds.length) lines.push(`状況：${conds.join('／')}`);
      if (result?.kind === 'range' && result.conditionRate > 0) lines.push(`状況による加算：${Math.round(result.conditionRate * 100)}%`);
      lines.push(`草の処分：${s.disposal === 'yes' ? '相談したい（別途お見積もり）' : s.disposal === 'no' ? '敷地内にまとめる' : '未選択'}`);
    }
    return lines;
  }

  private update(): void {
    const s = this.state;
    const conv = this.q('#tool-area-conv');
    const err = this.q('#tool-area-error');
    const areaInput = this.q<HTMLInputElement>('#tool-area');
    if (s.areaInvalid && !s.areaUnknown) {
      err.innerHTML = `${icon('alert')}<span>面積は0より大きい数字で入力してください。</span>`;
      areaInput.setAttribute('aria-invalid', 'true');
    } else {
      err.textContent = '';
      areaInput.removeAttribute('aria-invalid');
    }
    conv.textContent =
      s.areaM2 !== null && !s.areaUnknown
        ? `${s.unit === 'm2' ? '' : `${displayValue(s.areaM2, 'tsubo')}坪 ＝ `}約${displayValue(s.areaM2, 'm2')}㎡（約${displayValue(s.areaM2, 'tsubo')}坪）`
        : `単位：${unitLabel(s.unit)}（1坪 ≒ 3.31㎡）`;

    const out = this.q('[data-result]');
    const missing = this.missing();
    if (missing.length) {
      out.innerHTML = `<p class="result__label">費用の目安</p>
        <p class="result__amount result__amount--consult">条件を選ぶと表示します</p>
        <p class="result__reason">あと：${missing.map(esc).join('、')}</p>
        ${this.actions(false)}`;
      return;
    }

    const result = calculateEstimate(this.input());
    const name = SERVICES.find((x) => x.id === s.work)!.name;
    const extras = s.extras.map((w) => SERVICES.find((x) => x.id === w)!.name);
    const amount =
      result.kind === 'range'
        ? `<p class="result__amount">${esc(describeResult(result).replace('（税込）', ''))}<small>（税込・概算）</small></p>`
        : `<p class="result__amount result__amount--consult">写真・現地確認後に<br />お見積もり</p><p class="result__reason">${esc(result.reason)}</p>`;
    const separate = ESTIMATE_SEPARATE.map((x) =>
      x.startsWith('草・枝の処分') && (s.disposal === 'yes' || s.cleanup === 'disposal') ? `${x}（ご希望あり）` : x,
    );

    out.innerHTML = `<p class="result__label">費用の目安（${esc(name)}）</p>
      ${amount}
      <div class="result__section"><h4>選んだ条件</h4><ul>${this.conditionLines(result).map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>
      ${
        result.kind === 'range'
          ? `<div class="result__section"><h4>この目安に含まれるもの</h4><ul>${ESTIMATE_INCLUDED.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`
          : ''
      }
      <div class="result__section"><h4>別途確認する費用（この目安には含みません）</h4><ul>${separate.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
      ${
        extras.length
          ? `<div class="result__section"><h4>個別見積もり（追加で相談したい作業）</h4><ul>${extras
              .map((x) => `<li>${esc(x)}：写真・現地確認後にお見積もり</li>`)
              .join('')}</ul></div>`
          : ''
      }
      ${result.notes.length ? `<div class="result__section"><h4>補足</h4><ul>${result.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
      <p class="note" style="margin-top:var(--sp-3)">架空の料金による目安です。正式な金額は、写真・現地で確認してからお伝えします。</p>
      ${this.actions(true)}`;
  }

  private actions(ready: boolean): string {
    return `<div class="result__actions">
      <button type="button" class="btn btn--primary btn--block" data-handoff>${icon('arrowRight')}この内容で見積もり相談へ</button>
      ${ready ? '' : '<p class="note">分からない項目があっても、このまま写真相談へ進めます。</p>'}
    </div>`;
  }

  private snapshot(): EstimateSnapshot | null {
    const s = this.state;
    const missing = this.missing();
    const result = missing.length ? null : calculateEstimate(this.input());
    const lines = this.conditionLines(result);
    s.extras.forEach((w) => lines.push(`個別見積もり：${SERVICES.find((x) => x.id === w)!.name}`));
    return {
      summary: result ? describeResult(result) : '写真・現地確認後にお見積もり',
      lines,
      calculated: result?.kind === 'range',
    };
  }

  private handoff(): void {
    const s = this.state;
    const extras: ExtraId[] = [...s.extras];
    if (s.disposal === 'yes' || s.cleanup === 'disposal') extras.push('disposal');
    const h: Handoff = {
      mainWork: s.work,
      extras,
      site:
        s.work === 'bassai'
          ? {
              areaM2: null,
              treeHeight: s.treeHeight ?? 'unknown',
              treeCount: s.treeCount ?? 'unknown',
              surroundings: s.surroundings,
            }
          : { areaM2: s.areaUnknown ? null : s.areaM2, grassHeight: s.height ?? 'unknown' },
      estimate: this.snapshot(),
      savedAt: new Date().toISOString(),
    };
    const ok = saveHandoff(h);
    window.location.href = ok ? '/estimate?from=estimate' : `/estimate?work=${s.work}`;
  }
}

/* ---------------- 固定アクションバー ---------------- */

function initActionBar(): void {
  const bar = document.querySelector<HTMLElement>('.action-bar');
  const heroActions = document.querySelector('.hero__actions');
  if (!bar) return;
  let heroVisible = true;
  let typing = false;
  const sync = () => bar.classList.toggle('is-hidden', heroVisible || typing);
  if (heroActions && 'IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => {
      heroVisible = en.isIntersecting;
      sync();
    }).observe(heroActions);
  } else {
    heroVisible = false;
  }
  // 入力中（スマホでキーボード表示中）はバーを隠して入力欄を覆わない
  document.addEventListener('focusin', (e) => {
    typing = (e.target as HTMLElement).matches('input[type="text"], input[type="number"], textarea');
    sync();
  });
  document.addEventListener('focusout', () => {
    typing = false;
    sync();
  });
  sync();
}

function start(): void {
  initCommon();
  const steps: [string, () => void][] = [
    ['selection', initSelection],
    [
      'tool',
      () => {
        const root = document.querySelector<HTMLElement>('[data-estimate-tool]');
        if (root) tool = new EstimateTool(root);
      },
    ],
    ['action-bar', initActionBar],
  ];
  for (const [name, fn] of steps) {
    try {
      fn();
    } catch (e) {
      console.warn(`[init:${name}]`, e);
    }
  }
}

start();
