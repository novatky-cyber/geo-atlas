import { distanceM, type LngLat } from './geo';

// 内蔵解説データ（public/data/places/）。形式は docs/REQUIREMENTS.md「4. 解説データの作り方」

export type Scale = 'country' | 'region' | 'city' | 'spot';
export type LayerKey = 'terrain' | 'life' | 'history' | 'culture';

export type PlaceSummary = { id: string; name: string; lat: number; lng: number; scale: Scale };

export type Place = PlaceSummary & {
  name_local?: string;
  landform?: string;
  summary: string;
  layers: Record<LayerKey, string>;
  why_chain: string[];
  look_for: string[];
  related: string[];
  sources: { title: string; url: string }[];
  note?: string;
};

export const LAYER_LABELS: Record<LayerKey, string> = {
  terrain: '地形',
  life: '営み',
  history: '歴史',
  culture: '文化',
};

/** タップ地点がこの距離以内なら、その地点の内蔵解説を出す（規模ごと） */
const SCALE_RADIUS_M: Record<Scale, number> = {
  country: 300_000,
  region: 25_000,
  city: 6_000,
  spot: 2_000,
};

/** 地図を寄せるときのズーム（規模ごと） */
export const SCALE_ZOOM: Record<Scale, number> = { country: 5, region: 9, city: 12, spot: 14 };

const BASE = `${import.meta.env.BASE_URL}data/places/`;

let indexPromise: Promise<PlaceSummary[]> | undefined;

export function loadPlaceIndex(): Promise<PlaceSummary[]> {
  indexPromise ??= fetchJSON<PlaceSummary[]>(`${BASE}index.json`).catch((e) => {
    indexPromise = undefined; // 失敗したら次回やり直す
    throw e;
  });
  return indexPromise;
}

const placeCache = new Map<string, Promise<Place>>();

export function loadPlace(id: string): Promise<Place> {
  let p = placeCache.get(id);
  if (!p) {
    p = fetchJSON<Place>(`${BASE}${encodeURIComponent(id)}.json`);
    p.catch(() => placeCache.delete(id));
    placeCache.set(id, p);
  }
  return p;
}

/** タップ地点の近くにある内蔵地点（規模ごとの半径に対して最も近いもの） */
export function findPlaceNear(index: PlaceSummary[], p: LngLat): PlaceSummary | null {
  let best: PlaceSummary | null = null;
  let bestRatio = 1;
  for (const s of index) {
    const ratio = distanceM(p, s) / SCALE_RADIUS_M[s.scale];
    if (ratio <= bestRatio) {
      best = s;
      bestRatio = ratio;
    }
  }
  return best;
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return (await res.json()) as T;
}
