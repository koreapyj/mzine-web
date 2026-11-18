import { describe, expect, it, vi } from 'vitest';
vi.mock('$', () => import('./gm-stub'));
import { parseWindowViewerArgs } from '../src/hook';

describe('parseWindowViewerArgs', () => {
  it('moazine', () => {
    expect(parseWindowViewerArgs(['tok', 11, 'moazine', 22, 5, 7])).toEqual({
      token: 'tok', issueId: 22, articleId: 11, page: 5, profileId: 7,
    });
  });
  it('zinio -> null', () => expect(parseWindowViewerArgs(['tok', 11, 'zinio', undefined, -1, -1])).toBeNull());
  it('string numbers', () => {
    expect(parseWindowViewerArgs(['tok', '11', 'moazine', '22', '5', '7'])).toMatchObject({
      issueId: 22, articleId: 11, page: 5, profileId: 7,
    });
  });
  it('page -1 -> undefined', () => {
    expect(parseWindowViewerArgs(['tok', 11, 'moazine', 22, -1, -1])!.page).toBeUndefined();
    expect(parseWindowViewerArgs(['tok', 11, 'moazine', 22, null, -1])!.page).toBeUndefined();
  });
  it('missing profile -> -1', () => {
    expect(parseWindowViewerArgs(['tok', 11, 'moazine', 22, -1])!.profileId).toBe(-1);
    expect(parseWindowViewerArgs(['tok', 11, 'moazine', 22, -1, 0])!.profileId).toBe(-1);
  });
  it('bad issue -> null', () => expect(parseWindowViewerArgs(['tok', 11, 'moazine', 0, -1])).toBeNull());
});

describe('installHook', () => {
  it('intercepts moazine launches, passes others through, suppresses appstate polling', async () => {
    const { installHook } = await import('../src/hook');
    const w = window as unknown as Record<string, any>;
    const origViewer = vi.fn(() => 'moazineviewer://show?{}');
    const origFetch = vi.fn(async () => new Response('real'));
    w.windowViewer = origViewer;
    w.fetch = origFetch;
    const open = vi.fn();
    installHook(open);

    expect(w.windowViewer('tok', 11, 'moazine', 22, -1, undefined)).toBe('javascript:void(0)');
    expect(open).toHaveBeenCalledWith({ token: 'tok', issueId: 22, articleId: 11, page: undefined, profileId: -1 });
    expect(origViewer).not.toHaveBeenCalled();

    const r = await w.fetch('http://localhost:3052/appstate');
    expect(await r.json()).toEqual({ message: 'ok' });
    await w.fetch('https://api-v2.moazine.com/x');
    expect(origFetch).toHaveBeenCalledTimes(1);

    expect(w.windowViewer('tok', 11, 'zinio', undefined, 1, -1)).toBe('moazineviewer://show?{}');
    expect(origViewer).toHaveBeenCalledTimes(1);
  });
});
