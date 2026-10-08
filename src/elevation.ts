import { DEM_TILES, ELEVATION_FALLBACK_ZOOM, ELEVATION_ZOOM } from './config';
import type { LngLat } from './geo';

const TILE_SIZE = 256;
// 直近に使ったタイルだけ保持する（同じ付近を続けてタップしたときに再取得しない）
const tileCache = new Map<string, Promise<ImageData>>();
const TILE_CACHE_MAX = 6;

function tileUrl(z: number, x: number, y: number): string {
  return DEM_TILES[0].replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

async function loadTile(z: number, x: number, y: number, signal?: AbortSignal): Promise<ImageData> {
  const res = await fetch(tileUrl(z, x, y), { signal });
  if (!res.ok) throw new Error(`DEM tile ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob());
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas 2d unavailable');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
}

function getTile(z: number, x: number, y: number, signal?: AbortSignal): Promise<ImageData> {
  const key = `${z}/${x}/${y}`;
  let p = tileCache.get(key);
  if (!p) {
    p = loadTile(z, x, y, signal);
    p.catch(() => tileCache.delete(key));
    tileCache.set(key, p);
    if (tileCache.size > TILE_CACHE_MAX) tileCache.delete(tileCache.keys().next().value!);
  }
  return p;
}

async function sample({ lng, lat }: LngLat, z: number, signal?: AbortSignal): Promise<number> {
  const n = 2 ** z;
  const latRad = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180;
  const fx = ((((lng + 180) / 360) % 1) + 1) % 1 * n;
  const fy = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const tx = Math.floor(fx);
  const ty = Math.min(n - 1, Math.max(0, Math.floor(fy)));
  const px = Math.min(TILE_SIZE - 1, Math.floor((fx - tx) * TILE_SIZE));
  const py = Math.min(TILE_SIZE - 1, Math.floor((fy - ty) * TILE_SIZE));

  const img = await getTile(z, tx, ty, signal);
  const i = (py * TILE_SIZE + px) * 4;
  const [r, g, b] = [img.data[i], img.data[i + 1], img.data[i + 2]];
  return r * 256 + g + b / 256 - 32768;
}

/**
 * 地点の標高（m）を Terrarium 形式の DEM タイルから求める。海は負の値（水深）になる。
 * 3D地形のオン・オフに関係なく使えるよう、タイルを直接読んでデコードする。
 * 海底地形は低ズームのタイルにしか入っておらず、高ズームの海上は 0m になるため、
 * 0m や取得失敗のときは低ズームで読み直す。
 */
export async function getElevation(p: LngLat, signal?: AbortSignal): Promise<number> {
  try {
    const v = await sample(p, ELEVATION_ZOOM, signal);
    if (v !== 0) return v;
  } catch (e) {
    if (signal?.aborted) throw e;
  }
  return sample(p, ELEVATION_FALLBACK_ZOOM, signal);
}

export function formatElevation(m: number): string {
  const v = Math.round(m);
  return v < 0 ? `水深 約${-v}m` : `標高 約${v}m`;
}
