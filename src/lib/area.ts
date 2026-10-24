/**
 * ㎡ ⇔ 坪。内部の値は常に㎡で保持し、坪は表示のためだけに換算する。
 * 単位を何度切り替えても、保持している㎡は変わらないので丸め誤差が蓄積しない。
 */
export type AreaUnit = 'm2' | 'tsubo';

/** 1坪 = 400/121 ㎡（約3.3058㎡） */
export const M2_PER_TSUBO = 400 / 121;

export function toM2(value: number, unit: AreaUnit): number {
  return unit === 'm2' ? value : value * M2_PER_TSUBO;
}

export function fromM2(m2: number, unit: AreaUnit): number {
  return unit === 'm2' ? m2 : m2 / M2_PER_TSUBO;
}

/** 入力欄に表示する値（小数1桁まで。末尾の .0 は省く） */
export function displayValue(m2: number, unit: AreaUnit): string {
  const v = Math.round(fromM2(m2, unit) * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function unitLabel(unit: AreaUnit): string {
  return unit === 'm2' ? '㎡' : '坪';
}

/** 「約 99㎡（約 30坪）」の形式 */
export function describeArea(m2: number): string {
  return `約${displayValue(m2, 'm2')}㎡（約${displayValue(m2, 'tsubo')}坪）`;
}

/**
 * 入力文字列を㎡へ。表示値と一致する入力（＝ユーザーが数値を変えていない）なら、
 * 元の㎡をそのまま返して精度を保つ。
 */
export function parseAreaInput(text: string, unit: AreaUnit, currentM2: number | null): number | null {
  const normalized = text.replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).trim();
  if (normalized === '') return null;
  const v = Number(normalized);
  if (!Number.isFinite(v) || v <= 0) return NaN;
  if (currentM2 !== null && displayValue(currentM2, unit) === normalized) return currentM2;
  return toM2(v, unit);
}
