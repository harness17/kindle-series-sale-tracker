# Architecture And Data

## モジュール境界

- `extension/shared/kindle-library.js`
  - `GetContentOwnershipData` 応答の抽出と正規化
  - タイトルからのシリーズ名・巻数推定
  - 所有レンジ、欠番、シリーズ要約、CSV生成
  - エクスポート範囲選択（`selectRecentBooks` — 取得日降順で直近N件を返す）
  - browser と Node verify の両方で読める形式を保つ
- `extension/shared/catalog-probe.js`
  - Amazon 検索結果 DOM の抽出
  - シリーズ一致、版元違い、分冊版、次巻候補の判定
  - 価格計算契約を変更したら `CATALOG_PRICE_VERSION` と cache migration を確認する
- `extension/shared/series-card.js`
  - 検索取得、追加ページ・補完検索、catalog reconcile
  - popup、background、offscreen が共有する照会フローと表示状態
- `extension/shared/i18n.js`
  - 言語検出（`navigator.language` → ja/en 正規化）、翻訳キー解決
  - `applyI18n()` による DOM 属性適用（`data-i18n`, `data-i18n-title`, `data-i18n-aria-label`）
  - popup / options が共有する。browser と Node verify の両方で読める形式を保つ
- `extension/content/content.js`
  - Kindle デジタルコンソール上の同一オリジン Ajax
  - full/simple scan、storage 保存、quota 縮退、実行状態
  - エクスポート取得（`collectLatestBooks` — 件数制限つき取得日降順取得）
  - popup からの `kst:exportFetch` メッセージで `{ type, limit }` を受け取る。`limit` は `100` / `500` / `null`（全件）
- `extension/background/background.js` / `extension/offscreen/`
  - alarm、全件バックグラウンド巡回、重複実行防止、badge、Chrome DOMParser bridge
- `extension/popup/` / `extension/options/`
  - 保存済み結果・状態の表示、ユーザー設定、手動操作

## スキャン契約

- full scan は取得日・タイトル・著者の昇順/降順を順に取得し、ASIN で統合する。Amazon の1ソート軸あたりの取得上限を、複数軸で補う設計を維持する。
- simple scan は既存 `items` を基準に取得日降順で新着を探す。基準データが無い場合は full へ暗黙フォールバックせず、手動 full scan を案内する。
- 自動スキャンはページ訪問時だけ発火し、基準データがある場合の simple scan に限定する。期限判定と実行状態は storage の永続値から導出する。
- 保存する `items` は `asin` / `seriesKey` / `volume` / `imprint` / `author` の最小書誌を基本とする。表紙はシリーズ要約の最新所有巻1枚に集約する。
- storage quota 到達時は series 一覧を残す縮退保存を許容する。明細が無い状態で CSV/JSON を偽生成せず、必要なら Amazon から再取得する。
- 通常スキャンでは発売日を保存しない。検索結果から取れた続刊候補情報だけを catalog cache に保存する。

## バックグラウンド照会契約

- eligible series は completed / excluded を除き、有限の `highestVolume` を持つものとする。
- 1回の実行では対象全体を巡回し、内部的に `CHUNK_SIZE` ごとに処理する。chunk サイズを「alarm 1回の総上限」と誤解しない。
- Chrome は service worker に DOMParser が無いため offscreen document を使う。Firefox は background scripts に shared modules を読み込み inline 処理する。
- `status: unknown` で既存 cache がある場合は確定済みデータを上書きしない。3シリーズ連続で `unknown` になった場合はサイクルを失敗扱いにし、最終成功時刻を更新せず後続実行で再試行する。
- cache / queue / badge の更新は、途中停止後に再開可能な順序と粒度を保つ。
- `activeBgProbe` 相当の重複実行防止を維持し、alarm、startup catch-up、手動要求が競合しても並列巡回させない。
- Amazon への連続リクエストには既存 delay を維持する。ユーザー設定で無制限の頻度・件数を追加しない。

## 永続データ変更

storage key、保存オブジェクト、cache version を変更するときは、次を先に決める。

- 旧データの読み取り互換または migration
- timestamp の単位は Unix epoch milliseconds
- 欠損値、空配列、quota 縮退状態の扱い
- popup / options / content / background / offscreen の全利用箇所
- 削除・リセット時に消すキーと残す設定

個人の蔵書履歴は監査対象データではなくローカル機能データだが、外部送信・リポジトリ保存はしない。
