/** 対応する3業務。ここに無い業務をサイトに追加しないこと（CLAUDE.md 参照） */
export type WorkId = 'kusakari' | 'kusatori' | 'bassai';
/** フォームでは「作業名が分からない」も選べる */
export type MainWorkId = WorkId | 'unknown';

export interface Service {
  id: WorkId;
  no: string;
  name: string;
  /** 困りごと入口の文言 */
  trouble: string;
  troubleNote: string;
  /** 一言で */
  summary: string;
  forWhom: string[];
  includes: string[];
  excludes: string[];
  costFactors: string[];
  photoChecks: string[];
  photoIds: string[];
}

export const SERVICES: Service[] = [
  {
    id: 'kusakari',
    no: '01',
    name: '草刈り',
    trouble: '伸びた草を刈ってほしい',
    troubleNote: '腰の高さまで伸びた草、空き地や実家の敷地など',
    summary: '伸びた草を、草刈り機などで地面近くまで短く刈ります。広い場所や背の高い草に向いています。',
    forWhom: [
      '草が伸びて、敷地に入りにくくなった',
      '遠方の実家・空き家の草が気になる',
      '空き地や駐車場まわりの草をまとめて刈りたい',
    ],
    includes: ['草刈り機・手作業での草刈り', '刈った草を敷地内の決めた場所に集める', '作業後の簡単な掃き掃除'],
    excludes: ['根から抜く作業（「草取り」で相談）', '刈った草の処分・運搬（別途相談）', '木を切る作業（「伐採」で相談）'],
    costFactors: ['おおよその面積', '草の高さ・密集具合', '傾斜や、物・石などの障害物', '刈った草の処分を希望するか'],
    photoChecks: ['敷地の全体が分かる写真', '草の高さが分かる写真（人や物と一緒に）', '傾斜・段差・置いてある物'],
    photoIds: ['kusakari-residence', 'kusakari-trimmer'],
  },
  {
    id: 'kusatori',
    no: '02',
    name: '草取り',
    trouble: '雑草を手作業で取りたい',
    troubleNote: '家のまわり、砂利のすき間、通路など',
    summary: '雑草を手作業で根元から抜きます。家のまわりや砂利のすき間など、細かい場所に向いています。',
    forWhom: [
      '家のまわりの雑草を根から取ってほしい',
      '砂利や通路のすき間の草が気になる',
      '機械の音や刈りくずの飛び散りを避けたい',
    ],
    includes: ['雑草を手で根元から抜く', '抜いた草を袋などにまとめる', '作業後の簡単な掃き掃除'],
    excludes: ['広い面積を短く刈る作業（「草刈り」で相談）', '抜いた草の処分・運搬（別途相談）', '木を切る作業（「伐採」で相談）'],
    costFactors: ['おおよその面積', '草の量・根の張り具合', '砂利・すき間など作業のしやすさ', '抜いた草の処分を希望するか'],
    photoChecks: ['草が生えている場所の全体', '近くで撮った草の様子', '砂利・コンクリートなど地面の種類'],
    photoIds: ['kusatori-hand', 'collected-weeds'],
  },
  {
    id: 'bassai',
    no: '03',
    name: '伐採',
    trouble: '木の伐採を相談したい',
    troubleNote: '大きくなった木、手入れできなくなった木など',
    summary: '敷地内の木を切り倒し、枝や幹を切り分けます。木の大きさや周囲の状況を確認して、対応できるかと費用をお伝えします。',
    forWhom: [
      '大きくなった木をどうにかしたい',
      '空き家・実家の敷地の木が気になる',
      '切った枝や幹の片付けも相談したい',
    ],
    includes: ['木を切り倒す・上から順に切り下ろす', '枝や幹を運びやすい長さに切り分ける', '敷地内での片付け・作業後の清掃'],
    excludes: ['根や切り株を掘り起こす作業（抜根）は行いません', '枝・幹の処分・運搬（別途相談）', '木の大きさや周囲の状況によっては、対応できない場合があります'],
    costFactors: ['木の高さ・幹の太さ', '本数', '建物・道路・電線などとの距離', '枝や幹の片付け・処分の希望'],
    photoChecks: ['木の全体が入る写真', '木のまわり（建物・道路・電線）', '根元の様子と、作業車を停められる場所'],
    photoIds: ['bassai-crosscut', 'bassai-logs'],
  },
];

export const WORK_LABELS: Record<MainWorkId, string> = {
  kusakari: '草刈り',
  kusatori: '草取り',
  bassai: '伐採',
  unknown: '作業名が分からない（相談したい）',
};

/** 追加で相談したいこと（主な作業以外。料金は個別見積もり） */
export const EXTRA_OPTIONS = [
  { id: 'kusakari', label: '草刈りも相談したい' },
  { id: 'kusatori', label: '草取りも相談したい' },
  { id: 'bassai', label: '伐採も相談したい' },
  { id: 'disposal', label: '草・枝の処分について相談したい' },
  { id: 'cleanup', label: '作業後の清掃について確認したい' },
] as const;

export type ExtraId = (typeof EXTRA_OPTIONS)[number]['id'];

export function extraLabel(id: string): string {
  return EXTRA_OPTIONS.find((e) => e.id === id)?.label ?? id;
}

export function isWorkId(v: unknown): v is WorkId {
  return v === 'kusakari' || v === 'kusatori' || v === 'bassai';
}
