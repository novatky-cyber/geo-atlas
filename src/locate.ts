import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import { showToast } from './toast';

let marker: Marker | undefined;

function createDot(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'location-dot';
  el.setAttribute('aria-label', '現在地');
  return el;
}

/**
 * 現在地へ一度だけ移動する。
 * バッテリー配慮のため watchPosition（常時追跡）は使わない。
 * 位置情報が使えなくても、地図はそのまま使い続けられる。
 */
export function locateOnce(map: MapLibreMap, button: HTMLButtonElement): void {
  if (!('geolocation' in navigator)) {
    showToast('この端末では位置情報が使えません');
    return;
  }
  button.disabled = true;
  button.classList.add('busy');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      button.disabled = false;
      button.classList.remove('busy');
      const lngLat: [number, number] = [pos.coords.longitude, pos.coords.latitude];
      if (!marker) marker = new Marker({ element: createDot() });
      marker.setLngLat(lngLat).addTo(map);
      map.flyTo({ center: lngLat, zoom: Math.max(map.getZoom(), 13), essential: true });
    },
    (err) => {
      button.disabled = false;
      button.classList.remove('busy');
      const reason =
        err.code === err.PERMISSION_DENIED
          ? '位置情報が許可されていません（設定 > Safari > 位置情報 で変更できます）'
          : err.code === err.TIMEOUT
            ? '現在地の取得がタイムアウトしました'
            : '現在地を取得できませんでした';
      showToast(reason);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
  );
}
