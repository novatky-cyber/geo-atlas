// 内蔵解説データ（public/data/places/*.json）の検証と、一覧 index.json の生成。
//   node scripts/places.mjs          … 検証して index.json を書き出す
//   node scripts/places.mjs --check  … 検証し、index.json が最新かも確認する（ビルド・CIで使用）
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'public/data/places';
const INDEX = join(DIR, 'index.json');
const SCALES = ['country', 'region', 'city', 'spot'];
const LAYERS = ['terrain', 'life', 'history', 'culture'];
// 要件は1層200〜400字「程度」。目安から外れたら警告、大きく外れたらエラー
const SOFT = [200, 400];
const HARD = [150, 500];

const check = process.argv.includes('--check');
const errors = [];
const warnings = [];

const files = readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== 'index.json').sort();
const places = files.map((f) => {
  try {
    return { file: f, data: JSON.parse(readFileSync(join(DIR, f), 'utf8')) };
  } catch (e) {
    errors.push(`${f}: JSONとして読めません (${e.message})`);
    return null;
  }
}).filter(Boolean);

const ids = new Set(places.map((p) => p.data.id));

for (const { file, data: p } of places) {
  const at = (msg) => errors.push(`${file}: ${msg}`);
  const str = (k) => typeof p[k] === 'string' && p[k].trim() !== '';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id ?? '')) at('id は英小文字・数字・ハイフンのみ');
  if (`${p.id}.json` !== file) at(`ファイル名と id が一致しません（id: ${p.id}）`);
  for (const k of ['name', 'summary', 'note']) if (!str(k)) at(`${k} がありません`);
  if (!(Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180)) at('lat/lng が不正です');
  if (!SCALES.includes(p.scale)) at(`scale は ${SCALES.join('/')} のいずれか`);
  for (const l of LAYERS) {
    const text = p.layers?.[l];
    if (typeof text !== 'string' || !text.trim()) {
      at(`layers.${l} がありません`);
      continue;
    }
    const n = [...text].length;
    if (n < HARD[0] || n > HARD[1]) at(`layers.${l} が ${n}字（${HARD[0]}〜${HARD[1]}字にしてください）`);
    else if (n < SOFT[0] || n > SOFT[1]) warnings.push(`${file}: layers.${l} が ${n}字（目安 ${SOFT[0]}〜${SOFT[1]}字）`);
  }
  for (const k of ['why_chain', 'look_for', 'related', 'sources']) {
    if (!Array.isArray(p[k]) || p[k].length === 0) at(`${k} は1件以上の配列にしてください`);
  }
  for (const r of p.related ?? []) {
    if (!ids.has(r)) at(`related の "${r}" という地点がありません`);
    if (r === p.id) at('related に自分自身が入っています');
  }
  for (const s of p.sources ?? []) {
    if (!s?.title || !/^https:\/\//.test(s?.url ?? '')) at('sources の各要素には title と https の url が必要です');
  }
}

const index = places
  .map(({ data: p }) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, scale: p.scale }))
  .sort((a, b) => a.id.localeCompare(b.id));
const indexJson = JSON.stringify(index, null, 2) + '\n';

if (check) {
  let current = '';
  try {
    current = readFileSync(INDEX, 'utf8');
  } catch {}
  if (current !== indexJson) errors.push('index.json が地点データと一致しません。`npm run places` を実行してください');
}

for (const w of warnings) console.warn(`警告: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`エラー: ${e}`);
  process.exit(1);
}
if (!check) writeFileSync(INDEX, indexJson);
console.log(`地点データ ${places.length}件 OK${check ? '' : '（index.json を更新）'}`);
