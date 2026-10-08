export type LngLat = { lng: number; lat: number };

/** 2点間の距離（メートル、ハバーサイン式） */
export function distanceM(a: LngLat, b: LngLat): number {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)}km`;
}

/** 例：北緯35.0116° 東経135.7681° */
export function formatLatLng({ lat, lng }: LngLat): string {
  const ns = lat >= 0 ? '北緯' : '南緯';
  const ew = lng >= 0 ? '東経' : '西経';
  return `${ns}${Math.abs(lat).toFixed(4)}° ${ew}${Math.abs(lng).toFixed(4)}°`;
}
