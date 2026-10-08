import type { Map as MapLibreMap, ExpressionSpecification } from 'maplibre-gl';

/** 日本語名を優先し、なければ現地名を表示する */
const JA_FIRST: ExpressionSpecification = ['coalesce', ['get', 'name:ja'], ['get', 'name']];

/**
 * 地名ラベルを日本語優先に差し替える。
 * 道路番号（ref）や番地（housenumber）など name を使わないラベルはそのまま残す。
 */
export function applyJapaneseLabels(map: MapLibreMap): void {
  for (const layer of map.getStyle().layers) {
    if (layer.type !== 'symbol') continue;
    const textField = map.getLayoutProperty(layer.id, 'text-field');
    if (textField == null) continue;
    if (!JSON.stringify(textField).includes('name')) continue;
    map.setLayoutProperty(layer.id, 'text-field', JA_FIRST);
  }
}
