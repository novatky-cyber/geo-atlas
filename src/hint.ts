import { loadJSON, saveJSON } from './storage';

const KEY = 'gesture-hint-shown';
const AUTO_HIDE_MS = 8000;

/** 初回起動時だけ、操作ヒントを小さく表示する */
export function showGestureHintOnce(): void {
  if (loadJSON<boolean>(KEY, false)) return;
  const el = document.getElementById('hint');
  if (!el) return;
  el.hidden = false;
  const hide = () => {
    el.hidden = true;
    saveJSON(KEY, true);
  };
  el.addEventListener('click', hide, { once: true });
  window.setTimeout(hide, AUTO_HIDE_MS);
}
