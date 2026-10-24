/**
 * 営業日データ（架空）。日付は 'YYYY-MM-DD' 文字列で扱い、「今日」は日本時間で判定する。
 * - 日曜は休業。ただし 5〜9月の日曜は相談対応する
 * - 年末年始（12/30〜1/3）は休業
 */
export const SUNDAY_OPEN_MONTHS = [5, 6, 7, 8, 9];
export const YEAR_END_CLOSED: { month: number; day: number }[] = [
  { month: 12, day: 30 },
  { month: 12, day: 31 },
  { month: 1, day: 1 },
  { month: 1, day: 2 },
  { month: 1, day: 3 },
];

/** 日本時間での今日 'YYYY-MM-DD' */
export function todayJst(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

/** 曜日（0=日）。暦日として計算するのでタイムゾーンに依存しない */
export function weekday(ymd: string): number {
  const p = parseYmd(ymd);
  if (!p) return -1;
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
}

export function addDays(ymd: string, days: number): string {
  const p = parseYmd(ymd)!;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return dt.toISOString().slice(0, 10);
}

export type DayStatus = 'open' | 'closed-sunday' | 'closed-yearend' | 'past' | 'invalid';

export function dayStatus(ymd: string, today: string = todayJst()): DayStatus {
  const p = parseYmd(ymd);
  if (!p) return 'invalid';
  if (ymd <= today) return 'past';
  if (YEAR_END_CLOSED.some((h) => h.month === p.m && h.day === p.d)) return 'closed-yearend';
  if (weekday(ymd) === 0 && !SUNDAY_OPEN_MONTHS.includes(p.m)) return 'closed-sunday';
  return 'open';
}

export const DAY_STATUS_MESSAGE: Record<Exclude<DayStatus, 'open'>, string> = {
  past: '今日以前の日付は選べません。明日以降の日付を選んでください。',
  'closed-sunday': '10〜4月の日曜日は休業日です。別の日を選んでください（5〜9月の日曜日は相談対応しています）。',
  'closed-yearend': '年末年始（12/30〜1/3）は休業日です。別の日を選んでください。',
  invalid: '日付の形式が正しくありません。',
};

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

export function formatYmd(ymd: string): string {
  const p = parseYmd(ymd);
  if (!p) return ymd;
  return `${p.y}年${p.m}月${p.d}日（${WEEK[weekday(ymd)]}）`;
}

/** 次の営業日（サンプル入力用） */
export function nextOpenDay(from: string, skip = 0): string {
  let d = from;
  let found = 0;
  for (let i = 0; i < 60; i++) {
    d = addDays(d, 1);
    if (dayStatus(d, from) === 'open') {
      if (found === skip) return d;
      found++;
    }
  }
  return d;
}
