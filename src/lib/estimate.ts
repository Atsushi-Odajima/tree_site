import {
  CONDITIONS,
  GRASS_PRICING,
  MAX_CALC_AREA_M2,
  type ConditionId,
  type GrassHeightId,
} from '../data/pricing.ts';
import type { WorkId } from '../data/services.ts';

export interface GrassInput {
  work: 'kusakari' | 'kusatori';
  /** ㎡。null は「分からない」 */
  areaM2: number | null;
  height: GrassHeightId;
  conditions: ConditionId[];
  disposal: boolean;
}

export interface TreeInput {
  work: 'bassai';
  height: string;
  count: string;
  surroundings: string[];
  cleanup: string;
}

export type EstimateInput = GrassInput | TreeInput;

export type EstimateResult =
  | {
      kind: 'range';
      work: 'kusakari' | 'kusatori';
      min: number;
      max: number;
      /** 最低作業料金を適用したか */
      minimumApplied: boolean;
      conditionRate: number;
      notes: string[];
    }
  | {
      /** 金額を出さない（伐採、または面積・高さが分からない等） */
      kind: 'consult';
      work: WorkId;
      reason: string;
      notes: string[];
    };

const floor100 = (n: number) => Math.floor(n / 100) * 100;
const ceil100 = (n: number) => Math.ceil(n / 100) * 100;

/** 費用目安の計算。純関数なので同じ入力なら必ず同じ結果になる */
export function calculateEstimate(input: EstimateInput): EstimateResult {
  if (input.work === 'bassai') {
    return {
      kind: 'consult',
      work: 'bassai',
      reason: '伐採は、木の高さ・太さ・まわりの状況で作業方法が大きく変わるため、写真・現地確認後にお見積もりします。',
      notes: ['枝や幹の処分・運搬は、量を確認して別途お見積もりします。', '根や切り株を掘り起こす作業（抜根）は含みません。'],
    };
  }

  const pricing = GRASS_PRICING[input.work];
  const disposalNote = input.disposal
    ? '草の処分・運搬は、量を確認して別途お見積もりします（この概算には含みません）。'
    : '刈った草・抜いた草は、敷地内の決めた場所にまとめます。';

  if (input.areaM2 === null || !Number.isFinite(input.areaM2) || input.areaM2 <= 0) {
    return {
      kind: 'consult',
      work: input.work,
      reason: '面積が分からない場合は、写真で敷地の広さを確認してからお見積もりします。',
      notes: [disposalNote],
    };
  }
  if (input.height === 'unknown') {
    return {
      kind: 'consult',
      work: input.work,
      reason: '草の高さが分からない場合は、写真で草の様子を確認してからお見積もりします。',
      notes: [disposalNote],
    };
  }
  if (input.areaM2 > MAX_CALC_AREA_M2) {
    return {
      kind: 'consult',
      work: input.work,
      reason: `${MAX_CALC_AREA_M2.toLocaleString('ja-JP')}㎡を超える広さは、作業日数も含めて個別にお見積もりします。`,
      notes: [disposalNote],
    };
  }

  const conditionRate = CONDITIONS.filter((c) => input.conditions.includes(c.id)).reduce((sum, c) => sum + c.rate, 0);
  // 浮動小数点の誤差で100円単位の切り上げがずれないよう、係数と円未満を先に丸める
  const factor = Math.round(pricing.heightFactor[input.height] * (1 + conditionRate) * 10000) / 10000;
  const rawMin = Math.round(input.areaM2 * pricing.unitMin * factor);
  const rawMax = Math.round(input.areaM2 * pricing.unitMax * factor);
  let min = floor100(rawMin);
  let max = ceil100(rawMax);
  let minimumApplied = false;
  if (min < pricing.minimumCharge) {
    min = pricing.minimumCharge;
    minimumApplied = true;
  }
  if (max < pricing.minimumCharge) max = pricing.minimumCharge;

  const notes = [disposalNote];
  if (input.conditions.includes('unknown')) notes.push('傾斜や障害物の有無は、写真・現地で確認します。');
  if (minimumApplied) notes.push(`1回の最低作業料金（${yen(pricing.minimumCharge)}）を適用しています。`);

  return { kind: 'range', work: input.work, min, max, minimumApplied, conditionRate, notes };
}

export function yen(n: number): string {
  return `${n.toLocaleString('ja-JP')}円`;
}

export function describeResult(r: EstimateResult): string {
  if (r.kind === 'range') {
    return r.min === r.max ? `約${yen(r.min)}（税込）` : `約${yen(r.min)}〜${yen(r.max)}（税込）`;
  }
  return '写真・現地確認後にお見積もり';
}
