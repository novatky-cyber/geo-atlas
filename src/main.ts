import { AttributionControl, Map as MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import { BASEMAP_STYLE_URL, INITIAL_VIEW } from './config';
import { TapExplainer } from './explain';
import { showGestureHintOnce } from './hint';
import { applyJapaneseLabels } from './labels';
import { locateOnce } from './locate';
import { BottomSheet } from './sheet';
import { addTerrainSources, setTerrainEnabled } from './terrain';
import { showToast } from './toast';

// MapLibre v6 は Worker を import.meta.url 基準で読むため、バンドル後のURLを明示する
setWorkerUrl(workerUrl);

const map = new MapLibreMap({
  container: 'map',
  style: BASEMAP_STYLE_URL,
  center: INITIAL_VIEW.center,
  zoom: INITIAL_VIEW.zoom,
  maxPitch: 75,
  attributionControl: false,
});

// クレジット表記（© OpenStreetMap contributors 等はスタイル側から自動で入る）
map.addControl(new AttributionControl({ compact: true }), 'top-left');
// 方位リセット用のコンパス（ズームはピンチ操作で行う）
map.addControl(new NavigationControl({ showZoom: false, visualizePitch: true }), 'top-right');

map.on('style.load', () => {
  // 地球儀表示。ズームインすると MapLibre が自動で平面地図へ移行する
  map.setProjection({ type: 'globe' });
  map.setSky({
    'sky-color': '#7fb7e6',
    'horizon-color': '#dceaf5',
    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0],
  });
  addTerrainSources(map);
  applyJapaneseLabels(map);
});

let styleErrorShown = false;
map.on('error', (e) => {
  console.warn('[map]', e.error);
  if (!map.isStyleLoaded() && !styleErrorShown) {
    styleErrorShown = true;
    showToast('地図を読み込めませんでした。通信状況を確認してください', 6000);
  }
});

// --- タップで解説（ボトムシート） ---
const sheet = new BottomSheet(document.getElementById('sheet') as HTMLElement);
new TapExplainer(map, sheet);

showGestureHintOnce();

// --- 下部ツールバー ---
const btnGlobe = document.getElementById('btn-globe') as HTMLButtonElement;
const btnTerrain = document.getElementById('btn-terrain') as HTMLButtonElement;
const btnLocate = document.getElementById('btn-locate') as HTMLButtonElement;

btnGlobe.addEventListener('click', () => {
  map.flyTo({ center: map.getCenter(), zoom: INITIAL_VIEW.zoom, pitch: 0, bearing: 0, essential: true });
});

let terrainOn = false;
btnTerrain.addEventListener('click', () => {
  terrainOn = !terrainOn;
  setTerrainEnabled(map, terrainOn);
  btnTerrain.setAttribute('aria-pressed', String(terrainOn));
  if (terrainOn) {
    map.easeTo({ pitch: 60, duration: 800 });
    if (map.getZoom() < 8) showToast('3D地形は山地に近づくと分かりやすくなります');
  } else {
    map.easeTo({ pitch: 0, duration: 600 });
  }
});

btnLocate.addEventListener('click', () => locateOnce(map, btnLocate));

// デバッグ用（ブラウザのコンソールから参照できるようにする）
declare global {
  interface Window {
    __map?: MapLibreMap;
  }
}
if (import.meta.env.DEV) window.__map = map;
