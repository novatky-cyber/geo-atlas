// 外部データソース。すべてキー不要・登録不要のもののみ（docs/REQUIREMENTS.md「3. 費用ルール」）

/** ベースマップ：OpenFreeMap（OSMベースのベクタータイル） */
export const BASEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/**
 * 標高：AWS Terrain Tiles（Terrarium形式、Mapzen由来）
 * パス形式（s3.amazonaws.com/elevation-tiles-prod/...）はCORSヘッダーが返らないため、
 * バケット名をホストに含む形式を使う
 */
export const DEM_TILES = ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'];
export const DEM_MAX_ZOOM = 15;
export const DEM_ATTRIBUTION =
  '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener">標高: Mapzen Terrain Tiles (AWS)</a>';

/** 初期表示：日本を中心にした地球儀 */
export const INITIAL_VIEW = {
  center: [138, 36] as [number, number],
  zoom: 1.6,
};

export const TERRAIN_EXAGGERATION = 1.5;

/** 標高の取得に使う DEM タイルのズーム（12 ≒ 1ピクセル約30m） */
export const ELEVATION_ZOOM = 12;
/** 海上（高ズームでは 0m になる）や取得失敗時に使うズーム。海底地形を含む */
export const ELEVATION_FALLBACK_ZOOM = 9;

/** Wikipedia：日本語版を優先し、記事がなければ英語版にフォールバック */
export const WIKI_LANGS = ['ja', 'en'] as const;
export type WikiLang = (typeof WIKI_LANGS)[number];
/** ジオサーチの半径（MediaWiki の上限は 10000m） */
export const GEOSEARCH_RADIUS_M = 10000;
export const GEOSEARCH_LIMIT = 5;
/** 端末に保存する Wikipedia 要約の上限件数（古いものから削除） */
export const WIKI_CACHE_LIMIT = 300;
