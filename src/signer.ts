import { requestSignedUrls } from './api';
import type { MagazineInfo, SignType } from './types';

const REFRESH_MARGIN = 5 * 60 * 1000;
const DEFAULT_TTL = 30 * 60 * 1000;
const MAX_BATCH = 20;

export function parseExpiry(url: string): number | null {
  const m = /[?&]se=([^&#]+)/.exec(url);
  if (!m) return null;
  let v = m[1];
  try {
    v = decodeURIComponent(v);
  } catch {
    /* keep raw */
  }
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

interface Entry {
  url: string;
  exp: number;
}
interface Waiter {
  resolve: (u: string) => void;
  reject: (e: unknown) => void;
}

export class Signer {
  private cache = new Map<string, Entry>();
  private pending = new Map<string, Promise<string>>();
  private queue = new Map<string, Waiter[]>();
  private scheduled = false;
  private now: () => number;
  private request: typeof requestSignedUrls;

  constructor(
    private info: MagazineInfo,
    private token: string,
    opts: { now?: () => number; request?: typeof requestSignedUrls } = {},
  ) {
    this.now = opts.now ?? Date.now;
    this.request = opts.request ?? requestSignedUrls;
  }

  private key(type: SignType, page: number): string {
    return `${type}:${page}`;
  }

  private fresh(key: string): string | null {
    const e = this.cache.get(key);
    return e && e.exp - this.now() > REFRESH_MARGIN ? e.url : null;
  }

  get(realPage: number, type: SignType = 'contents'): Promise<string> {
    const key = this.key(type, realPage);
    const hit = this.fresh(key);
    if (hit) return Promise.resolve(hit);
    const inflight = this.pending.get(key);
    if (inflight) return inflight;
    const p = new Promise<string>((resolve, reject) => {
      this.queue.set(key, [{ resolve, reject }]);
    });
    this.pending.set(key, p);
    if (!this.scheduled) {
      this.scheduled = true;
      queueMicrotask(() => void this.flush());
    }
    return p;
  }

  async prefetch(realPages: number[], type: SignType = 'contents'): Promise<void> {
    await Promise.all(realPages.map((p) => this.get(p, type)));
  }

  invalidate(realPage: number, type: SignType = 'contents'): void {
    this.cache.delete(this.key(type, realPage));
  }

  private async flush(): Promise<void> {
    this.scheduled = false;
    const queue = this.queue;
    this.queue = new Map();
    const byType: Record<SignType, number[]> = { contents: [], thumbnail: [] };
    for (const key of queue.keys()) {
      const i = key.indexOf(':');
      byType[key.slice(0, i) as SignType].push(Number(key.slice(i + 1)));
    }
    const jobs: Promise<void>[] = [];
    for (const type of ['contents', 'thumbnail'] as SignType[]) {
      const pages = byType[type];
      for (let i = 0; i < pages.length; i += MAX_BATCH) {
        jobs.push(this.runBatch(type, pages.slice(i, i + MAX_BATCH), queue));
      }
    }
    await Promise.all(jobs);
  }

  private async runBatch(type: SignType, pages: number[], queue: Map<string, Waiter[]>) {
    let urls: string[] | undefined;
    let err: unknown;
    try {
      urls = await this.request(this.info, this.token, type, pages);
    } catch (e) {
      err = e;
    }
    pages.forEach((page, i) => {
      const key = this.key(type, page);
      const waiters = queue.get(key) ?? [];
      this.pending.delete(key);
      if (urls && urls[i]) {
        const url = urls[i];
        this.cache.set(key, { url, exp: parseExpiry(url) ?? this.now() + DEFAULT_TTL });
        waiters.forEach((w) => w.resolve(url));
      } else {
        const e = err ?? new Error(`no signed url for page ${page}`);
        waiters.forEach((w) => w.reject(e));
      }
    });
  }
}
