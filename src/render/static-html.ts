/**
 * ビルド時（vite.config.ts）に共通データから静的 HTML を生成する。
 * JavaScript が動かなくても本文が表示されるようにするため、DOM API は使わない。
 */
import { SERVICES, type Service } from '../data/services.ts';
import { getPhoto, photoSrc } from '../data/photos.ts';
import { GRASS_PRICING } from '../data/pricing.ts';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`;

function list(items: string[], cls = ''): string {
  return `<ul class="${cls}">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
}

function photo(id: string, eager = false): string {
  const p = getPhoto(id);
  if (!p) return '';
  const w480 = 480;
  const h480 = Math.round((p.height / p.width) * 480);
  const has960 = p.width >= 960;
  return `<figure class="service__photo reveal">
    <img src="${photoSrc(id, 480)}" ${has960 ? `srcset="${photoSrc(id, 480)} 480w, ${photoSrc(id, 960)} 960w" sizes="(min-width: 1024px) 26vw, (min-width: 768px) 45vw, 92vw"` : ''}
      width="${w480}" height="${h480}" alt="${esc(p.alt)}" ${eager ? '' : 'loading="lazy"'} decoding="async" />
  </figure>`;
}

function service(s: Service): string {
  return `<article id="service-${s.id}" class="service" data-service="${s.id}" aria-labelledby="service-${s.id}-title" tabindex="-1">
  <header class="service__head">
    <span class="service__no" aria-hidden="true">${s.no}</span>
    <div>
      <h3 id="service-${s.id}-title" class="service__name">${esc(s.name)}</h3>
      <p class="service__summary">${esc(s.summary)}</p>
    </div>
    <span class="service__selected" aria-hidden="true">選択中</span>
  </header>
  <div class="service__body">
    <div class="service__photos">${s.photoIds.map((id) => photo(id)).join('')}
      <p class="note">作業のイメージ（素材写真）</p>
    </div>
    <div class="service__detail">
      <div class="service__block service__block--wide">
        <h4>こんな困りごとに</h4>
        ${list(s.forWhom, 'dot-list')}
      </div>
      <div class="service__block">
        <h4>主な作業内容</h4>
        ${list(s.includes, 'ok-list')}
      </div>
      <div class="service__block">
        <h4>含まれない作業</h4>
        ${list(s.excludes, 'ng-list')}
      </div>
      <div class="service__block">
        <h4>費用が変わる要素</h4>
        ${list(s.costFactors, 'dot-list')}
      </div>
      <div class="service__block">
        <h4>写真で確認したいこと</h4>
        ${list(s.photoChecks, 'dot-list')}
      </div>
      <div class="service__actions">
        <a class="btn btn--primary" href="/estimate?work=${s.id}" data-consult-work="${s.id}">${esc(s.name)}を相談する</a>
        <a class="btn" href="#estimate-tool" data-select-work="${s.id}" data-no-scroll-select>${s.id === 'bassai' ? '伐採の確認項目を見る' : `${esc(s.name)}の費用の目安`}</a>
      </div>
    </div>
  </div>
</article>`;
}

export function renderServices(): string {
  return SERVICES.map(service).join('\n');
}

export function renderPriceRows(): string {
  const g = GRASS_PRICING;
  return `<tr><th scope="row">草刈り</th><td>${g.kusakari.unitMin}〜${g.kusakari.unitMax}円</td><td>${yen(g.kusakari.minimumCharge)}</td></tr>
<tr><th scope="row">草取り</th><td>${g.kusatori.unitMin}〜${g.kusatori.unitMax}円</td><td>${yen(g.kusatori.minimumCharge)}</td></tr>
<tr><th scope="row">伐採</th><td colspan="2">写真・現地確認後にお見積もり</td></tr>`;
}
