/** 計算ロジックの単体テスト：`npm test`（Node 22 の --experimental-strip-types で実行） */
import assert from 'node:assert/strict';
import { calculateEstimate, describeResult } from '../src/lib/estimate.ts';
import { M2_PER_TSUBO, displayValue, fromM2, parseAreaInput, toM2 } from '../src/lib/area.ts';
import { dayStatus, todayJst, weekday } from '../src/data/calendar.ts';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log('estimate');
test('草刈り 100㎡・低い草：単価×面積', () => {
  const r = calculateEstimate({ work: 'kusakari', areaM2: 100, height: 'low', conditions: [], disposal: false });
  assert.equal(r.kind, 'range');
  if (r.kind === 'range') {
    assert.equal(r.min, 12000);
    assert.equal(r.max, 18000);
  }
});
test('最低作業料金を下回らない', () => {
  const r = calculateEstimate({ work: 'kusatori', areaM2: 5, height: 'low', conditions: [], disposal: false });
  assert.ok(r.kind === 'range' && r.min === 10000 && r.max === 10000 && r.minimumApplied);
});
test('状況加算は合計（傾斜20%＋障害物10%）', () => {
  const r = calculateEstimate({ work: 'kusakari', areaM2: 100, height: 'low', conditions: ['slope', 'obstacles'], disposal: false });
  assert.ok(r.kind === 'range' && r.min === 15600 && r.max === 23400);
});
test('同じ入力なら同じ結果', () => {
  const input = { work: 'kusakari', areaM2: 123.4, height: 'mid', conditions: ['narrow'], disposal: true } as const;
  assert.deepEqual(calculateEstimate({ ...input, conditions: [...input.conditions] }), calculateEstimate({ ...input, conditions: [...input.conditions] }));
});
test('面積が分からない → 金額を出さない', () => {
  const r = calculateEstimate({ work: 'kusakari', areaM2: null, height: 'mid', conditions: [], disposal: false });
  assert.equal(r.kind, 'consult');
  assert.equal(describeResult(r), '写真・現地確認後にお見積もり');
});
test('草の高さが分からない → 金額を出さない', () => {
  const r = calculateEstimate({ work: 'kusatori', areaM2: 50, height: 'unknown', conditions: [], disposal: false });
  assert.equal(r.kind, 'consult');
});
test('伐採は面積・草の高さに関係なく金額を出さない（0円にしない）', () => {
  const r = calculateEstimate({ work: 'bassai', height: '5to10', count: '2', surroundings: ['wire'], cleanup: 'disposal' });
  assert.equal(r.kind, 'consult');
  assert.ok(!describeResult(r).includes('0円'));
});
test('処分希望は概算に含めず、別途と明記', () => {
  const a = calculateEstimate({ work: 'kusakari', areaM2: 100, height: 'low', conditions: [], disposal: true });
  const b = calculateEstimate({ work: 'kusakari', areaM2: 100, height: 'low', conditions: [], disposal: false });
  assert.ok(a.kind === 'range' && b.kind === 'range' && a.min === b.min && a.max === b.max);
  assert.ok(a.notes.some((n) => n.includes('別途')));
});

console.log('area');
test('坪 → ㎡ → 坪 の往復で値が変わらない', () => {
  assert.equal(displayValue(toM2(30, 'tsubo'), 'tsubo'), '30');
  assert.ok(Math.abs(fromM2(toM2(30, 'tsubo'), 'tsubo') - 30) < 1e-9);
});
test('単位を100回切り替えても㎡は不変（表示値の再入力でも精度維持）', () => {
  let m2 = parseAreaInput('100', 'm2', null)!;
  const original = m2;
  for (let i = 0; i < 100; i++) {
    const unit = i % 2 === 0 ? 'tsubo' : 'm2';
    // 表示値をそのまま再入力した扱い（ユーザーが値を変えていない）
    m2 = parseAreaInput(displayValue(m2, unit), unit, m2)!;
  }
  assert.equal(m2, original);
});
test('単位を切り替えても計算結果が同じ', () => {
  const m2 = parseAreaInput('33', 'tsubo', null)!;
  const viaTsubo = calculateEstimate({ work: 'kusakari', areaM2: m2, height: 'mid', conditions: [], disposal: false });
  const sameAfterToggle = calculateEstimate({
    work: 'kusakari',
    areaM2: parseAreaInput(displayValue(m2, 'm2'), 'm2', m2),
    height: 'mid',
    conditions: [],
    disposal: false,
  });
  assert.deepEqual(viaTsubo, sameAfterToggle);
});
test('1坪 = 400/121㎡', () => assert.equal(M2_PER_TSUBO, 400 / 121));
test('全角数字・0以下', () => {
  assert.equal(parseAreaInput('１００', 'm2', null), 100);
  assert.ok(Number.isNaN(parseAreaInput('0', 'm2', null)!));
  assert.ok(Number.isNaN(parseAreaInput('abc', 'm2', null)!));
  assert.equal(parseAreaInput('', 'm2', null), null);
});

console.log('calendar');
test('日本時間の今日（UTC 2026-10-24 16:00 は JST 10/25）', () => {
  assert.equal(todayJst(new Date('2026-10-24T16:00:00Z')), '2026-10-25');
  assert.equal(todayJst(new Date('2026-10-24T14:59:00Z')), '2026-10-24');
});
test('過去日・当日は不可', () => {
  assert.equal(dayStatus('2026-10-24', '2026-10-24'), 'past');
  assert.equal(dayStatus('2026-10-01', '2026-10-24'), 'past');
});
test('10〜4月の日曜は休業、5〜9月の日曜は営業', () => {
  assert.equal(weekday('2026-11-01'), 0);
  assert.equal(dayStatus('2026-11-01', '2026-10-24'), 'closed-sunday');
  assert.equal(weekday('2027-05-02'), 0);
  assert.equal(dayStatus('2027-05-02', '2026-10-24'), 'open');
});
test('年末年始は休業', () => {
  assert.equal(dayStatus('2026-12-31', '2026-10-24'), 'closed-yearend');
  assert.equal(dayStatus('2027-01-03', '2026-10-24'), 'closed-yearend');
  assert.equal(dayStatus('2027-01-04', '2026-10-24'), 'open');
});
test('存在しない日付は invalid', () => assert.equal(dayStatus('2026-02-30', '2026-01-01'), 'invalid'));

console.log(`\n${passed} tests passed`);
