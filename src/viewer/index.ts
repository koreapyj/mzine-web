import css from './styles.css?inline';
import { ApiError, fetchContentInfo } from '../api';
import { buildPages, buildSpreads, isLtr, spreadIndexOf, startPageIndex } from '../pages';
import { loadSettings, saveSettings, type Settings } from '../settings';
import { Signer } from '../signer';
import type { LaunchParams, MagazineInfo, PageItem, Spread } from '../types';
import { createSidebar, h, type Sidebar } from './sidebar';

const ZOOMS = [1, 1.5, 2, 3, 4];
const NARROW = 800;

let active: Viewer | null = null;

export function openViewer(p: LaunchParams): void {
  active?.destroy();
  active = new Viewer(p);
}

export function closeViewer(): void {
  active?.close();
}

class Viewer {
  private host = document.createElement('div');
  private root: ShadowRoot;
  private bar = h('div', 'bar');
  private body = h('div', 'body');
  private stage = h('div', 'stage');
  private titleEl = h('div', 'title', '모아진');
  private controls = h('div', 'group');
  private indicator = h('div', 'indicator');
  private btns: Record<string, HTMLButtonElement> = {};
  private sidebar?: Sidebar;

  private info!: MagazineInfo;
  private pages: PageItem[] = [];
  private spreads: Spread[] = [];
  private signer!: Signer;
  private ltr = true;
  private st: Settings = { dual: false, fit: 'height', intercept: true };
  private builtDual = false;
  private cur = 0;
  private si = 0;
  private zi = 0;
  private gen = 0;
  private pageEls: HTMLElement[] = [];
  private preloaded: HTMLImageElement[] = [];
  private cleanups: Array<() => void> = [];
  private destroyed = false;
  private prevOverflow: [string, string] = ['', ''];

  constructor(private p: LaunchParams) {
    const s = this.host.style;
    s.cssText = 'position:fixed;inset:0;z-index:2147483000;display:block;';
    this.root = this.host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = css;
    const root = h('div', 'root');
    root.append(this.bar, this.body);
    this.root.append(style, root);
    this.body.append(this.stage);

    this.bar.append(this.titleEl, this.button('close', '✕', '닫기 (Esc)', () => this.close()));
    this.stage.append(this.message('불러오는 중…'));

    this.prevOverflow = [document.documentElement.style.overflow, document.body.style.overflow];
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.append(this.host);

    if (!(history.state && history.state.moazineViewer)) history.pushState({ moazineViewer: true }, '');
    this.listen(window, 'popstate', () => this.destroy());
    this.listen(window, 'keydown', (e) => this.onKey(e as KeyboardEvent), true);
    this.listen(window, 'keyup', (e) => e.stopPropagation(), true);
    this.listen(window, 'keypress', (e) => e.stopPropagation(), true);

    void this.load();
  }

  // ---------- lifecycle ----------

  close(): void {
    if (this.destroyed) return;
    if (history.state && history.state.moazineViewer) history.back(); // popstate -> destroy
    else this.destroy();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.gen++;
    this.cleanups.forEach((f) => f());
    this.sidebar?.destroy();
    this.host.remove();
    document.documentElement.style.overflow = this.prevOverflow[0];
    document.body.style.overflow = this.prevOverflow[1];
    this.preloaded = [];
    if (active === this) active = null;
  }

  private listen(t: EventTarget, type: string, fn: (e: Event) => void, capture = false, passive?: boolean) {
    const opts: AddEventListenerOptions = { capture, passive };
    t.addEventListener(type, fn, opts);
    this.cleanups.push(() => t.removeEventListener(type, fn, opts));
  }

  private message(text: string, withClose = false): HTMLElement {
    const m = h('div', 'msg');
    m.append(h('div', undefined, text));
    if (withClose) {
      const b = h('button', undefined, '닫기');
      b.addEventListener('click', () => this.close());
      m.append(b);
    }
    return m;
  }

  private button(key: string, label: string, title: string, fn: () => void): HTMLButtonElement {
    const b = h('button', undefined, label);
    b.title = title;
    b.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus off buttons (Space key)
    b.addEventListener('click', fn);
    this.btns[key] = b;
    return b;
  }

  // ---------- loading ----------

  private async load() {
    try {
      const info = await fetchContentInfo(this.p);
      if (this.destroyed) return;
      this.info = info;
      this.pages = buildPages(info);
      if (!this.pages.length) throw new ApiError('표시할 페이지가 없습니다.');
      this.ltr = isLtr(info);
      this.st = loadSettings();
      this.signer = new Signer(info, this.p.token);
      this.cur = startPageIndex(this.pages, info, this.p);
      this.titleEl.textContent = info.title;
      this.buildUi();
      this.rebuildSpreads();
      this.renderSpread();
    } catch (e) {
      if (this.destroyed) return;
      const msg = e instanceof ApiError ? e.message : `불러오지 못했습니다: ${(e as Error)?.message ?? e}`;
      this.stage.replaceChildren(this.message(msg, true));
    }
  }

  private buildUi() {
    const b = this.button.bind(this);
    const leftIsPrev = this.ltr;
    const prev = b('prev', leftIsPrev ? '‹' : '›', '이전 페이지', () => this.step(-1));
    const next = b('next', leftIsPrev ? '›' : '‹', '다음 페이지', () => this.step(1));
    const nav = h('div', 'group');
    nav.append(...(leftIsPrev ? [prev, this.indicator, next] : [next, this.indicator, prev]));

    const view = h('div', 'group');
    view.append(
      b('dual', '', '', () => this.toggleDual()),
      b('fit', '', '', () => this.toggleFit()),
    );
    const zoom = h('div', 'group');
    zoom.append(
      b('zout', '−', '축소 (-)', () => this.setZoom(this.zi - 1)),
      b('zreset', '100%', '확대 초기화 (0)', () => this.setZoom(0)),
      b('zin', '+', '확대 (+)', () => this.setZoom(this.zi + 1)),
    );
    const side = b('side', '☰', '목차 / 썸네일', () => this.toggleSidebar());
    this.controls.append(nav, h('div', 'sep'), view, h('div', 'sep'), zoom, h('div', 'sep'), side);
    this.bar.insertBefore(this.controls, this.btns.close);

    this.sidebar = createSidebar(this.info, this.pages, this.signer, (i) => {
      this.goPage(i);
      if (this.host.clientWidth <= NARROW) this.toggleSidebar(false);
    });
    this.sidebar.el.style.display = 'none';
    this.body.insertBefore(this.sidebar.el, this.stage);

    this.bindStage();
    const ro = new ResizeObserver(() => this.onResize());
    ro.observe(this.stage);
    this.cleanups.push(() => ro.disconnect());
  }

  // ---------- state ----------

  private effectiveDual(): boolean {
    const narrow = this.host.clientWidth < NARROW && this.host.clientHeight > this.host.clientWidth;
    return this.st.dual && !narrow;
  }

  private rebuildSpreads() {
    this.builtDual = this.effectiveDual();
    this.spreads = buildSpreads(this.pages, this.builtDual, this.ltr);
    this.si = spreadIndexOf(this.spreads, this.cur);
  }

  private toggleDual() {
    this.st.dual = !this.st.dual;
    saveSettings({ dual: this.st.dual });
    this.rebuildSpreads();
    this.renderSpread();
  }

  private toggleFit() {
    this.st.fit = this.st.fit === 'height' ? 'width' : 'height';
    saveSettings({ fit: this.st.fit });
    this.stage.scrollTo(0, 0);
    this.layout();
    this.updateUi();
  }

  private toggleSidebar(show?: boolean) {
    if (!this.sidebar) return;
    const el = this.sidebar.el;
    el.style.display = (show ?? el.style.display === 'none') ? '' : 'none';
    this.btns.side.classList.toggle('on', el.style.display !== 'none');
  }

  private setZoom(i: number) {
    const z = Math.max(0, Math.min(ZOOMS.length - 1, i));
    if (z === this.zi) return;
    const s = this.stage;
    const fx = (s.scrollLeft + s.clientWidth / 2) / (s.scrollWidth || 1);
    const fy = (s.scrollTop + s.clientHeight / 2) / (s.scrollHeight || 1);
    this.zi = z;
    this.layout();
    s.scrollLeft = fx * s.scrollWidth - s.clientWidth / 2;
    s.scrollTop = fy * s.scrollHeight - s.clientHeight / 2;
    this.updateUi();
  }

  private onResize() {
    if (this.effectiveDual() !== this.builtDual) {
      this.rebuildSpreads();
      this.renderSpread();
    } else {
      this.layout();
    }
  }

  // ---------- navigation ----------

  private step(d: number) { this.goSpread(this.si + d); }

  private goSpread(n: number) {
    n = Math.max(0, Math.min(this.spreads.length - 1, n));
    if (n === this.si) return;
    this.si = n;
    this.cur = Math.min(...this.spreads[n]);
    this.renderSpread();
  }

  private goPage(pageIndex: number) {
    this.cur = pageIndex;
    this.si = spreadIndexOf(this.spreads, pageIndex);
    this.renderSpread();
  }

  /** Left/right visual direction -> reading-order step. */
  private visual(dir: -1 | 1): number { return this.ltr ? dir : -dir; }

  // ---------- rendering ----------

  private renderSpread() {
    const gen = ++this.gen;
    const spread = this.spreads[this.si];
    const wrap = h('div', 'spread');
    this.pageEls = spread.map((i) => this.makePage(this.pages[i], gen));
    wrap.append(...this.pageEls);
    this.stage.replaceChildren(wrap);
    this.stage.scrollTo(0, 0);
    this.layout();
    this.updateUi();
    this.sidebar?.setCurrent(this.cur);
    this.prefetch();
  }

  private makePage(pg: PageItem, gen: number): HTMLElement {
    const box = h('div', 'page');
    const img = h('img');
    img.draggable = false;
    img.alt = `${pg.label}쪽`;
    box.append(img);
    let tries = 0;
    const fail = () => {
      if (gen !== this.gen) return;
      const err = h('div', 'err');
      const retry = h('button', undefined, '다시 시도');
      retry.addEventListener('click', () => {
        err.remove();
        tries = 0;
        this.signer.invalidate(pg.realPage);
        load();
      });
      err.append(h('div', undefined, `${pg.label}쪽을 불러오지 못했습니다.`), retry);
      box.append(err);
    };
    const load = () => {
      this.signer.get(pg.realPage).then((url) => {
        if (gen === this.gen) img.src = url;
      }, fail);
    };
    img.onload = () => img.classList.add('loaded');
    img.onerror = () => {
      if (gen !== this.gen) return;
      if (tries++ < 1) {
        this.signer.invalidate(pg.realPage);
        load();
      } else fail();
    };
    load();
    return box;
  }

  private layout() {
    const spread = this.spreads[this.si];
    if (!spread) return;
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight;
    if (!W || !H) return;
    const ps = spread.map((i) => this.pages[i]);
    const aspect = ps.reduce((a, q) => a + q.width / q.height, 0);
    let hs = this.st.fit === 'width' ? W / aspect : Math.min(H, W / aspect);
    hs = Math.floor(hs * ZOOMS[this.zi]);
    ps.forEach((q, k) => {
      const s = this.pageEls[k].style;
      s.width = `${Math.floor((hs * q.width) / q.height)}px`;
      s.height = `${hs}px`;
    });
    this.stage.classList.toggle('pannable', this.zi > 0 || this.st.fit === 'width');
  }

  private updateUi() {
    const ps = this.spreads[this.si].map((i) => this.pages[i]).sort((a, b) => a.index - b.index);
    const labels = ps.length > 1 ? `${ps[0].label}-${ps[ps.length - 1].label}` : `${ps[0].label}`;
    this.indicator.textContent = `${labels} / ${this.pages.length}`;
    const dualOn = this.st.dual;
    const auto = dualOn && !this.builtDual;
    this.btns.dual.textContent = dualOn ? '양면' : '단면';
    this.btns.dual.title = auto ? '화면이 좁아 단면으로 표시 중 (설정은 양면)' : '단면 / 양면 전환';
    this.btns.dual.classList.toggle('on', this.builtDual);
    this.btns.fit.textContent = this.st.fit === 'height' ? '높이 맞춤' : '폭 맞춤';
    this.btns.fit.title = '높이 맞춤 / 폭 맞춤 전환';
    this.btns.zreset.textContent = `${Math.round(ZOOMS[this.zi] * 100)}%`;
    this.btns.prev.classList.toggle('disabled', this.si === 0);
    this.btns.next.classList.toggle('disabled', this.si === this.spreads.length - 1);
  }

  private prefetch() {
    const reals = (from: number, to: number) => {
      const out: number[] = [];
      for (let i = Math.max(0, from); i <= Math.min(this.spreads.length - 1, to); i++) {
        if (i !== this.si) for (const pi of this.spreads[i]) out.push(this.pages[pi].realPage);
      }
      return out;
    };
    const list = reals(this.si - 1, this.si + 2);
    if (list.length) this.signer.prefetch(list).catch(() => {});
    const gen = this.gen;
    this.preloaded = [];
    for (const pi of this.spreads[this.si + 1] ?? []) {
      this.signer.get(this.pages[pi].realPage).then((url) => {
        if (gen !== this.gen) return;
        const im = new Image();
        im.src = url;
        this.preloaded.push(im);
      }, () => {});
    }
  }

  // ---------- input ----------

  private onKey(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    let handled = true;
    switch (e.key) {
      case 'ArrowLeft': this.step(this.visual(-1)); break;
      case 'ArrowRight': this.step(this.visual(1)); break;
      case 'PageUp': this.step(-1); break;
      case 'PageDown': this.step(1); break;
      case ' ': this.step(e.shiftKey ? -1 : 1); break;
      case 'Home': this.goSpread(0); break;
      case 'End': this.goSpread(this.spreads.length - 1); break;
      case '+': case '=': this.setZoom(this.zi + 1); break;
      case '-': this.setZoom(this.zi - 1); break;
      case '0': this.setZoom(0); break;
      case 'Escape': this.close(); break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  }

  private bindStage() {
    const s = this.stage;
    const scrollable = () => s.scrollWidth > s.clientWidth + 1 || s.scrollHeight > s.clientHeight + 1;

    // wheel: ctrl = zoom; plain = page turn when nothing to scroll
    let lastWheel = 0;
    this.listen(s, 'wheel', (ev) => {
      const e = ev as WheelEvent;
      if (e.ctrlKey) {
        e.preventDefault();
        this.setZoom(this.zi + (e.deltaY < 0 ? 1 : -1));
      } else if (this.zi === 0 && this.st.fit === 'height') {
        e.preventDefault();
        const now = performance.now();
        const d = e.deltaY || e.deltaX;
        if (now - lastWheel < 300 || Math.abs(d) < 4) return;
        lastWheel = now;
        this.step(d > 0 ? 1 : -1);
      }
    }, false, false);

    // mouse drag to pan
    let drag: { x: number; y: number; sl: number; st: number; id: number } | null = null;
    let moved = false;
    this.listen(s, 'pointerdown', (ev) => {
      const e = ev as PointerEvent;
      if (e.pointerType !== 'mouse' || e.button !== 0 || !scrollable()) return;
      if ((e.target as Element).closest('button')) return;
      drag = { x: e.clientX, y: e.clientY, sl: s.scrollLeft, st: s.scrollTop, id: e.pointerId };
      moved = false;
    });
    this.listen(s, 'pointermove', (ev) => {
      const e = ev as PointerEvent;
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!moved && Math.hypot(dx, dy) > 4) {
        moved = true;
        s.setPointerCapture(drag.id);
        s.classList.add('dragging');
      }
      if (moved) {
        s.scrollLeft = drag.sl - dx;
        s.scrollTop = drag.st - dy;
      }
    });
    const endDrag = () => { drag = null; s.classList.remove('dragging'); };
    this.listen(s, 'pointerup', endDrag);
    this.listen(s, 'pointercancel', endDrag);

    // click zones / double click zoom
    let clickTimer = 0;
    this.cleanups.push(() => clearTimeout(clickTimer));
    this.listen(s, 'click', (ev) => {
      const e = ev as MouseEvent;
      if (moved) { moved = false; return; }
      if ((e.target as Element).closest('button') || this.zi !== 0) return;
      const r = s.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width;
      if (fx > 0.3 && fx < 0.7) return;
      clearTimeout(clickTimer);
      clickTimer = window.setTimeout(() => this.step(this.visual(fx <= 0.3 ? -1 : 1)), 220);
    });
    this.listen(s, 'dblclick', (e) => {
      if ((e.target as Element).closest('button')) return;
      clearTimeout(clickTimer);
      this.setZoom(this.zi === 0 ? 2 : 0);
    });

    // touch swipe (native scrolling handles panning when zoomed)
    let t0: { x: number; y: number } | null = null;
    this.listen(s, 'touchstart', (ev) => {
      const e = ev as TouchEvent;
      t0 = e.touches.length === 1 && this.zi === 0 && !scrollable() ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    }, false, true);
    this.listen(s, 'touchend', (ev) => {
      const e = ev as TouchEvent;
      if (!t0 || !e.changedTouches.length) return;
      const dx = e.changedTouches[0].clientX - t0.x;
      const dy = e.changedTouches[0].clientY - t0.y;
      t0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) this.step(this.visual(dx < 0 ? 1 : -1));
    }, false, true);
  }
}
