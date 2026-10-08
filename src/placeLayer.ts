import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { PlaceSummary } from './places';

export const PLACE_MARKER_LAYER = 'place-markers';
const SOURCE = 'places';

let features: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** 内蔵解説データのある地点をマーカーで表示する（style.load のたびに呼ぶ） */
export function addPlaceLayers(map: MapLibreMap): void {
  map.addSource(SOURCE, { type: 'geojson', data: features });
  map.addLayer({
    id: PLACE_MARKER_LAYER,
    type: 'circle',
    source: SOURCE,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 5, 8, 8],
      'circle-color': '#e8590c',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  });
  map.addLayer({
    id: 'place-labels',
    type: 'symbol',
    source: SOURCE,
    minzoom: 3,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 13,
      'text-offset': [0, 0.9],
      'text-anchor': 'top',
      'text-optional': true,
    },
    paint: {
      'text-color': '#7a2d00',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.5,
    },
  });
}

/** マーカーのデータを差し替える。スタイル読み込み前なら、addPlaceLayers の時点でこのデータが使われる */
export function setPlaceMarkers(map: MapLibreMap, index: PlaceSummary[]): void {
  features = {
    type: 'FeatureCollection',
    features: index.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { id: p.id, name: p.name },
    })),
  };
  (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(features);
}
