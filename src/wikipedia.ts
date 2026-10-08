import { GEOSEARCH_LIMIT, GEOSEARCH_RADIUS_M, WIKI_CACHE_LIMIT, WIKI_LANGS, type WikiLang } from './config';
import { distanceM, type LngLat } from './geo';
import { loadJSON, saveJSON } from './storage';

// Wikipedia はキー不要・登録不要（docs/REQUIREMENTS.md「3. 費用ルール」）
// ジオサーチ：MediaWiki Action API / 要約：Wikipedia REST API

export type GeoArticle = {
  lang: WikiLang;
  title: string;
  lat: number;
  lng: number;
  distM: number;
};

export type WikiSummary = {
  lang: WikiLang;
  title: string;
  description?: string;
  extract: string;
  thumbnail?: string;
  url: string;
  lat?: number;
  lng?: number;
  savedAt: number;
};

type GeoSearchResponse = {
  query?: { geosearch?: { title: string; lat: number; lon: number; dist: number }[] };
};

async function geosearch(lang: WikiLang, p: LngLat, signal?: AbortSignal): Promise<GeoArticle[]> {
  const params = new URLSearchParams({
    action: 'query',
    list: 'geosearch',
    gscoord: `${p.lat}|${p.lng}`,
    gsradius: String(GEOSEARCH_RADIUS_M),
    gslimit: String(GEOSEARCH_LIMIT),
    format: 'json',
    formatversion: '2',
    origin: '*',
  });
  const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?${params}`, { signal });
  if (!res.ok) throw new Error(`geosearch ${res.status}`);
  const json = (await res.json()) as GeoSearchResponse;
  return (json.query?.geosearch ?? []).map((g) => ({ lang, title: g.title, lat: g.lat, lng: g.lon, distM: g.dist }));
}

/** 周辺記事を最大5件。日本語版で見つからなければ英語版を探す */
export async function searchNearby(p: LngLat, signal?: AbortSignal): Promise<GeoArticle[]> {
  for (const lang of WIKI_LANGS) {
    const items = await geosearch(lang, p, signal);
    if (items.length > 0) return items;
  }
  return [];
}

// --- 要約と端末保存 ---

const CACHE_KEY = 'wiki-summaries:v1';
type Cache = Record<string, WikiSummary>;
const cacheKey = (lang: WikiLang, title: string) => `${lang}:${title}`;

export function getCachedSummary(lang: WikiLang, title: string): WikiSummary | undefined {
  return loadJSON<Cache>(CACHE_KEY, {})[cacheKey(lang, title)];
}

function putCachedSummary(s: WikiSummary): void {
  const cache = loadJSON<Cache>(CACHE_KEY, {});
  cache[cacheKey(s.lang, s.title)] = s;
  const entries = Object.entries(cache);
  if (entries.length > WIKI_CACHE_LIMIT) {
    entries.sort((a, b) => a[1].savedAt - b[1].savedAt);
    for (const [k] of entries.slice(0, entries.length - WIKI_CACHE_LIMIT)) delete cache[k];
  }
  saveJSON(CACHE_KEY, cache);
}

/** 保存済みの要約のうち、地点の近くにあるもの（オフライン時の代替表示用） */
export function savedNearby(p: LngLat, radiusM = GEOSEARCH_RADIUS_M): (WikiSummary & { distM: number })[] {
  return Object.values(loadJSON<Cache>(CACHE_KEY, {}))
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => ({ ...s, distM: distanceM(p, { lat: s.lat!, lng: s.lng! }) }))
    .filter((s) => s.distM <= radiusM)
    .sort((a, b) => a.distM - b.distM)
    .slice(0, GEOSEARCH_LIMIT);
}

type SummaryResponse = {
  title: string;
  description?: string;
  extract?: string;
  thumbnail?: { source: string };
  coordinates?: { lat: number; lon: number };
  content_urls?: { mobile?: { page: string }; desktop?: { page: string } };
};

/**
 * 要約を取得する。一度表示したものは端末に保存し、通信できないときは保存分を返す。
 * fallbackCoords：要約APIに座標がない記事のため、ジオサーチで得た座標を保存に使う
 */
export async function getSummary(
  lang: WikiLang,
  title: string,
  signal?: AbortSignal,
  fallbackCoords?: LngLat,
): Promise<WikiSummary> {
  const cached = getCachedSummary(lang, title);
  try {
    const path = encodeURIComponent(title.replace(/ /g, '_'));
    const res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${path}`, { signal });
    if (!res.ok) throw new Error(`summary ${res.status}`);
    const j = (await res.json()) as SummaryResponse;
    const summary: WikiSummary = {
      lang,
      title: j.title ?? title,
      description: j.description,
      extract: j.extract ?? '',
      thumbnail: j.thumbnail?.source,
      url:
        j.content_urls?.mobile?.page ??
        j.content_urls?.desktop?.page ??
        `https://${lang}.wikipedia.org/wiki/${path}`,
      lat: j.coordinates?.lat ?? fallbackCoords?.lat ?? cached?.lat,
      lng: j.coordinates?.lon ?? fallbackCoords?.lng ?? cached?.lng,
      savedAt: Date.now(),
    };
    putCachedSummary(summary);
    return summary;
  } catch (e) {
    if (cached && !(e instanceof DOMException && e.name === 'AbortError')) return cached;
    throw e;
  }
}
