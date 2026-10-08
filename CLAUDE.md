# CLAUDE.md — geo-atlas 開発ルール

旅先でiPhoneから使う地理学習PWA。「地形から"なぜ"を読み解く地球儀」。
詳細な要件は `docs/REQUIREMENTS.md` を正とする。迷ったらそちらを読むこと。

## 要点

- 地球儀（MapLibre GL JS の globe）をタップすると、その土地を4層で解説する
  - ① 地形・自然 ② 人の営み ③ 歴史 ④ 文化（地形→歴史→文化の因果で結ぶ）
- 利用者は1人。ログイン不要。主端末は iPhone Safari（ホーム画面に追加して使う）
- 旅先利用：片手操作（主要ボタンは画面下部、タップ領域44px以上）、屋外で見やすい高コントラスト、
  ダークモード対応、通信不安定への対策、常時GPS追跡や不要なアニメーションはしない

## 費用ルール（最重要・厳守）

**運用費0円。従量課金が発生し得る構成は一切使わない。**

- 禁止：生成AI API の実行時呼び出し（Claude / OpenAI 等）、APIキーやクレジットカード登録が必要なサービス
  （無料枠ありでも不可）、自前サーバー・DB（Supabase / Firebase 等も不可）
- 使用可（すべてキー不要・登録不要）
  - 地図：OpenFreeMap（`https://tiles.openfreemap.org/styles/liberty`）
  - 標高：AWS Terrain Tiles（Terrarium）`https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png`
    - 注意：パス形式 `s3.amazonaws.com/elevation-tiles-prod/...` は CORS ヘッダーが返らず、ブラウザから読めない
  - 補助情報：Wikipedia REST API / MediaWiki Action API（日本語版優先、英語版フォールバック）
  - ホスティング：GitHub Pages（GitHub Actions でデプロイ）
- **新しい外部サービスを追加したくなったら、実装前に「キー不要か」「課金登録不要か」を確認して利用者に報告する**
- 各データのクレジット表記（© OpenStreetMap contributors 等）を必ず画面に表示する
  - ソースの `attribution` に書けば MapLibre の AttributionControl に自動で出る

## 技術構成

- Vite + TypeScript（フレームワークなし。必要なら Preact まで）
- maplibre-gl（v6）、vite-plugin-pwa（フェーズ4で導入）
- `src/` 地図・UI・データ読込 / `public/data/` 解説JSON / `docs/` 要件定義
- 外部URL・初期表示などの定数は `src/config.ts` に集約する
- MapLibre v6 の Worker は `setWorkerUrl()` でバンドル後のURLを明示している（`src/main.ts`）。消さないこと
- 公開パスは `/geo-atlas/`（`vite.config.ts` の `base`）

## コマンド

```bash
npm install
npm run dev        # 開発サーバー（http://localhost:5173/）
npm run build      # 型チェック + 本番ビルド（dist/）
npm run preview    # ビルド結果を確認（http://localhost:4173/geo-atlas/）
```

変更後は最低限 `npm run build` が通ることを確認してからコミットする。

## デプロイ

- `main` ブランチへの push で `.github/workflows/deploy.yml` が GitHub Pages にデプロイする
- 公開URL：`https://<GitHubユーザー名>.github.io/geo-atlas/`
- PR では `.github/workflows/ci.yml` がビルドのみ確認する

## 解説データ（API課金ゼロの仕組み）

解説文はアプリ実行時にAIで生成しない。**開発時に Claude Code が作成し、JSON としてリポジトリに保存する。**
アプリは保存済み JSON を読むだけ。（データ形式の実装はフェーズ3）

- 地点：`public/data/places/{id}.json`
- 一覧：`public/data/places/index.json`（id・名前・緯度経度・規模のみ。マーカー表示用）
- 旅行パック：`public/data/trips/{trip-id}.json`（旅行ごとの地点IDリスト）
- `scale`：`country` / `region` / `city` / `spot`
- 各層は200〜400字。事実と解釈を区別し、通説でない因果は「〜と考えられる」と書く
- `sources` に出典URL、`note` に要確認箇所を書く
- 形式の例は `docs/REQUIREMENTS.md`「4. 解説データの作り方」を参照

### 地点追加の手順（利用者から「〇〇の解説データを追加して」と依頼されたとき）

1. id を決める（英小文字・ハイフン区切り。例：`lake-biwa`）。既存 id と重複しないか確認
2. Wikipedia（日本語版優先）と一般的知識をもとに `public/data/places/{id}.json` を作成
   - 4層・`why_chain`・`look_for`（旅先で実際に見て確認できる地形ポイント）・`related`・`sources`・`note`
3. `public/data/places/index.json` に id・名前・緯度経度・scale を追記
4. 関連する旅行パックがあれば `public/data/trips/*.json` にも追記
5. `npm run build` が通ることを確認し、コミットして `main` へ反映（自動デプロイされる）

## 開発フェーズ

1. **土台**（完了）：Vite + TS + MapLibre の地球儀、地形陰影、日本語地名、現在地ボタン、GitHub Pages 自動デプロイ
2. **タップ解説**：ボトムシート（半分→全画面→閉じる）、Wikipedia ジオサーチ・要約、標高表示
3. **内蔵解説データ**：データ形式の実装、初期30地点（日本15・世界15）、地点追加手順の整備
4. **PWA・オフライン**：Service Worker、旅行パックの事前ダウンロード
5. **学習記録**：訪問済み地点の記録・表示

各フェーズの終わりに、iPhone で確認する手順（公開URLで何を見ればよいか）を報告する。
将来構想（問いモード・比較モード・時代スライダー等）は指示があるまで実装しない。
