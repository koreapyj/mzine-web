# Module contracts (shared by workers — do not change signatures without the orchestrator)

src/types.ts            — DTOs + LaunchParams/PageItem/Spread (done, fixed)

src/api.ts   (worker A)
  export class ApiError extends Error { code?: string; status?: number }
  export const API_BASE = 'https://api-v2.moazine.com'
  export function fetchContentInfo(p: LaunchParams): Promise<MagazineInfo>
  export function requestSignedUrls(info: MagazineInfo, token: string, type: SignType, realPages: number[]): Promise<string[]>
     // result[i] corresponds to realPages[i]

src/signer.ts (worker A)
  export function parseExpiry(url: string): number | null   // ms epoch from `se` param
  export class Signer {
    constructor(info: MagazineInfo, token: string, opts?: { now?: () => number; request?: typeof requestSignedUrls })
    get(realPage: number, type?: SignType): Promise<string>        // cached, batches concurrent calls, refreshes 5 min before expiry
    prefetch(realPages: number[], type?: SignType): Promise<void>  // one batched request for missing/expiring pages
    invalidate(realPage: number, type?: SignType): void            // after <img> error
  }

src/pages.ts  (worker A)
  export function buildPages(info: MagazineInfo): PageItem[]       // issue_page_no > 0, sorted
  export function isLtr(info: MagazineInfo): boolean
  export function buildSpreads(pages: PageItem[], dual: boolean, ltr: boolean): Spread[]
     // single: [[0],[1],...]; dual: [0] alone, then pairs (1,2),(3,4)...; last odd alone; RTL reverses pair order
  export function spreadIndexOf(spreads: Spread[], pageIndex: number): number
  export function startPageIndex(pages: PageItem[], info: MagazineInfo, p: LaunchParams): number
     // p.page>0 → that realPage; else first page with articleId===p.articleId; else recent_view_page>0; else 0

src/settings.ts (worker A)
  export interface Settings { dual: boolean; fit: 'height' | 'width'; intercept: boolean }
  export function loadSettings(): Settings
  export function saveSettings(patch: Partial<Settings>): void     // GM_getValue/GM_setValue from '$'

src/hook.ts   (worker A)
  export function installHook(open: (p: LaunchParams) => void): void
     // wraps unsafeWindow.windowViewer (polls until defined), returns 'javascript:void(0)' when intercepting;
     // suppresses fetch('http://localhost:3052/appstate') for 30 s after an intercept; respects settings.intercept
  export function parseWindowViewerArgs(args: unknown[]): LaunchParams | null   // pure, unit-tested

src/viewer/index.ts (worker B)
  export function openViewer(p: LaunchParams): void   // creates overlay (Shadow DOM), loads data via api/pages/signer
  export function closeViewer(): void

src/main.ts (orchestrator)
  installHook(openViewer); GM_registerMenuCommand toggle for settings.intercept
