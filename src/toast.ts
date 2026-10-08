const el = document.getElementById('toast') as HTMLDivElement;
let timer: number | undefined;

/** 画面下部に短いメッセージを表示する */
export function showToast(message: string, ms = 3500): void {
  el.textContent = message;
  el.hidden = false;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    el.hidden = true;
  }, ms);
}
