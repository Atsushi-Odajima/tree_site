import { PHOTOS } from '../data/photos.ts';

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** 本番での動作を説明するデモ案内（架空URL・tel: リンクは使わない） */
const DEMO_LINKS: Record<string, { title: string; body: string }> = {
  line: {
    title: 'LINEで相談（デモ）',
    body: '本番では、緑整のLINE公式アカウントの友だち追加画面が開き、トークで写真を送って相談できます。このデモでは外部サービスには移動しません。',
  },
  phone: {
    title: '電話で相談（デモ）',
    body: '本番では、スマートフォンでタップすると事業者の電話番号に発信します。このデモの番号はダミーのため、発信は行いません。',
  },
  kurashi: {
    title: 'くらしのマーケット（デモ）',
    body: '本番では、くらしのマーケットにある事業者の出店ページが開き、口コミの確認や予約の相談ができます。このデモでは外部サイトには移動しません。',
  },
  instagram: {
    title: 'Instagram（デモ）',
    body: '本番では、事業者のInstagramアカウントが開き、作業の様子などの投稿を見られます。このデモでは外部サイトには移動しません。',
  },
  x: {
    title: 'X（デモ）',
    body: '本番では、事業者のXアカウントが開き、営業日のお知らせなどを見られます。このデモでは外部サイトには移動しません。',
  },
  map: {
    title: '地図（デモ）',
    body: '本番では、事業者の所在地を地図アプリで開きます。このデモの住所はダミーのため、地図は表示しません。',
  },
};

let dialog: HTMLDialogElement | null = null;

function ensureDialog(): HTMLDialogElement {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'demo-dialog';
  dialog.setAttribute('aria-labelledby', 'demo-dialog-title');
  dialog.innerHTML = `
    <div class="demo-dialog__inner">
      <p class="demo-dialog__tag">デモ案内</p>
      <h2 id="demo-dialog-title" class="demo-dialog__title"></h2>
      <p class="demo-dialog__body"></p>
      <form method="dialog"><button class="btn btn--primary" value="close">閉じる</button></form>
    </div>`;
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog?.close();
  });
  document.body.appendChild(dialog);
  return dialog;
}

export function openDemoDialog(kind: string): void {
  const info = DEMO_LINKS[kind];
  if (!info) return;
  const d = ensureDialog();
  d.querySelector('.demo-dialog__title')!.textContent = info.title;
  d.querySelector('.demo-dialog__body')!.textContent = info.body;
  if (typeof d.showModal === 'function') d.showModal();
  else window.alert(`${info.title}\n\n${info.body}`);
}

function initDemoLinks(): void {
  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-demo-link]');
    if (!btn) return;
    e.preventDefault();
    openDemoDialog(btn.dataset.demoLink!);
  });
}

/** フッターの写真クレジット（CREDITS.md と同じ内容） */
function renderCredits(): void {
  const ul = document.querySelector<HTMLElement>('[data-credits]');
  if (!ul) return;
  ul.innerHTML = PHOTOS.map(
    (p) => `<li>${esc(p.alt.replace(/様子$/, '写真'))}：
      Photo by <a href="${p.source}" rel="noopener" target="_blank">${esc(p.creator)}</a> /
      <a href="${p.licenseUrl}" rel="noopener license" target="_blank">${p.license}</a>${
        p.license === 'Public Domain Mark 1.0' ? '' : '（サイズ変更・トリミングあり）'
      }</li>`,
  ).join('');
}

/** 控えめな写真の表示。失敗しても本文が見えるよう、成功時にだけクラスを付ける */
function initReveal(): void {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;
  const targets = document.querySelectorAll<HTMLElement>('.reveal');
  if (!targets.length) return;
  const root = document.documentElement;
  root.classList.add('reveal-ready');
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('is-visible');
          io.unobserve(en.target);
        }
      });
    },
    { rootMargin: '0px 0px -5% 0px' },
  );
  targets.forEach((t) => io.observe(t));
  // 印刷時などは全部表示
  window.addEventListener('beforeprint', () => targets.forEach((t) => t.classList.add('is-visible')));
}


export function initCommon(): void {
  const steps: [string, () => void][] = [
    ['demo-links', initDemoLinks],
    ['credits', renderCredits],
    ['reveal', initReveal],
  ];
  for (const [name, fn] of steps) {
    try {
      fn();
    } catch (e) {
      document.documentElement.classList.remove('reveal-ready');
      console.warn(`[init:${name}]`, e);
    }
  }
}
