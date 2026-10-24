/**
 * 保存処理はこのモジュールに集約する。
 *
 * 現在はブラウザの localStorage / sessionStorage に保存するデモ実装。
 * 本番化で Supabase 等へ差し替える場合は `InquiryRepository` を実装した別クラスを作り、
 * 末尾の `repository` の生成箇所だけを差し替える（画面側は Promise ベースの API のみを使う）。
 * ただし本番化には保存先の変更だけでなく、認証・権限管理・写真保存・通知・個人情報の扱いの設計が必要（README 参照）。
 */
import type { MainWorkId, ExtraId } from '../data/services.ts';
import { addDays, nextOpenDay, todayJst } from '../data/calendar.ts';

export const KEY_PREFIX = 'ryokusei-demo:';
const KEYS = {
  inquiries: `${KEY_PREFIX}inquiries`,
  seq: `${KEY_PREFIX}seq`,
  seeded: `${KEY_PREFIX}seeded`,
  handoff: `${KEY_PREFIX}handoff`,
  adminAuth: `${KEY_PREFIX}admin-auth`,
} as const;

export const STATUSES = ['新規', '確認中', '見積もり提示済み', '作業日確定', '完了', 'キャンセル'] as const;
export type InquiryStatus = (typeof STATUSES)[number];

export interface EstimateSnapshot {
  /** 例：「約12,000円〜18,000円（税込）」または「写真・現地確認後にお見積もり」 */
  summary: string;
  /** 算出した条件・個別見積もりの内訳など */
  lines: string[];
  calculated: boolean;
}

export interface Inquiry {
  /** 受付番号 */
  id: string;
  /** 送信トークン（同じ依頼の重複登録防止） */
  token: string;
  createdAt: string;
  mainWork: MainWorkId;
  extras: ExtraId[];
  trouble: string;
  placeType: string;
  areaId: string;
  site: {
    areaM2: number | null;
    grassHeight?: string;
    treeHeight?: string;
    treeCount?: string;
    surroundings?: string[];
    note?: string;
  };
  /** 相談者の希望日（最大3件）。確定日とは別 */
  preferredDates: string[];
  attendance: 'yes' | 'no' | 'consult';
  farAway: boolean;
  name: string;
  phone: string;
  email: string;
  message: string;
  estimate: EstimateSnapshot | null;
  /** サイト内デモ写真の素材ID */
  demoPhotoIds: string[];
  /** 利用者が選んだ写真の枚数（画像本体・ファイル名は保存しない） */
  localPhotoCount: number;
  status: InquiryStatus;
  /** 事業者が確定した作業日。希望日から自動では入らない */
  confirmedDate: string | null;
  adminMemo: string;
  isSample: boolean;
}

export type NewInquiry = Omit<Inquiry, 'id' | 'createdAt' | 'status' | 'confirmedDate' | 'adminMemo' | 'isSample'>;

export class StorageError extends Error {}

export interface InquiryRepository {
  list(): Promise<Inquiry[]>;
  get(id: string): Promise<Inquiry | undefined>;
  /** 同じ token の依頼が既にあれば、新しく登録せずにそれを返す */
  create(input: NewInquiry): Promise<Inquiry>;
  update(id: string, patch: Partial<Pick<Inquiry, 'status' | 'confirmedDate' | 'adminMemo'>>): Promise<Inquiry>;
  /** このサイトが保存したデータだけを削除し、サンプル案件を入れ直す */
  reset(): Promise<void>;
}

function safeGet(storage: Storage | undefined, key: string): string | null {
  try {
    return storage ? storage.getItem(key) : null;
  } catch {
    return null;
  }
}

/** 書き込み後に読み戻して一致を確認。失敗したら StorageError */
function safeSet(storage: Storage | undefined, key: string, value: string): void {
  try {
    if (!storage) throw new Error('storage unavailable');
    storage.setItem(key, value);
    if (storage.getItem(key) !== value) throw new Error('verify failed');
  } catch (e) {
    throw new StorageError(`保存できませんでした（${(e as Error).message}）`);
  }
}

function local(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
function session(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

class LocalStorageRepository implements InquiryRepository {
  private read(): Inquiry[] {
    this.ensureSeeded();
    const raw = safeGet(local(), KEYS.inquiries);
    if (!raw) return [];
    try {
      const data = JSON.parse(raw);
      return Array.isArray(data) ? (data as Inquiry[]) : [];
    } catch {
      return [];
    }
  }

  private write(list: Inquiry[]): void {
    safeSet(local(), KEYS.inquiries, JSON.stringify(list));
  }

  private ensureSeeded(): void {
    const ls = local();
    if (!ls || safeGet(ls, KEYS.seeded)) return;
    try {
      safeSet(ls, KEYS.inquiries, JSON.stringify(createSampleInquiries()));
      safeSet(ls, KEYS.seq, '0');
      safeSet(ls, KEYS.seeded, '1');
    } catch {
      /* 保存できない環境ではサンプルなしで表示 */
    }
  }

  private nextId(): string {
    const seq = Number(safeGet(local(), KEYS.seq) ?? '0') + 1;
    safeSet(local(), KEYS.seq, String(seq));
    return `RS-${todayJst().replace(/-/g, '')}-${String(seq).padStart(3, '0')}`;
  }

  async list(): Promise<Inquiry[]> {
    return this.read().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(id: string): Promise<Inquiry | undefined> {
    return this.read().find((i) => i.id === id);
  }

  async create(input: NewInquiry): Promise<Inquiry> {
    const list = this.read();
    const existing = list.find((i) => i.token === input.token);
    if (existing) return existing;
    const inquiry: Inquiry = {
      ...input,
      id: this.nextId(),
      createdAt: new Date().toISOString(),
      status: '新規',
      confirmedDate: null,
      adminMemo: '',
      isSample: false,
    };
    this.write([...list, inquiry]);
    return inquiry;
  }

  async update(id: string, patch: Partial<Pick<Inquiry, 'status' | 'confirmedDate' | 'adminMemo'>>): Promise<Inquiry> {
    const list = this.read();
    const idx = list.findIndex((i) => i.id === id);
    if (idx < 0) throw new StorageError('案件が見つかりません');
    const next = { ...list[idx], ...patch };
    if (next.status === '作業日確定' && !next.confirmedDate) {
      throw new StorageError('「作業日確定」にするには、確定した作業日の入力が必要です');
    }
    list[idx] = next;
    this.write(list);
    return next;
  }

  async reset(): Promise<void> {
    clearSiteData();
    this.ensureSeeded();
  }
}

/** `ryokusei-demo:` で始まるキーだけを削除（他サイト・他アプリのデータには触れない） */
export function clearSiteData(): void {
  for (const storage of [local(), session()]) {
    if (!storage) continue;
    try {
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.startsWith(KEY_PREFIX)) keys.push(k);
      }
      keys.forEach((k) => storage.removeItem(k));
    } catch {
      /* noop */
    }
  }
}

export const repository: InquiryRepository = new LocalStorageRepository();

/* ---------- 費用目安 → フォームへの引き継ぎ（sessionStorage） ---------- */

export interface Handoff {
  mainWork: MainWorkId;
  extras: ExtraId[];
  site: Inquiry['site'];
  estimate: EstimateSnapshot | null;
  savedAt: string;
}

export function saveHandoff(h: Handoff): boolean {
  try {
    safeSet(session(), KEYS.handoff, JSON.stringify(h));
    return true;
  } catch {
    return false;
  }
}

export function loadHandoff(): Handoff | null {
  const raw = safeGet(session(), KEYS.handoff);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Handoff;
  } catch {
    return null;
  }
}

export function clearHandoff(): void {
  try {
    session()?.removeItem(KEYS.handoff);
  } catch {
    /* noop */
  }
}

/* ---------- 管理画面の簡易パスワード（本番の認証ではない） ---------- */

export function isAdminAuthed(): boolean {
  return safeGet(session(), KEYS.adminAuth) === '1';
}
export function setAdminAuthed(v: boolean): void {
  try {
    if (v) safeSet(session(), KEYS.adminAuth, '1');
    else session()?.removeItem(KEYS.adminAuth);
  } catch {
    /* noop */
  }
}

/* ---------- サンプル案件 ---------- */

function createSampleInquiries(): Inquiry[] {
  const today = todayJst();
  const iso = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+09:00`).toISOString();
  const base = {
    extras: [] as ExtraId[],
    email: '',
    estimate: null,
    demoPhotoIds: [] as string[],
    localPhotoCount: 0,
    confirmedDate: null as string | null,
    adminMemo: '',
    isSample: true,
    farAway: false,
  };
  return [
    {
      ...base,
      id: 'RS-SAMPLE-001',
      token: 'sample-1',
      createdAt: iso(addDays(today, -1), '19:42'),
      mainWork: 'kusakari',
      extras: ['disposal'],
      trouble: '遠方に住んでおり、実家の敷地の草が伸びて近所に迷惑をかけていないか心配です。',
      placeType: 'family-home',
      areaId: 'town-b',
      site: { areaM2: 120, grassHeight: 'mid' },
      preferredDates: [nextOpenDay(today, 3), nextOpenDay(today, 5)],
      attendance: 'no',
      farAway: true,
      name: '見本 花子（サンプル）',
      phone: '000-0000-0001',
      message: '立ち会いが難しいため、作業前後の写真を送っていただけると助かります。',
      estimate: {
        summary: '約18,700円〜28,100円（税込）',
        lines: ['草刈り・約120㎡（約36.3坪）・ひざ〜腰くらい', '処分・運搬：別途お見積もり'],
        calculated: true,
      },
      demoPhotoIds: ['overgrown-yard'],
      status: '新規',
    },
    {
      ...base,
      id: 'RS-SAMPLE-002',
      token: 'sample-2',
      createdAt: iso(addDays(today, -3), '10:15'),
      mainWork: 'kusatori',
      trouble: '家のまわりと砂利の通路の雑草を、手作業で取ってほしいです。',
      placeType: 'home',
      areaId: 'city-a',
      site: { areaM2: 30, grassHeight: 'low' },
      preferredDates: [nextOpenDay(today, 1)],
      attendance: 'yes',
      name: '例田 一郎（サンプル）',
      phone: '000-0000-0002',
      email: 'sample@example.com',
      message: '',
      estimate: { summary: '約12,000円〜18,000円（税込）', lines: ['草取り・約30㎡（約9.1坪）・〜30cm'], calculated: true },
      demoPhotoIds: ['weeds-sidepath', 'weeds-gravel'],
      status: '見積もり提示済み',
      adminMemo: '現地確認済み。通路は幅が狭いため手作業で対応。',
    },
    {
      ...base,
      id: 'RS-SAMPLE-003',
      token: 'sample-3',
      createdAt: iso(addDays(today, -6), '15:30'),
      mainWork: 'bassai',
      extras: ['disposal'],
      trouble: '敷地内の木が大きくなり、枝が隣の敷地に出ています。伐採と枝の片付けを相談したいです。',
      placeType: 'home',
      areaId: 'village-c',
      site: { areaM2: null, treeHeight: '3to5', treeCount: '1', surroundings: ['building', 'neighbor'] },
      preferredDates: [nextOpenDay(today, 0), nextOpenDay(today, 2)],
      attendance: 'consult',
      name: '仮野 次郎（サンプル）',
      phone: '000-0000-0003',
      message: '切った枝の処分方法も教えてください。',
      estimate: {
        summary: '写真・現地確認後にお見積もり',
        lines: ['伐採・3〜5m・1本', '周囲：建物が近い／隣の家が近い', '片付け：処分も相談したい'],
        calculated: false,
      },
      demoPhotoIds: ['tree-on-site'],
      localPhotoCount: 2,
      status: '作業日確定',
      confirmedDate: nextOpenDay(today, 6),
      adminMemo: '現地確認で作業内容と金額に合意。確定日は相談者と電話で決定（希望日とは別日）。',
    },
    {
      ...base,
      id: 'RS-SAMPLE-004',
      token: 'sample-4',
      createdAt: iso(addDays(today, -12), '09:05'),
      mainWork: 'unknown',
      trouble: '空き地の草が伸びています。どの作業を頼めばよいか分かりません。',
      placeType: 'vacant-lot',
      areaId: 'other',
      site: { areaM2: null, note: '広さは分からない' },
      preferredDates: [],
      attendance: 'consult',
      name: '試験 三子（サンプル）',
      phone: '000-0000-0004',
      message: '',
      localPhotoCount: 1,
      status: '確認中',
    },
  ];
}
