import type { Map as MapLibreMap } from 'maplibre-gl';
import { DEM_ATTRIBUTION, DEM_MAX_ZOOM, DEM_TILES, TERRAIN_EXAGGERATION } from './config';

const HILLSHADE_SOURCE = 'dem-hillshade';
// 3D地形用は別ソースにする（陰影と共有すると解像度が落ちるため。MapLibre公式サンプルと同じ構成）
const TERRAIN_SOURCE = 'dem-terrain';
const HILLSHADE_LAYER = 'hillshade';

function demSource() {
  return {
    type: 'raster-dem' as const,
    tiles: DEM_TILES,
    encoding: 'terrarium' as const,
    tileSize: 256,
    maxzoom: DEM_MAX_ZOOM,
    attribution: DEM_ATTRIBUTION,
  };
}

/** 地形の陰影（常時表示）と3D地形用ソースを追加する */
export function addTerrainSources(map: MapLibreMap): void {
  map.addSource(HILLSHADE_SOURCE, demSource());
  map.addSource(TERRAIN_SOURCE, demSource());

  // 陰影は道路・建物・ラベルより下、水域・土地被覆より上に置く
  const layers = map.getStyle().layers;
  const beforeId = layers.find(
    (l) => l.type === 'symbol' || l.id.startsWith('road') || l.id.startsWith('building') || l.id.startsWith('tunnel'),
  )?.id;

  map.addLayer(
    {
      id: HILLSHADE_LAYER,
      type: 'hillshade',
      source: HILLSHADE_SOURCE,
      paint: {
        'hillshade-exaggeration': 0.45,
        'hillshade-shadow-color': '#2b3a42',
        'hillshade-highlight-color': '#ffffff',
        'hillshade-accent-color': '#5a6b5d',
      },
    },
    beforeId,
  );
}

export function setTerrainEnabled(map: MapLibreMap, enabled: boolean): void {
  map.setTerrain(enabled ? { source: TERRAIN_SOURCE, exaggeration: TERRAIN_EXAGGERATION } : null);
}
