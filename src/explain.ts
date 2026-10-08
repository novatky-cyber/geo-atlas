import { Marker, type Map as MapLibreMap, type MapMouseEvent } from 'maplibre-gl';
import { h } from './dom';
import { formatElevation, getElevation } from './elevation';
import { formatDistance, formatLatLng, type LngLat } from './geo';
import { PLACE_MARKER_LAYER } from './placeLayer';
import {
  findPlaceNear,
  LAYER_LABELS,
  loadPlace,
  SCALE_ZOOM,
  type LayerKey,
  type Place,
  type PlaceSummary,
} from './places';
import type { BottomSheet } from './sheet';
import { getSummary, savedNearby, searchNearby, type GeoArticle, type WikiSummary } from './wikipedia';

const LABEL_SEARCH_PX = 24;
const MARKER_HIT_PX = 18;

/** 最後に開いたタブ。地点を移っても同じ観点で読み比べられるよう引き継ぐ */
let currentLayer: LayerKey = 'terrain';

type Context = {
  point: LngLat;
  mapName: string | null;
  /** ジオサーチ結果。一覧に戻るときは再検索せずこれを使う */
  articles: GeoArticle[] | null;
  /** 内蔵解説データのある地点（なければ null） */
  placeId: string | null;
};

/**
 * 地図タップ → 解説シート。表示の優先順位（docs/REQUIREMENTS.md 5-3）：
 *   1. 近くに内蔵解説データがある → 4層解説（マーカーのタップ、または規模ごとの半径内）
 *   2. Wikipedia ジオサーチで周辺記事を最大5件 → 選ぶと要約
 *   3. どちらもない → 緯度経度・標高・地図上の地名
 * 緯度経度・標高・地名は、どの場合もシート上部に表示する。
 */
export class TapExplainer {
  private abort?: AbortController;
  private marker?: Marker;
  private places: PlaceSummary[] = [];

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

  setPlaces(places: PlaceSummary[]): void {
    this.places = places;
  }

  private onTap(e: MapMouseEvent): void {
    const { lng, lat } = e.lngLat;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    const tapped = { lng: wrapLng(lng), lat };
    const place = this.placeAtMarker(e) ?? findPlaceNear(this.places, tapped);
    // 内蔵地点がある場合は、その地点を基準に標高や周辺記事を出す
    const point = place ? { lng: place.lng, lat: place.lat } : tapped;
    this.open({ point, mapName: place ? null : this.labelNear(e), articles: null, placeId: place?.id ?? null });
  }

  /** 内蔵地点を開く（関連地点からの移動用） */
  openPlace(place: PlaceSummary): void {
    this.map.flyTo({ center: [place.lng, place.lat], zoom: Math.max(this.map.getZoom(), SCALE_ZOOM[place.scale]), essential: true });
    this.open({ point: { lng: place.lng, lat: place.lat }, mapName: null, articles: null, placeId: place.id });
  }

  private open(ctx: Context): void {
    this.abort?.abort();
    this.abort = new AbortController();
    const { signal } = this.abort;

    if (!this.marker) {
      this.marker = new Marker({ element: h('div', { class: 'tap-pin', 'aria-hidden': 'true' }) });
    }
    this.marker.setLngLat(ctx.point).addTo(this.map);

    this.sheet.open('half');
    if (ctx.placeId) void this.showPlace(ctx, ctx.placeId, signal);
    else void this.showList(ctx, signal);
  }

  /** タップ位置の近くにある内蔵地点のマーカー */
  private placeAtMarker(e: MapMouseEvent): PlaceSummary | null {
    if (!this.map.getLayer(PLACE_MARKER_LAYER)) return null;
    const { x, y } = e.point;
    const ids = new Set(
      this.map
        .queryRenderedFeatures(
          [
            [x - MARKER_HIT_PX, y - MARKER_HIT_PX],
            [x + MARKER_HIT_PX, y + MARKER_HIT_PX],
          ],
          { layers: [PLACE_MARKER_LAYER] },
        )
        .map((f) => f.properties.id as string),
    );
    // マーカーが重なっている（地球儀を引いて見ているときの日本付近など）ときは、タップ位置に最も近いもの
    let best: PlaceSummary | null = null;
    let bestD = Infinity;
    for (const p of this.places) {
      if (!ids.has(p.id)) continue;
      const q = this.map.project([p.lng, p.lat]);
      const d = (q.x - x) ** 2 + (q.y - y) ** 2;
      if (d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
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
    let back: HTMLElement | null = null;
    if (ctx.placeId) {
      const placeId = ctx.placeId;
      back = h('button', { type: 'button', class: 'back-button' }, '‹ 解説に戻る');
      back.addEventListener('click', () => void this.showPlace(ctx, placeId, signal));
    }
    this.render(back, this.placeHeader(ctx, signal), listArea);

    // Wikipedia ジオサーチ
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

  private placeHeader(ctx: Context, signal: AbortSignal, title?: string, ...extra: HTMLElement[]): HTMLElement {
    const elev = h('span', {}, '標高 取得中…');
    getElevation(ctx.point, signal)
      .then((m) => (elev.textContent = formatElevation(m)))
      .catch(() => {
        if (!signal.aborted) elev.textContent = '標高 取得できませんでした';
      });
    return h(
      'header',
      { class: 'place-header' },
      h('h2', {}, title ?? ctx.mapName ?? 'この地点'),
      ...extra,
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

  // --- 画面：内蔵解説（4層） ---

  private async showPlace(ctx: Context, id: string, signal: AbortSignal): Promise<void> {
    this.render(h('p', { class: 'muted' }, '解説を読み込み中…'));
    let place: Place;
    try {
      place = await loadPlace(id);
    } catch (err) {
      if (signal.aborted) return;
      console.warn('[place]', err);
      // 解説を読めない（オフラインで未保存など）ときは Wikipedia 側の表示に切り替える
      void this.showList({ ...ctx, placeId: null }, signal);
      return;
    }
    if (signal.aborted) return;

    const header = this.placeHeader(
      ctx,
      signal,
      place.name,
      h(
        'p',
        { class: 'place-sub' },
        place.name_local ? h('span', {}, place.name_local) : null,
        place.landform ? h('span', { class: 'tag' }, place.landform) : null,
      ),
      h('p', { class: 'place-summary' }, place.summary),
    );

    const panel = h('div', { class: 'layer-panel', role: 'tabpanel' });
    const tabs = h('div', { class: 'layer-tabs', role: 'tablist', 'aria-label': '解説の観点' });
    const select = (key: LayerKey) => {
      currentLayer = key;
      for (const b of tabs.querySelectorAll('button')) {
        b.setAttribute('aria-selected', String(b.dataset.key === key));
      }
      panel.replaceChildren(h('p', {}, place.layers[key]));
    };
    for (const key of Object.keys(LAYER_LABELS) as LayerKey[]) {
      const b = h('button', { type: 'button', role: 'tab', 'data-key': key }, LAYER_LABELS[key]);
      b.addEventListener('click', () => select(key));
      tabs.append(b);
    }
    select(currentLayer);

    const wiki = h('button', { type: 'button', class: 'link-button' }, '周辺のWikipedia記事を見る ›');
    wiki.addEventListener('click', () => void this.showList(ctx, signal));

    this.render(
      header,
      tabs,
      panel,
      h(
        'section',
        { class: 'sub-section' },
        h('h3', {}, 'なぜ？のつながり'),
        h('ol', { class: 'why-chain' }, ...place.why_chain.map((w) => h('li', {}, w))),
      ),
      h(
        'section',
        { class: 'sub-section' },
        h('h3', {}, '旅先で見るポイント'),
        h('ul', { class: 'look-for' }, ...place.look_for.map((w) => h('li', {}, w))),
      ),
      this.relatedSection(place),
      h(
        'section',
        { class: 'sub-section' },
        h('h3', {}, '出典'),
        h(
          'ul',
          { class: 'sources' },
          ...place.sources.map((s) => h('li', {}, h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.title))),
        ),
        place.note ? h('p', { class: 'note' }, `メモ：${place.note}`) : null,
      ),
      wiki,
    );
  }

  private relatedSection(place: Place): HTMLElement | null {
    const related = place.related
      .map((id) => this.places.find((p) => p.id === id))
      .filter((p): p is PlaceSummary => p != null);
    if (related.length === 0) return null;
    return h(
      'section',
      { class: 'sub-section' },
      h('h3', {}, '関連地点'),
      h(
        'div',
        { class: 'related' },
        ...related.map((r) => {
          const b = h('button', { type: 'button', class: 'chip' }, r.name);
          b.addEventListener('click', () => this.openPlace(r));
          return b;
        }),
      ),
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

  private render(...nodes: (Node | null)[]): void {
    this.sheet.body.replaceChildren(...nodes.filter((n): n is Node => n != null));
    this.sheet.body.scrollTop = 0;
  }
}

/** 地球儀を何周も回したときの経度を -180〜180 に戻す */
function wrapLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}
