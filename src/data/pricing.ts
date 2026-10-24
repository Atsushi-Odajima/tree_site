/**
 * 架空の料金データ（すべて税込）。実在の相場や事業者の料金ではありません。
 * 自動計算は草刈り・草取りのみ。伐採は金額を算出しない。
 */
export type GrassHeightId = 'low' | 'mid' | 'high' | 'unknown';
export type ConditionId = 'slope' | 'obstacles' | 'narrow' | 'unknown';

export interface GrassPricing {
  label: string;
  /** 1㎡あたりの単価（税込・下限〜上限） */
  unitMin: number;
  unitMax: number;
  /** 1回の最低作業料金（税込） */
  minimumCharge: number;
  /** 草の高さによる係数（unknown は計算しない） */
  heightFactor: Record<Exclude<GrassHeightId, 'unknown'>, number>;
}

export const GRASS_PRICING: Record<'kusakari' | 'kusatori', GrassPricing> = {
  kusakari: {
    label: '草刈り',
    unitMin: 120,
    unitMax: 180,
    minimumCharge: 8000,
    heightFactor: { low: 1.0, mid: 1.3, high: 1.6 },
  },
  kusatori: {
    label: '草取り',
    unitMin: 400,
    unitMax: 600,
    minimumCharge: 10000,
    heightFactor: { low: 1.0, mid: 1.4, high: 1.8 },
  },
};

export const GRASS_HEIGHTS: { id: GrassHeightId; label: string }[] = [
  { id: 'low', label: 'くるぶし〜ひざ下（〜30cm）' },
  { id: 'mid', label: 'ひざ〜腰くらい（30〜80cm）' },
  { id: 'high', label: '腰より高い（80cm〜）' },
  { id: 'unknown', label: '分からない' },
];

/** 状況による加算（割合。複数選択時は合計） */
export const CONDITIONS: { id: ConditionId; label: string; rate: number }[] = [
  { id: 'slope', label: '傾斜・段差がある', rate: 0.2 },
  { id: 'obstacles', label: '物・石・植木鉢などが多い', rate: 0.1 },
  { id: 'narrow', label: '建物の間など狭い場所が多い', rate: 0.1 },
  { id: 'unknown', label: '分からない', rate: 0 },
];

/** 自動計算する面積の上限（これを超える場合は個別見積もり） */
export const MAX_CALC_AREA_M2 = 2000;

/** 概算に含まれるもの・別途確認するもの（表示用） */
export const ESTIMATE_INCLUDED = ['作業費（主な作業1つ分）', '敷地内での集積', '作業後の簡単な清掃', '対応エリア内の出張費'];
export const ESTIMATE_SEPARATE = ['草・枝の処分と運搬', '対応エリア外への出張費', '現地で分かった追加作業（必ず事前に相談します）'];

/** 伐採の確認項目（金額は出さない） */
export const TREE_HEIGHTS = [
  { id: 'under3', label: '3m未満（2階の窓より低い）' },
  { id: '3to5', label: '3〜5m（2階の屋根くらい）' },
  { id: '5to10', label: '5〜10m' },
  { id: 'over10', label: '10m以上' },
  { id: 'unknown', label: '分からない' },
] as const;

export const TREE_COUNTS = [
  { id: '1', label: '1本' },
  { id: '2', label: '2本' },
  { id: '3', label: '3本' },
  { id: '4plus', label: '4本以上' },
  { id: 'unknown', label: '分からない' },
] as const;

export const TREE_SURROUNDINGS = [
  { id: 'building', label: '建物が近い' },
  { id: 'road', label: '道路に面している' },
  { id: 'wire', label: '電線が近い' },
  { id: 'neighbor', label: '隣の家が近い' },
  { id: 'open', label: 'まわりに広さがある' },
  { id: 'unknown', label: '分からない' },
] as const;

export const TREE_CLEANUP = [
  { id: 'gather', label: '敷地内にまとめてほしい' },
  { id: 'disposal', label: '処分も相談したい' },
  { id: 'undecided', label: 'まだ決めていない' },
] as const;

export function labelOf<T extends { id: string; label: string }>(list: readonly T[], id: string | undefined): string {
  return list.find((x) => x.id === id)?.label ?? '未選択';
}
