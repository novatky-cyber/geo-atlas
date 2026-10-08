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

## デザイン方針

- **当面は機能優先。見た目は最小限でよい**（操作性・可読性・タップ領域・高コントラストは守る）
- 見た目の作り込みはしない。デザインは全機能がそろってから「デザイン刷新」でまとめて行う
- 色・余白などは `src/style.css` の CSS 変数（`:root`）に寄せておき、刷新時に差し替えやすくする

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
アプリは保存済み JSON を読むだけ。

- 地点：`public/data/places/{id}.json`
- 一覧：`public/data/places/index.json`（id・名前・緯度経度・規模のみ。マーカー表示用）
  - **手で編集しない。** `npm run places` が各地点ファイルから自動生成する
- 旅行パック：`public/data/trips/{trip-id}.json`（旅行ごとの地点IDリスト）
- `scale`：`country` / `region` / `city` / `spot`
  - タップ地点がこの半径内なら内蔵解説を出す：country 300km / region 25km / city 6km / spot 2km（`src/places.ts`）
- `landform`（任意）：地形の種類（例：盆地、扇状地、フィヨルド）。解説シートにタグとして表示
- `note`：冒頭に作成方法と出典の検証状況を書き、続けて「要確認：」で自信のない記述を列挙する
- 各層は200〜400字（`npm run places` が150字未満・500字超をエラー、200〜400字の範囲外を警告にする）
- 事実と解釈を区別し、通説でない因果は「〜と考えられる」と書く
- `sources` に出典URL、`note` に要確認箇所を書く
- 形式の例は `docs/REQUIREMENTS.md`「4. 解説データの作り方」を参照

### 地点追加の手順（利用者から「〇〇の解説データを追加して」と依頼されたとき）

1. id を決める（英小文字・ハイフン区切り。例：`lake-biwa`）。既存 id と重複しないか確認
2. Wikipedia（日本語版優先）と一般的知識をもとに `public/data/places/{id}.json` を作成
   - 4層・`why_chain`・`look_for`（旅先で実際に見て確認できる地形ポイント）・`related`・`sources`・`note`
   - `related` には既存の地点 id を入れる（存在しない id はエラー）。既存地点の `related` にも必要なら追記
3. `npm run places` を実行（検証と index.json の再生成）。警告・エラーがあれば直す
4. 関連する旅行パックがあれば `public/data/trips/*.json` にも追記（フェーズ4以降）
5. `npm run build` が通ることを確認し、コミットして `main` へ反映（自動デプロイされる）
   - `npm run build` は index.json が最新でないと失敗する（CIでも同じ）

## 開発フェーズ

1. **土台**（完了）：Vite + TS + MapLibre の地球儀、地形陰影、日本語地名、現在地ボタン、GitHub Pages 自動デプロイ
2. **タップ解説**（完了）：ボトムシート（半分→全画面→閉じる）、Wikipedia ジオサーチ・要約、標高表示、初回の操作ヒント
3. **内蔵解説データ**（完了）：データ形式の実装、初期30地点（日本15・世界15）、地点追加手順の整備
4. **PWA・オフライン**：Service Worker、旅行パックの事前ダウンロード
5. **学習記録**：訪問済み地点の記録・表示

各フェーズの終わりに、iPhone で確認する手順（公開URLで何を見ればよいか）を報告する。
将来構想（問いモード・比較モード・時代スライダー等）は指示があるまで実装しない。

## 今後のタスク（フェーズ5の後）

- **デザイン刷新**：全機能がそろった後、見た目（配色・タイポグラフィ・アイコン・シートやボタンの意匠）をまとめて刷新する
- **ダークモードの地図**：現在ダークモードで暗くなるのはUIのみ。地図スタイルの切り替えを検討する（キー不要のスタイルに限る）

## 実装メモ

- 標高（`src/elevation.ts`）：Terrarium タイルを直接デコードする。高ズーム（z12）の海上は 0m になる
  （海底地形は低ズームにしか入っていない）ため、0m や取得失敗のときは z9 で読み直す
- 傾きは2本指の上下、回転は2本指のひねりで操作できる（MapLibre 標準）。初回のみ画面上部にヒントを表示
- Wikipedia 要約は localStorage に最大300件保存し、通信できないときは保存済みの近くの記事を表示する
- 内蔵地点：マーカーのタップ（重なっていればタップ位置に最も近いもの）か、規模ごとの半径内のタップで4層解説を開く。
  解説から「周辺のWikipedia記事を見る」で Wikipedia 側に切り替えられる。最後に選んだタブ（地形/営み/歴史/文化）は地点を移っても引き継ぐ
- 初期30地点の解説は、作成時の開発環境から Wikipedia に接続できない状態で書いた。出典URLのリンク先と `note` の要確認箇所は、実機や別環境で順次確認する
