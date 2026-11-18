import type { LaunchParams, MagazineInfo, PageItem, Spread } from './types';

export function buildPages(info: MagazineInfo): PageItem[] {
  return info.articles
    .filter((a) => a.issue_page_no > 0)
    .slice()
    .sort((a, b) => a.issue_page_no - b.issue_page_no)
    .map((a, index) => {
      const [w, h] = (a.size || '').split('*').map((n) => parseInt(n, 10));
      return {
        index,
        realPage: a.issue_page_no,
        label: a.page_no,
        articleId: a.article_id,
        width: w > 0 ? w : 0,
        height: h > 0 ? h : 0,
      };
    });
}

/** "Y" (or unspecified) = left-to-right; "N" = right-to-left. Unverified assumption. */
export function isLtr(info: MagazineInfo): boolean {
  return info.is_rtl_flip !== 'N';
}

/** Spreads in visual left→right order. For RTL, each pair is shown reversed (later page on the left). */
export function buildSpreads(pages: PageItem[], dual: boolean, ltr: boolean): Spread[] {
  const n = pages.length;
  if (!dual) return pages.map((_, i) => [i]);
  const out: Spread[] = [];
  if (n === 0) return out;
  out.push([0]);
  for (let i = 1; i < n; i += 2) {
    out.push(i + 1 < n ? (ltr ? [i, i + 1] : [i + 1, i]) : [i]);
  }
  return out;
}

export function spreadIndexOf(spreads: Spread[], pageIndex: number): number {
  const i = spreads.findIndex((s) => s.includes(pageIndex));
  return i < 0 ? 0 : i;
}

export function startPageIndex(pages: PageItem[], info: MagazineInfo, p: LaunchParams): number {
  if (p.page !== undefined && p.page > 0) {
    const i = pages.findIndex((x) => x.realPage === p.page);
    if (i >= 0) return i;
  }
  if (p.articleId !== undefined && p.articleId > 0) {
    const i = pages.findIndex((x) => x.articleId === p.articleId);
    if (i >= 0) return i;
  }
  const r = info.recent_view_page;
  if (r !== undefined && r > 0) {
    const i = pages.findIndex((x) => x.realPage === r);
    if (i >= 0) return i;
  }
  return 0;
}
