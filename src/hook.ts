import { unsafeWindow } from '$';
import { loadSettings } from './settings';
import type { LaunchParams } from './types';

const SUPPRESS_MS = 30_000;

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** args: (apiToken, magazineId, magazinetype, issueId, page, kidsProfileId, articleId) */
export function parseWindowViewerArgs(args: unknown[]): LaunchParams | null {
  const [token, magazineId, type, issueRaw, pageRaw, profileRaw, articleRaw] = args;
  if (type !== 'moazine') return null;
  const issueId = num(issueRaw);
  if (issueId === undefined || issueId <= 0) return null;
  if (typeof token !== 'string' || !token) return null;
  const page = num(pageRaw);
  const articleId = num(articleRaw) ?? num(magazineId);
  const profile = num(profileRaw);
  return {
    token,
    issueId,
    articleId: articleId !== undefined && articleId > 0 ? articleId : undefined,
    page: page === undefined || page < 0 ? undefined : page,
    profileId: profile ? profile : -1,
  };
}

// Firefox runs userscripts in a sandbox: functions/objects handed to the page must be exported.
declare const exportFunction: undefined | (<T>(fn: T, target: object) => T);
function toPage<T>(fn: T): T {
  return typeof exportFunction === 'function' ? exportFunction(fn, unsafeWindow) : fn;
}

let fetchInstalled = false;
let suppressUntil = 0;

function suppressFetch(): void {
  suppressUntil = Date.now() + SUPPRESS_MS;
  if (fetchInstalled) return;
  fetchInstalled = true;
  const w = unsafeWindow as unknown as { fetch: typeof fetch };
  const orig = w.fetch;
  const page = unsafeWindow as unknown as { Response: typeof Response; Promise: PromiseConstructor };
  w.fetch = toPage(function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    if (Date.now() < suppressUntil) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith('http://localhost:3052/') || url.startsWith('http://localhost:3053/')) {
        return page.Promise.resolve(
          new page.Response('{"message":"ok"}', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
    }
    return orig.call(this, input, init);
  } as typeof fetch);
}

export function installHook(open: (p: LaunchParams) => void): void {
  const w = unsafeWindow as unknown as Record<string, unknown>;
  let done = false;
  const wrap = (): boolean => {
    const orig = w.windowViewer;
    if (typeof orig !== 'function' || done) return done;
    done = true;
    w.windowViewer = toPage(function (this: unknown, ...args: unknown[]) {
      if (loadSettings().intercept) {
        const p = parseWindowViewerArgs(args);
        if (p) {
          suppressFetch();
          try {
            open(p);
          } catch (e) {
            console.error('[moazine] open failed', e);
          }
          return 'javascript:void(0)';
        }
      }
      return (orig as (...a: unknown[]) => unknown).apply(this, args);
    });
    return true;
  };
  if (wrap()) return;
  const started = Date.now();
  const timer = setInterval(() => {
    if (wrap() || Date.now() - started > 30_000) clearInterval(timer);
  }, 200);
}
