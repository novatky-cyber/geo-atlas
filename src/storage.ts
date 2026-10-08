// localStorage はプライベートブラウズ等で例外を投げることがあるため、必ずここを経由する

const PREFIX = 'geo-atlas:';

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // 容量超過・利用不可の場合は保存を諦める（アプリの動作は継続）
  }
}
