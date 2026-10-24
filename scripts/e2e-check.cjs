/**
 * 動作確認スクリプト（Playwright）。`npm run build && npx vite preview --port 4173` を起動してから
 *   node scripts/e2e-check.cjs [http://localhost:4173] [スクリーンショット保存先]
 * を実行する。必須確認項目を自動で確かめ、結果を表示する。
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.argv[2] || 'http://localhost:4173';
const OUT = process.argv[3] || path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function loadLazy(page) {
  await page.evaluate(async () => {
    document.querySelectorAll('img[loading="lazy"]').forEach((i) => (i.loading = 'eager'));
    document.querySelectorAll('.reveal').forEach((e) => e.classList.add('is-visible'));
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r)))));
  });
}

async function shot(page, name, full = false) {
  await loadLazy(page);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, name), fullPage: full });
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const newPage = async (viewport, opts = {}) => {
    const ctx = await browser.newContext({ viewport, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', ...opts });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`${p.url()} ${e.message}`));
    p.on('console', (m) => m.type() === 'error' && errors.push(`${p.url()} ${m.text()}`));
    return p;
  };

  /* ---------- トップ：対象業務・禁止表現 ---------- */
  const page = await newPage({ width: 390, height: 844 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const bodyText = await page.locator('main').innerText();
  const banned = ['剪定', '生け垣', '植栽', '植え替え', '造園', '庭づくり', '芝張り', '花壇', '防草シート', '砂利敷き', '除草剤', '外構', '造成', 'お客様の声', 'No.1', '業界最安', '残り1枠', '満席', '追加料金は一切'];
  const found = banned.filter((w) => bodyText.includes(w));
  check('トップ本文に対象外業務・禁止表現がない', found.length === 0, found.join(','));
  const bassaiMentions = (bodyText.match(/抜根/g) || []).length;
  const bassaiNegative = (bodyText.match(/抜根[）)]?は行(いません|っていません)|（抜根）は|抜根）は/g) || []).length;
  check('抜根は「行わない」文脈でのみ記載', bassaiMentions > 0 && bassaiNegative > 0, `抜根の出現 ${bassaiMentions} 回`);
  check('noindex を設定', (await page.locator('meta[name="robots"]').getAttribute('content')).includes('noindex'));
  check('LocalBusiness 構造化データなし', (await page.locator('script[type="application/ld+json"]').count()) === 0);
  check('タイトルに制作見本を明記', (await page.title()).includes('制作見本'));
  const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')));
  check('「#」だけのリンク・tel: リンクがない', !hrefs.some((h) => h === '#' || h.startsWith('tel:')));

  // スマホのメニュー開閉
  check('スマホではメニューを折りたたむ', await page.locator('#site-nav').isHidden());
  await page.click('[data-menu-toggle]');
  check('メニューボタンで開く', (await page.locator('#site-nav').isVisible()) && (await page.getAttribute('[data-menu-toggle]', 'aria-expanded')) === 'true');
  await page.keyboard.press('Escape');
  check('Esc でメニューを閉じる', await page.locator('#site-nav').isHidden());
  await page.evaluate(() => window.scrollTo(0, 0));

  // 最初の画面
  await shot(page, 'top-mobile-390-firstview.png');
  const heroBtnsInView = await page.evaluate(() => {
    const r = document.querySelector('.hero__actions').getBoundingClientRect();
    return r.bottom <= window.innerHeight;
  });
  check('スマホ(390×844)の最初の画面に相談ボタンが入る', heroBtnsInView);

  // 困りごと選択
  await page.click('[data-work-item="kusatori"] [data-select-work]');
  await page.waitForTimeout(600);
  check('困りごと02を選ぶと草取りの説明が選択状態', await page.locator('#service-kusatori.is-selected').count());
  check('選択した作業が費用ツールにも反映', await page.locator('input[name="work"][value="kusatori"]').isChecked());
  check('選択後のフォーカスがサービス見出しへ移動', await page.evaluate(() => document.activeElement?.id === 'service-kusatori'));
  await page.locator('#trouble').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.querySelector('#trouble').offsetTop - 60));
  await shot(page, 'trouble-select-mobile-390.png');

  // 固定アクションバーが入力欄を隠さない
  await page.evaluate(() => window.scrollTo(0, document.querySelector('#estimate-tool').offsetTop));
  await page.waitForTimeout(300);
  await page.click('input[name="work"][value="kusakari"]');
  await page.fill('#tool-area', '100');
  await page.locator('#tool-area').focus();
  await page.waitForTimeout(300);
  check('入力中は固定アクションバーを隠す', await page.locator('.action-bar.is-hidden').count());

  /* ---------- 費用の目安 ---------- */
  await page.check('input[name="height"][value="mid"]');
  const res1 = await page.locator('[data-result]').innerText();
  check('草刈り100㎡・ひざ〜腰で概算表示', res1.includes('15,600円〜23,400円'), res1.split('\n')[1]);
  // 坪へ切替→戻す を繰り返す
  for (let i = 0; i < 6; i++) {
    await page.click(`.unit-toggle label:has(input[value="${i % 2 === 0 ? 'tsubo' : 'm2'}"])`);
  }
  await page.click('.unit-toggle label:has(input[value="tsubo"])');
  const tsuboVal = await page.inputValue('#tool-area');
  const res2 = await page.locator('[data-result]').innerText();
  check('坪に切り替えると換算表示（30.3坪）', tsuboVal === '30.3', tsuboVal);
  check('単位を繰り返し切り替えても結果が同じ', res2.includes('15,600円〜23,400円'));
  await page.click('.unit-toggle label:has(input[value="m2"])');
  check('㎡に戻すと元の 100', (await page.inputValue('#tool-area')) === '100');
  // 草刈り＋草取りを二重加算しない
  await page.check('input[name="extras"][value="kusatori"]');
  const res3 = await page.locator('[data-result]').innerText();
  check('追加作業は個別見積もり欄に分け、金額に加算しない', res3.includes('15,600円〜23,400円') && res3.includes('草取り：写真・現地確認後にお見積もり'));
  await page.check('input[name="disposal"][value="yes"]');
  const res4 = await page.locator('[data-result]').innerText();
  check('処分費は別途と表示（総額に見せない）', res4.includes('草・枝の処分と運搬（ご希望あり）'));
  await page.locator('#estimate-tool').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.querySelector('#estimate-tool').offsetTop - 70));
  await shot(page, 'estimate-tool-mobile-390.png');
  // 面積が分からない
  await page.check('input[name="areaUnknown"]');
  const res5 = await page.locator('[data-result]').innerText();
  check('面積が分からない → 0円にせず写真確認後', res5.includes('写真・現地確認後に') && !/[^0-9,]0円/.test(res5));
  await page.uncheck('input[name="areaUnknown"]');
  // 伐採
  await page.click('input[name="work"][value="bassai"]');
  const resTree = await page.locator('[data-result]').innerText();
  check('伐採は金額を出さない', resTree.includes('写真・現地確認後に') && !/\d+,?\d*円〜/.test(resTree));
  check('伐採では面積・草の高さの入力を表示しない', await page.locator('[data-grass-fields]').isHidden());
  await page.click('input[name="work"][value="kusakari"]');

  // 引き継ぎ
  await page.click('[data-handoff]');
  await page.waitForURL('**/estimate?from=estimate');
  await page.waitForSelector('.handoff');
  const handoffText = await page.locator('.handoff').innerText();
  check('「この内容で見積もり相談へ」で概算と条件がフォームへ引き継がれる', handoffText.includes('15,600円〜23,400円') && handoffText.includes('約100㎡'));
  check('主な作業が引き継がれる', await page.locator('input[name="mainWork"][value="kusakari"]').isChecked());
  check('追加作業（草取り・処分）が引き継がれる', (await page.locator('input[name="extras"][value="kusatori"]').isChecked()) && (await page.locator('input[name="extras"][value="disposal"]').isChecked()));
  check('入力前にデモ注意文を表示', (await page.locator('.demo-warning').innerText()).includes('実際の個人情報は入力しないでください'));

  /* ---------- フォーム ---------- */
  await page.click('[data-action="next"]');
  check('必須未入力で次へ進めない（場所の種類）', (await page.locator('[data-error-for="placeType"]').innerText()).length > 0);
  await page.check('input[name="placeType"][value="family-home"]');
  await page.click('[data-action="next"]');
  await page.waitForSelector('[data-photos]');
  check('手順2で面積が引き継がれている', (await page.inputValue('#f-area')) === '100');
  // デモ写真
  await page.check('input[name="demoPhoto"][value="overgrown-yard"]');
  await page.check('input[name="demoPhoto"][value="weeds-gravel"]');
  // 端末の写真（PNG を生成）
  const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'ry-'));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqPpfDwAFZAJhW5yCZwAAAABJRU5ErkJggg==', 'base64');
  const p1 = path.join(tmp, 'garden-photo-secret-name.png');
  fs.writeFileSync(p1, png);
  const p2 = path.join(tmp, 'memo.txt');
  fs.writeFileSync(p2, 'text');
  const p3 = path.join(tmp, 'big.jpg');
  fs.writeFileSync(p3, Buffer.alloc(5 * 1024 * 1024 + 10));
  await page.setInputFiles('input[name="localPhoto"]', [p1, p2]);
  const msg1 = await page.locator('.photo-msgs').innerText();
  check('未対応形式に案内を表示', msg1.includes('対応していない形式'));
  await page.setInputFiles('input[name="localPhoto"]', [p3]);
  check('5MB超に案内を表示', (await page.locator('.photo-msgs').innerText()).includes('5MBまで'));
  await page.setInputFiles('input[name="localPhoto"]', [p1, p1, p1]);
  const msg3 = await page.locator('.photo-msgs').innerText();
  check('合計5枚を超えると追加しない', msg3.includes('合計5枚まで') && (await page.locator('.photo-count strong').innerText()) === '5');
  check('5枚に達するとデモ写真の未選択分は選べない', await page.locator('input[name="demoPhoto"][value="tree-on-site"]').isDisabled());
  await page.click('[data-action="remove-photo"] >> nth=0');
  check('写真を削除できる', (await page.locator('.photo-count strong').innerText()) === '4');
  await page.evaluate(() => window.scrollTo(0, document.querySelector('.photos').offsetTop - 70));
  await shot(page, 'photo-consult-mobile-390.png');
  await page.click('[data-action="next"]');

  // 手順3：希望日
  const today = await page.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date()));
  const add = (d, n) => {
    const t = new Date(`${d}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  };
  let sunday = add(today, 1);
  while (new Date(`${sunday}T00:00:00Z`).getUTCDay() !== 0 || [5, 6, 7, 8, 9].includes(Number(sunday.slice(5, 7)))) sunday = add(sunday, 1);
  let open = add(today, 1);
  while (new Date(`${open}T00:00:00Z`).getUTCDay() === 0 || ['12-30', '12-31', '01-01', '01-02', '01-03'].includes(open.slice(5))) open = add(open, 1);
  await page.fill('input[name="date0"]', add(today, -1));
  await page.locator('input[name="date0"]').dispatchEvent('change');
  check('過去日はエラー', (await page.locator('[data-error-for="date0"]').innerText()).includes('今日以前'));
  await page.fill('input[name="date0"]', sunday);
  await page.locator('input[name="date0"]').dispatchEvent('change');
  check('休業日（10〜4月の日曜）はエラー', (await page.locator('[data-error-for="date0"]').innerText()).includes('休業日'), sunday);
  await page.fill('input[name="date0"]', open);
  await page.locator('input[name="date0"]').dispatchEvent('change');
  await page.fill('input[name="date1"]', open);
  await page.locator('input[name="date1"]').dispatchEvent('change');
  check('同じ日を重複して選べない', (await page.locator('[data-error-for="date1"]').innerText()).includes('同じ日'));
  await page.fill('input[name="date1"]', '');
  await page.locator('input[name="date1"]').dispatchEvent('change');
  await page.check('input[name="areaId"][value="town-b"]');
  await page.check('input[name="attendance"][value="no"]');
  await page.check('input[name="farAway"]');
  await page.fill('input[name="name"]', '検証 太郎（サンプル）');
  await page.fill('input[name="phone"]', '000-0000-0000');
  await page.click('[data-action="next"]');
  await page.waitForSelector('[data-action="submit"]');
  const confirmText = await page.locator('.form-step').innerText();
  check('確認画面に希望日（確定ではない）を表示', confirmText.includes('希望日（確定ではありません）'));
  check('確認画面に概算を表示', confirmText.includes('15,600円〜23,400円'));
  await shot(page, 'estimate-confirm-mobile-390.png', true);

  // 二重クリック
  // サンプル案件は初回保存時に入るため、利用者が登録した件数（isSample=false）で比べる
  const userCount = () => page.evaluate(() => JSON.parse(localStorage.getItem('ryokusei-demo:inquiries') || '[]').filter((i) => !i.isSample).length);
  const before = await userCount();
  await page.locator('[data-action="submit"]').evaluate((b) => {
    b.click();
    b.click();
    b.click();
  });
  await page.waitForSelector('.done');
  const after = await userCount();
  check('二重クリックでも1件だけ登録', after - before === 1, `${before}→${after}`);
  const doneText = await page.locator('.done').innerText();
  check('完了画面に受付番号・希望日・「作業日・料金は確定していません」', /RS-\d{8}-\d{3}/.test(doneText) && doneText.includes('作業日・料金は確定していません') && doneText.includes('第1希望'));
  const stored = await page.evaluate(() => localStorage.getItem('ryokusei-demo:inquiries'));
  check('利用者の写真の本体・ファイル名を保存しない', !stored.includes('secret-name') && !stored.includes('data:image') && !stored.includes('blob:'));
  const last = JSON.parse(stored).find((i) => i.name.startsWith('検証'));
  check('デモ写真は素材IDで保存・利用者写真は枚数のみ', JSON.stringify(last.demoPhotoIds) === '["overgrown-yard","weeds-gravel"]' && last.localPhotoCount === 2);
  check('希望日と確定日を別に保存（確定日は空）', last.preferredDates[0] === open && last.confirmedDate === null);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  check('保存キーはすべて ryokusei-demo: 接頭辞', keys.every((k) => k.startsWith('ryokusei-demo:')), keys.join(','));
  await shot(page, 'estimate-done-mobile-390.png');

  /* ---------- 保存失敗 ---------- */
  const fp = await newPage({ width: 390, height: 844 });
  await fp.addInitScript(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'ryokusei-demo:inquiries' && window.__failSave) throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      return orig.call(this, k, v);
    };
  });
  await fp.goto(`${BASE}/estimate?work=bassai`, { waitUntil: 'networkidle' });
  await fp.click('[data-action="sample"]');
  for (let i = 0; i < 3; i++) await fp.click('[data-action="next"]');
  await fp.evaluate(() => (window.__failSave = true));
  await fp.click('[data-action="submit"]');
  await fp.waitForSelector('.notice--error');
  check('保存に失敗したら完了扱いにしない', (await fp.locator('.done').count()) === 0 && (await fp.locator('.notice--error').innerText()).includes('受付は完了していません'));
  await fp.evaluate(() => (window.__failSave = false));
  await fp.click('[data-action="submit"]');
  await fp.waitForSelector('.done');
  check('再試行で受付できる', await fp.locator('.done').count());

  /* ---------- 作業名不明・遠方・立ち会い不可でも相談可 ---------- */
  const up = await newPage({ width: 375, height: 667 });
  await up.goto(`${BASE}/estimate?work=unknown`, { waitUntil: 'networkidle' });
  check('作業名が分からないを初期選択', await up.locator('input[name="mainWork"][value="unknown"]').isChecked());
  await up.check('input[name="placeType"][value="vacant-lot"]');
  await up.click('[data-action="next"]');
  await up.check('input[name="areaUnknown"]');
  await up.check('input[name="grassHeight"][value="unknown"]');
  await up.click('[data-action="next"]');
  await up.check('input[name="areaId"][value="other"]');
  await up.check('input[name="attendance"][value="no"]');
  await up.fill('input[name="name"]', '不明 花子');
  await up.fill('input[name="phone"]', '00000000000');
  await up.click('[data-action="next"]');
  await up.click('[data-action="submit"]');
  await up.waitForSelector('.done');
  check('作業名・面積・エリアが分からなくても受付できる（375px）', await up.locator('.done').count());

  /* ---------- 直接アクセス・再読み込み ---------- */
  for (const u of ['/estimate', '/admin']) {
    const r = await page.goto(`${BASE}${u}`);
    await page.reload();
    check(`${u} を直接開いて再読み込みできる`, r.status() === 200 && (await page.title()).includes('制作見本'));
  }

  /* ---------- 管理画面 ---------- */
  const ap = await newPage({ width: 1440, height: 900 });
  // 同じブラウザ内保存を再現するため、上のページの localStorage をコピー
  const ls = await page.evaluate(() => JSON.stringify(localStorage));
  await ap.goto(`${BASE}/admin`);
  await ap.evaluate((data) => Object.entries(JSON.parse(data)).forEach(([k, v]) => localStorage.setItem(k, v)), ls);
  await ap.reload({ waitUntil: 'networkidle' });
  check('パスワードを画面に表示', (await ap.locator('.gate').innerText()).includes('demo'));
  await ap.fill('#pw', 'wrong');
  await ap.click('.gate button[type="submit"]');
  check('パスワード違いはエラー', (await ap.locator('#pw-error').innerText()).length > 0);
  await ap.fill('#pw', 'demo');
  await ap.click('.gate button[type="submit"]');
  await ap.waitForSelector('.case-table');
  const rows = await ap.locator('.case-table tbody tr').count();
  check('初回サンプル4件＋受付した相談1件が一覧に表示', rows === 5, `${rows}件`);
  check('同じブラウザ内だけの保存である旨を表示', (await ap.locator('.admin-note').innerText()).includes('このブラウザ内だけ'));
  await shot(ap, 'admin-list-pc-1440.png');
  await ap.click(`[data-action="open"][data-id="${last.id}"] >> nth=0`);
  const det = await ap.locator('.admin-detail').innerText();
  check('管理画面でデモ写真を表示', (await ap.locator('.admin-detail .detail-photo img').count()) === 2);
  check('利用者の写真は「デモでは写真を保存していません」と表示（すり替えない）', det.includes('相談者が選んだ写真 2枚') && det.includes('デモでは写真を保存していません'));
  await ap.selectOption('#d-status', '作業日確定');
  await ap.click('.detail-form button[type="submit"]');
  check('作業日確定は日付入力が必須', (await ap.locator('.detail-form .notice--error').innerText()).includes('確定した作業日'));
  check('希望日が確定日に自動で入らない', (await ap.inputValue('#d-date')) === '');
  const fixDate = add(open, 2);
  await ap.selectOption('#d-status', '作業日確定');
  await ap.fill('#d-date', fixDate);
  await ap.click('.detail-form button[type="submit"]');
  await ap.waitForSelector('.flash');
  await shot(ap, 'admin-detail-pc-1440.png');
  const saved = await ap.evaluate((id) => JSON.parse(localStorage.getItem('ryokusei-demo:inquiries')).find((i) => i.id === id), last.id);
  check('確定日を保存し、希望日は変わらない', saved.confirmedDate === fixDate && saved.preferredDates[0] === open && saved.status === '作業日確定');
  await ap.click('[data-action="view"][data-view="calendar"]');
  // 確定日の月へ移動
  const ym = fixDate.slice(0, 7);
  for (let i = 0; i < 3; i++) {
    const title = await ap.locator('#cal-title').innerText();
    if (title.startsWith(`${Number(ym.slice(0, 4))}年${Number(ym.slice(5, 7))}月`)) break;
    await ap.click('[data-action="month"][data-delta="1"]');
  }
  const calText = await ap.locator('.cal').innerText();
  check('カレンダーに確定作業日を表示', calText.includes('検証 太郎'));
  check('希望日は別の一覧で確認できる', (await ap.locator('.hopes').innerText()).includes('第1希望'));
  await ap.click('[data-action="close"] >> nth=0').catch(() => {});
  await shot(ap, 'admin-calendar-pc-1440.png');

  // 初期化：このサイトのキーだけ削除
  await ap.evaluate(() => localStorage.setItem('other-app:keep', '1'));
  ap.once('dialog', (d) => d.accept());
  await ap.click('[data-action="reset"]');
  await ap.waitForSelector('.flash');
  const after2 = await ap.evaluate(() => ({ other: localStorage.getItem('other-app:keep'), n: JSON.parse(localStorage.getItem('ryokusei-demo:inquiries')).length }));
  check('デモ初期化はこのサイトのデータだけ削除', after2.other === '1' && after2.n === 4, JSON.stringify(after2));

  // スマホの管理画面
  const am = await newPage({ width: 390, height: 844 });
  await am.goto(`${BASE}/admin`);
  await am.evaluate(() => sessionStorage.setItem('ryokusei-demo:admin-auth', '1'));
  await am.reload({ waitUntil: 'networkidle' });
  check('スマホの管理画面はカード表示', (await am.locator('.case-cards').isVisible()) && !(await am.locator('.case-table').isVisible()));
  await shot(am, 'admin-list-mobile-390.png');
  await am.click('.case-card [data-action="open"] >> nth=2');
  await shot(am, 'admin-detail-mobile-390.png');

  /* ---------- 各幅の表示・横スクロール ---------- */
  for (const w of [375, 390, 768, 1440]) {
    const vp = await newPage({ width: w, height: 900 });
    for (const u of ['/', '/estimate', '/admin']) {
      await vp.goto(`${BASE}${u}`, { waitUntil: 'networkidle' });
      const overflow = await vp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`${w}px ${u} に横スクロールが出ない`, overflow <= 0, `${overflow}px`);
    }
    await vp.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    if (w === 768 || w === 1440) await shot(vp, `top-${w}-full.png`, true);
    if (w === 1440) {
      await vp.evaluate(() => window.scrollTo(0, document.querySelector('#trouble').offsetTop - 70));
      await shot(vp, 'trouble-select-pc-1440.png');
      await vp.click('.site-map__zone[data-select-work="bassai"]');
      await vp.waitForTimeout(500);
      check('PCの敷地図からも選択できる', await vp.locator('#service-bassai.is-selected').count());
      await vp.click('[data-service="bassai"] [data-select-work="bassai"]');
      await vp.waitForTimeout(600);
      await vp.evaluate(() => window.scrollTo(0, document.querySelector('#estimate-tool').offsetTop - 80));
      await shot(vp, 'estimate-tool-bassai-pc-1440.png');
      await vp.goto(`${BASE}/estimate?work=kusakari`, { waitUntil: 'networkidle' });
      await vp.click('[data-action="sample"]');
      await vp.click('[data-action="next"]');
      await shot(vp, 'photo-consult-pc-1440.png', true);
    }
  }

  /* ---------- 文字拡大・キーボード ---------- */
  const zp = await newPage({ width: 390, height: 844 });
  await zp.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await zp.addStyleTag({ content: 'html{font-size:200% !important}' });
  const zOverflow = await zp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('文字サイズ200%でも横スクロールが出ない（トップ）', zOverflow <= 0, `${zOverflow}px`);
  await zp.goto(`${BASE}/estimate`, { waitUntil: 'networkidle' });
  await zp.addStyleTag({ content: 'html{font-size:200% !important}' });
  check('文字サイズ200%でも横スクロールが出ない（フォーム）', (await zp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  await shot(zp, 'zoom200-estimate-390.png');

  const kp = await newPage({ width: 1440, height: 900 });
  await kp.goto(`${BASE}/estimate`, { waitUntil: 'networkidle' });
  await kp.keyboard.press('Tab');
  check('Tab 1回目でスキップリンクにフォーカス', await kp.evaluate(() => document.activeElement?.classList.contains('skip-link')));
  // キーボードだけで手順1を進める
  await kp.focus('input[name="mainWork"][value="kusatori"]');
  await kp.keyboard.press('Space');
  await kp.focus('input[name="placeType"][value="home"]');
  await kp.keyboard.press('Space');
  await kp.focus('[data-action="next"]');
  await kp.keyboard.press('Enter');
  await kp.waitForTimeout(300);
  check('キーボード操作で次の手順へ進み、見出しにフォーカス', await kp.evaluate(() => document.activeElement?.classList.contains('form-step__title') && document.activeElement.textContent.includes('2/5')));

  // 演出の失敗・reduced-motion
  const rm = await newPage({ width: 390, height: 844 }, { reducedMotion: 'reduce' });
  await rm.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  check('reduced-motion では表示演出を無効化', !(await rm.evaluate(() => document.documentElement.classList.contains('reveal-ready'))));
  const nj = await newPage({ width: 390, height: 844 }, { javaScriptEnabled: false });
  await nj.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const njText = await nj.locator('main').innerText();
  check('JavaScript 無効でも本文・サービス説明・相談ボタンを表示', njText.includes('含まれない作業') && (await nj.locator('.hero__actions a').count()) === 2);

  check('ページエラー・コンソールエラーなし', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  fs.writeFileSync(path.join(OUT, 'e2e-results.json'), JSON.stringify(results, null, 1));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
