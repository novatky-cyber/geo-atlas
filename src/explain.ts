import { Marker, type Map as MapLibreMap, type MapMouseEvent } from 'maplibre-gl';
import { h } from './dom';
import { formatElevation, getElevation } from './elevation';
import { formatDistance, formatLatLng, type LngLat } from './geo';
import type { BottomSheet } from './sheet';
import { getSummary, savedNearby, searchNearby, type GeoArticle, type WikiSummary } from './wikipedia';

const LABEL_SEARCH_PX = 24;

type Context = {
  point: LngLat;
  mapName: string | null;
  /** ジオサーチ結果。一覧に戻るときは再検索せずこれを使う */
  articles: GeoArticle[] | null;
};

/**
 * 地図タップ → 解説シート。表示の優先順位（docs/REQUIREMENTS.md 5-3）：
 *   1. 近くに内蔵解説データがある → 4層解説（フェーズ3で追加）
 *   2. Wikipedia ジオサーチで周辺記事を最大5件 → 選ぶと要約
 *   3. どちらもない → 緯度経度・標高・地図上の地名
 * 緯度経度・標高・地名は、どの場合もシート上部に表示する。
 */
export class TapExplainer {
  private abort?: AbortController;
  private marker?: Marker;

  constructor(
    private readonly map: MapLibreMap,
    private readonly sheet: BottomSheet,
  ) {
    map.on('click', (e) => this.onTap(e));
    sheet.onClose(() => {
      this.abort?.abort();
      this.marker?.remove();
    });
  }

  private onTap(e: MapMouseEvent): void {
    const { lng, lat } = e.lngLat;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    const point = { lng: wrapLng(lng), lat };

    this.abort?.abort();
    this.abort = new AbortController();
    const { signal } = this.abort;

    if (!this.marker) {
      this.marker = new Marker({ element: h('div', { class: 'tap-pin', 'aria-hidden': 'true' }) });
    }
    this.marker.setLngLat(point).addTo(this.map);

    const ctx: Context = { point, mapName: this.labelNear(e), articles: null };
    this.sheet.open('half');
    void this.showList(ctx, signal);
  }

  /** タップ位置の近くに描かれている地名ラベル（日本語優先） */
  private labelNear(e: MapMouseEvent): string | null {
    const { x, y } = e.point;
    const features = this.map.queryRenderedFeatures([
      [x - LABEL_SEARCH_PX, y - LABEL_SEARCH_PX],
      [x + LABEL_SEARCH_PX, y + LABEL_SEARCH_PX],
    ]);
    for (const f of features) {
      if (f.layer.type !== 'symbol') continue;
      const name = f.properties['name:ja'] ?? f.properties.name;
      if (typeof name === 'string' && name.trim()) return name;
    }
    return null;
  }

  // --- 画面：地点の情報 + 周辺記事一覧 ---

  private async showList(ctx: Context, signal: AbortSignal): Promise<void> {
    const listArea = h('div', { class: 'sheet-section' }, h('p', { class: 'muted' }, '周辺のWikipedia記事を探しています…'));
    this.render(this.placeHeader(ctx, signal), listArea);

    // 1. 内蔵解説データ：フェーズ3で実装

    // 2. Wikipedia ジオサーチ
    try {
      ctx.articles ??= await searchNearby(ctx.point, signal);
      if (signal.aborted) return;
      listArea.replaceChildren(
        ...(ctx.articles.length > 0
          ? [h('h3', {}, '周辺の記事'), this.articleList(ctx, ctx.articles, signal)]
          : [h('p', { class: 'muted' }, '周辺10km以内にWikipedia記事は見つかりませんでした。')]),
      );
    } catch (err) {
      if (signal.aborted) return;
      console.warn('[wikipedia]', err);
      // 通信できない場合は、端末に保存済みの近くの記事を出す
      const saved = savedNearby(ctx.point);
      listArea.replaceChildren(
        h('p', { class: 'muted' }, 'Wikipediaに接続できませんでした。'),
        ...(saved.length > 0
          ? [
              h('h3', {}, '保存済みの記事（オフライン表示）'),
              this.articleList(
                ctx,
                saved.map((s) => ({ lang: s.lang, title: s.title, lat: s.lat!, lng: s.lng!, distM: s.distM })),
                signal,
              ),
            ]
          : []),
      );
    }
  }

  private placeHeader(ctx: Context, signal: AbortSignal): HTMLElement {
    const elev = h('span', {}, '標高 取得中…');
    getElevation(ctx.point, signal)
      .then((m) => (elev.textContent = formatElevation(m)))
      .catch(() => {
        if (!signal.aborted) elev.textContent = '標高 取得できませんでした';
      });
    return h(
      'header',
      { class: 'place-header' },
      h('h2', {}, ctx.mapName ?? 'この地点'),
      h('p', { class: 'place-meta' }, h('span', {}, formatLatLng(ctx.point)), elev),
    );
  }

  private articleList(ctx: Context, items: GeoArticle[], signal: AbortSignal): HTMLElement {
    return h(
      'ul',
      { class: 'article-list' },
      ...items.map((a) => {
        const btn = h(
          'button',
          { type: 'button', class: 'article-item' },
          h('span', { class: 'article-title' }, a.title),
          h('span', { class: 'article-dist' }, `${formatDistance(a.distM)}${a.lang === 'en' ? '・英語版' : ''}`),
        );
        btn.addEventListener('click', () => void this.showArticle(ctx, a, signal));
        return h('li', {}, btn);
      }),
    );
  }

  // --- 画面：記事の要約 ---

  private async showArticle(ctx: Context, a: GeoArticle, signal: AbortSignal): Promise<void> {
    const back = h('button', { type: 'button', class: 'back-button' }, '‹ 一覧に戻る');
    back.addEventListener('click', () => void this.showList(ctx, signal));
    const content = h('div', { class: 'sheet-section' }, h('p', { class: 'muted' }, '読み込み中…'));
    this.render(back, content);
    this.sheet.setState('full');

    try {
      const s = await getSummary(a.lang, a.title, signal, { lat: a.lat, lng: a.lng });
      if (signal.aborted) return;
      content.replaceChildren(...this.summaryView(s));
      const others = (ctx.articles ?? []).filter((o) => o.title !== a.title);
      if (others.length > 0) {
        content.append(h('section', { class: 'sub-section' }, h('h3', {}, '関連地点（周辺の記事）'), this.articleList(ctx, others, signal)));
      }
      content.append(this.sourceSection(s));
    } catch (err) {
      if (signal.aborted) return;
      console.warn('[wikipedia]', err);
      content.replaceChildren(h('p', { class: 'muted' }, '要約を読み込めませんでした。通信状況を確認してください。'));
    }
  }

  private summaryView(s: WikiSummary): Node[] {
    const nodes: (HTMLElement | null)[] = [
      h('h2', { class: 'article-heading' }, s.title),
      s.description ? h('p', { class: 'muted' }, s.description) : null,
      s.thumbnail ? h('img', { class: 'article-thumb', src: s.thumbnail, alt: '', loading: 'lazy' }) : null,
      h('p', { class: 'article-extract' }, s.extract || '（要約がありません）'),
    ];
    return nodes.filter((n): n is HTMLElement => n != null);
  }

  private sourceSection(s: WikiSummary): HTMLElement {
    const langName = s.lang === 'ja' ? '日本語版' : '英語版';
    return h(
      'section',
      { class: 'sub-section' },
      h('h3', {}, '出典'),
      h(
        'p',
        {},
        h('a', { href: s.url, target: '_blank', rel: 'noopener' }, `Wikipedia（${langName}）「${s.title}」`),
        ' ／ ',
        h('a', { href: 'https://creativecommons.org/licenses/by-sa/4.0/deed.ja', target: '_blank', rel: 'noopener' }, 'CC BY-SA 4.0'),
      ),
    );
  }

  private render(...nodes: Node[]): void {
    this.sheet.body.replaceChildren(...nodes);
    this.sheet.body.scrollTop = 0;
  }
}

/** 地球儀を何周も回したときの経度を -180〜180 に戻す */
function wrapLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}
