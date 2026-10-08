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
