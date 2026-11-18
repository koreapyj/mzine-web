import { describe, expect, it } from 'vitest';
import { buildPages, buildSpreads, isLtr, spreadIndexOf, startPageIndex } from '../src/pages';
import type { MagazineInfo } from '../src/types';

const art = (n: number, article = 1) => ({
  article_id: article, content: '', size: '100*200', page_no: n, issue_page_no: n, thumbnail: '',
});
const info = (arts: any[], extra: Partial<MagazineInfo> = {}): MagazineInfo =>
  ({ magazine_id: 1, issue_id: 2, title: 't', cdn_base_url: 'x', articles: arts, ...extra }) as MagazineInfo;

describe('buildPages', () => {
  it('filters page 0, sorts, parses size', () => {
    const p = buildPages(info([art(3, 9), art(0, 0), art(1), art(2)]));
    expect(p.map((x) => x.realPage)).toEqual([1, 2, 3]);
    expect(p.map((x) => x.index)).toEqual([0, 1, 2]);
    expect(p[0]).toMatchObject({ width: 100, height: 200, articleId: 1 });
  });
});

describe('buildSpreads', () => {
  const mk = (n: number) => buildPages(info(Array.from({ length: n }, (_, i) => art(i + 1))));
  it('single', () => expect(buildSpreads(mk(3), false, true)).toEqual([[0], [1], [2]]));
  it('dual even count', () => expect(buildSpreads(mk(4), true, true)).toEqual([[0], [1, 2], [3]]));
  it('dual odd count', () => expect(buildSpreads(mk(5), true, true)).toEqual([[0], [1, 2], [3, 4]]));
  it('RTL', () => expect(buildSpreads(mk(5), true, false)).toEqual([[0], [2, 1], [4, 3]]));
  it('empty', () => expect(buildSpreads([], true, true)).toEqual([]));
  it('spreadIndexOf', () => {
    const s = buildSpreads(mk(5), true, true);
    expect(spreadIndexOf(s, 0)).toBe(0);
    expect(spreadIndexOf(s, 4)).toBe(2);
  });
});

describe('isLtr', () => {
  it('maps flag', () => {
    expect(isLtr(info([], { is_rtl_flip: 'Y' }))).toBe(true);
    expect(isLtr(info([], { is_rtl_flip: 'N' }))).toBe(false);
  });
});

describe('startPageIndex', () => {
  const i = info([art(1, 10), art(2, 20), art(3, 20), art(4, 30)], { recent_view_page: 4 });
  const pages = buildPages(i);
  const base = { token: 't', issueId: 2, profileId: -1 };
  it('page first', () => expect(startPageIndex(pages, i, { ...base, page: 3, articleId: 10 })).toBe(2));
  it('article next', () => expect(startPageIndex(pages, i, { ...base, page: -1, articleId: 20 })).toBe(1));
  it('recent next', () => expect(startPageIndex(pages, i, base)).toBe(3));
  it('default 0', () => expect(startPageIndex(pages, { ...i, recent_view_page: 0 }, base)).toBe(0));
});
