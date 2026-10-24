/** 架空の事業者情報（すべてダミー） */
export const BUSINESS = {
  name: '緑整',
  kana: 'りょくせい',
  fullName: '草刈り・草取り・伐採「緑整（りょくせい）」',
  concept: '伸びた草も、気になる木も。まずは写真でご相談。',
  hours: '8:00〜18:00',
  closed: '日曜日（5〜9月は日曜日も相談対応）・年末年始',
  address: '〇〇県〇〇市〇〇町0-0-0（ダミー住所）',
  phoneLabel: '000-0000-0000（ダミー番号）',
} as const;

export interface ServiceArea {
  id: string;
  label: string;
  note?: string;
}

/** 対応エリア（ダミー表記）。フォームの選択肢と共通 */
export const SERVICE_AREAS: ServiceArea[] = [
  { id: 'city-a', label: '〇〇市', note: '市内全域' },
  { id: 'town-b', label: '△△町', note: '町内全域' },
  { id: 'village-c', label: '□□村', note: '一部地域は日程を相談' },
];

export const AREA_OTHER = { id: 'other', label: 'エリア外・分からない' } as const;

export function areaLabel(id: string): string {
  if (id === AREA_OTHER.id) return AREA_OTHER.label;
  return SERVICE_AREAS.find((a) => a.id === id)?.label ?? '未選択';
}

/** 場所の種類（フォーム・管理画面で共通） */
export const PLACE_TYPES = [
  { id: 'home', label: '自宅の敷地' },
  { id: 'family-home', label: '実家・空き家の敷地' },
  { id: 'vacant-lot', label: '空き地' },
  { id: 'parking', label: '駐車場まわり' },
  { id: 'other', label: 'その他（対応できるか確認したい）' },
] as const;

export type PlaceTypeId = (typeof PLACE_TYPES)[number]['id'];

export function placeLabel(id: string): string {
  return PLACE_TYPES.find((p) => p.id === id)?.label ?? '未選択';
}
