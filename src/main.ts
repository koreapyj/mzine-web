import { GM_registerMenuCommand } from '$';
import { installHook } from './hook';
import { loadSettings, saveSettings } from './settings';
import { openViewer } from './viewer/index';

installHook(openViewer);

GM_registerMenuCommand('웹 뷰어로 열기 켜기/끄기', () => {
  const intercept = !loadSettings().intercept;
  saveSettings({ intercept });
  alert(intercept ? '모아진 웹 뷰어: 켜짐 (PC 뷰어 버튼이 브라우저에서 열립니다)' : '모아진 웹 뷰어: 꺼짐 (기존 Windows 앱을 실행합니다)');
});
