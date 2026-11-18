export const store = new Map<string, unknown>();
export const unsafeWindow: Record<string, unknown> = (globalThis as any).window ?? {};
export function GM_getValue(k: string, d?: unknown) {
  return store.has(k) ? store.get(k) : d;
}
export function GM_setValue(k: string, v: unknown) {
  store.set(k, v);
}
