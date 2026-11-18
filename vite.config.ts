import { defineConfig } from 'vitest/config';
import monkey from 'vite-plugin-monkey';

// CI sets USERSCRIPT_VERSION (release name, YYYY.mm.dd.<run id>) and GITHUB_REPOSITORY.
const version = process.env.USERSCRIPT_VERSION;
const repo = process.env.GITHUB_REPOSITORY;
const updateUrl = repo
  ? `https://github.com/${repo}/releases/latest/download/moazine-web-viewer.user.js`
  : undefined;

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/main.ts',
      build: { fileName: 'moazine-web-viewer.user.js' },
      userscript: {
        name: 'Moazine Web Viewer',
        namespace: 'moazine-web-viewer',
        description: '모아진 PC 뷰어(Windows 앱) 대신 브라우저에서 잡지를 엽니다.',
        match: ['https://www.moazine.com/*'],
        'run-at': 'document-end',
        grant: ['unsafeWindow', 'GM_registerMenuCommand', 'GM_getValue', 'GM_setValue'],
        noframes: true,
        ...(version ? { version } : {}),
        ...(updateUrl ? { updateURL: updateUrl, downloadURL: updateUrl } : {}),
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
