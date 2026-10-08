export type SheetState = 'closed' | 'half' | 'full';

const HALF_RATIO = 0.45;
const TAP_SLOP_PX = 6;

/**
 * 画面下から出る解説シート。半分表示 → 全画面表示 → 閉じる の3段階。
 * ハンドル部分のドラッグで位置を変え、指を離すと近い段階に吸着する。
 * ハンドルのタップで 半分 ⇔ 全画面 を切り替える。
 */
export class BottomSheet {
  readonly body: HTMLElement;
  private state: SheetState = 'closed';
  private onCloseHandlers: (() => void)[] = [];

  constructor(private readonly root: HTMLElement) {
    this.body = root.querySelector('.sheet-body') as HTMLElement;
    const grip = root.querySelector('.sheet-grip') as HTMLElement;
    (root.querySelector('.sheet-close') as HTMLButtonElement).addEventListener('click', () => this.setState('closed'));
    this.bindDrag(grip);
    window.addEventListener('resize', () => this.apply(false));
    this.apply(false);
  }

  get current(): SheetState {
    return this.state;
  }

  onClose(fn: () => void): void {
    this.onCloseHandlers.push(fn);
  }

  open(state: Exclude<SheetState, 'closed'> = 'half'): void {
    // 既に全画面なら全画面のまま中身だけ差し替える
    if (this.state === 'full') return;
    this.setState(state);
  }

  setState(state: SheetState): void {
    const wasOpen = this.state !== 'closed';
    this.state = state;
    this.apply(true);
    if (state === 'closed' && wasOpen) this.onCloseHandlers.forEach((fn) => fn());
  }

  /** 各段階でのシート上端の位置（シート自身の高さに対する translateY のpx） */
  private offsets() {
    const height = this.root.offsetHeight;
    const vh = window.innerHeight;
    return { full: 0, half: Math.max(0, height - vh * HALF_RATIO), closed: height + 24 };
  }

  private apply(animate: boolean, overridePx?: number): void {
    const y = overridePx ?? this.offsets()[this.state];
    this.root.classList.toggle('sheet-animate', animate);
    this.root.style.transform = `translateY(${y}px)`;
    this.root.dataset.state = this.state;
    this.root.setAttribute('aria-hidden', String(this.state === 'closed'));
    this.root.inert = this.state === 'closed';
  }

  private bindDrag(grip: HTMLElement): void {
    let startY = 0;
    let startOffset = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;
    let dragging = false;

    grip.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      dragging = true;
      startY = lastY = e.clientY;
      lastT = e.timeStamp;
      velocity = 0;
      startOffset = this.offsets()[this.state];
      grip.setPointerCapture(e.pointerId);
    });

    grip.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dt = e.timeStamp - lastT;
      if (dt > 0) velocity = (e.clientY - lastY) / dt;
      lastY = e.clientY;
      lastT = e.timeStamp;
      const y = Math.max(0, startOffset + (e.clientY - startY));
      this.apply(false, y);
    });

    const end = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      const moved = e.clientY - startY;
      if (Math.abs(moved) < TAP_SLOP_PX) {
        this.setState(this.state === 'full' ? 'half' : 'full');
        return;
      }
      // 指を離した位置に、勢い（px/ms）を少し加味して最も近い段階へ
      const projected = startOffset + moved + velocity * 200;
      const o = this.offsets();
      const candidates: SheetState[] = ['full', 'half', 'closed'];
      const next = candidates.reduce((best, s) =>
        Math.abs(o[s] - projected) < Math.abs(o[best] - projected) ? s : best,
      );
      this.setState(next);
    };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }
}
