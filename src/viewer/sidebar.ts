import type { MagazineInfo, PageItem } from '../types';
import type { Signer } from '../signer';

export interface Sidebar {
  el: HTMLElement;
  setCurrent(pageIndex: number): void;
  destroy(): void;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function createSidebar(
  info: MagazineInfo, pages: PageItem[], signer: Signer, go: (pageIndex: number) => void,
): Sidebar {
  const el = h('div', 'sidebar');
  const tabs = h('div', 'tabs');
  const panel = h('div', 'panel');
  el.append(tabs, panel);

  const toc = (info.toc ?? []).filter((t) => t.subject);
  const pageOfToc = (page: number) => {
    const p = pages.find((x) => x.realPage === page);
    return p ? p.index : -1;
  };

  // --- TOC ---
  const tocList = h('div');
  const tocItems = toc.map((t) => {
    const b = h('div', 'toc-item', t.subject);
    b.addEventListener('click', () => { const i = pageOfToc(t.page); if (i >= 0) go(i); });
    tocList.append(b);
    return { b, index: pageOfToc(t.page) };
  });

  // --- Thumbnails ---
  const grid = h('div', 'thumbs');
  const thumbEls: HTMLElement[] = [];
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      io.unobserve(en.target);
      const pg = pages[Number((en.target as HTMLElement).dataset.i)];
      const ph = en.target.querySelector('.ph') as HTMLElement;
      const load = (retry: boolean) => {
        signer.get(pg.realPage, 'thumbnail').then((url) => {
          const img = new Image();
          img.draggable = false;
          img.onerror = () => { if (retry) { signer.invalidate(pg.realPage, 'thumbnail'); load(false); } };
          img.src = url;
          ph.replaceChildren(img);
        }).catch(() => {});
      };
      load(true);
    }
  }, { root: panel, rootMargin: '300px' });
  for (const pg of pages) {
    const t = h('div', 'thumb');
    t.dataset.i = String(pg.index);
    const ph = h('div', 'ph');
    ph.style.aspectRatio = `${pg.width} / ${pg.height}`;
    t.append(ph, h('div', undefined, String(pg.label)));
    t.addEventListener('click', () => go(pg.index));
    grid.append(t);
    thumbEls.push(t);
  }

  // --- Tabs ---
  const showTabs: Array<{ name: string; node: HTMLElement; btn: HTMLButtonElement }> = [];
  const addTab = (name: string, node: HTMLElement) => {
    const btn = h('button', undefined, name);
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => select(name));
    showTabs.push({ name, node, btn });
    tabs.append(btn);
  };
  if (toc.length) addTab('목차', tocList);
  addTab('썸네일', grid);

  let active = '';
  let current = 0;
  function select(name: string) {
    active = name;
    for (const t of showTabs) t.btn.classList.toggle('on', t.name === name);
    const t = showTabs.find((x) => x.name === name)!;
    panel.replaceChildren(t.node);
    if (name === '썸네일') {
      thumbEls.forEach((x) => io.observe(x));
      thumbEls[current]?.scrollIntoView({ block: 'center' });
    } else {
      io.disconnect();
    }
  }
  select(showTabs[0].name);
  if (showTabs.length === 1) tabs.style.display = 'none';

  let prevThumb: HTMLElement | undefined;
  let prevToc: HTMLElement | undefined;
  return {
    el,
    setCurrent(i) {
      current = i;
      prevThumb?.classList.remove('cur');
      prevThumb = thumbEls[i];
      prevThumb?.classList.add('cur');
      if (active === '썸네일') prevThumb?.scrollIntoView({ block: 'nearest' });
      prevToc?.classList.remove('cur');
      let found: HTMLElement | undefined;
      for (const t of tocItems) if (t.index >= 0 && t.index <= i) found = t.b;
      prevToc = found;
      prevToc?.classList.add('cur');
    },
    destroy() { io.disconnect(); el.remove(); },
  };
}
