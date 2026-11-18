import { describe, expect, it, vi } from 'vitest';
import { Signer, parseExpiry } from '../src/signer';

const mkUrl = (p: number, se?: string) =>
  `https://s/${p}.jpg?key=k${se ? `&se=${encodeURIComponent(se)}` : ''}&sig=x`;

describe('parseExpiry', () => {
  it('parses se', () => expect(parseExpiry(mkUrl(1, '2026-11-18T03:40:06Z'))).toBe(Date.parse('2026-11-18T03:40:06Z')));
  it('null when missing', () => expect(parseExpiry(mkUrl(1))).toBeNull());
});

function setup() {
  let t = Date.parse('2026-11-18T00:00:00Z');
  const request = vi.fn(async (_i: any, _t: string, _type: any, pages: number[]) =>
    pages.map((p) => mkUrl(p, new Date(t + 60 * 60 * 1000).toISOString())));
  const s = new Signer({} as any, 'tok', { now: () => t, request: request as any });
  return { s, request, advance: (ms: number) => (t += ms) };
}

describe('Signer', () => {
  it('batches concurrent gets and caches', async () => {
    const { s, request } = setup();
    const [a, b] = await Promise.all([s.get(1), s.get(2)]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][3]).toEqual([1, 2]);
    expect(a).toContain('/1.jpg');
    expect(b).toContain('/2.jpg');
    await s.get(1);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('coalesces duplicate requests', async () => {
    const { s, request } = setup();
    await Promise.all([s.get(1), s.get(1)]);
    expect(request.mock.calls[0][3]).toEqual([1]);
  });
  it('refreshes within 5 min of expiry', async () => {
    const { s, request, advance } = setup();
    await s.get(1);
    advance(54 * 60 * 1000);
    await s.get(1);
    expect(request).toHaveBeenCalledTimes(1);
    advance(2 * 60 * 1000);
    await s.get(1);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('invalidate forces refetch', async () => {
    const { s, request } = setup();
    await s.get(1);
    s.invalidate(1);
    await s.get(1);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('prefetch batches only missing, splits at 20, separates types', async () => {
    const { s, request } = setup();
    await s.get(1);
    await s.prefetch(Array.from({ length: 25 }, (_, i) => i + 1));
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[1][3]).toHaveLength(20);
    expect(request.mock.calls[2][3]).toHaveLength(4);
    await s.get(1, 'thumbnail');
    expect(request.mock.calls[3][2]).toBe('thumbnail');
  });
  it('rejects on request failure and allows retry', async () => {
    const { s, request } = setup();
    request.mockRejectedValueOnce(new Error('boom'));
    await expect(s.get(1)).rejects.toThrow('boom');
    await expect(s.get(1)).resolves.toContain('/1.jpg');
  });
});
