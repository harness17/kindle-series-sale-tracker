# 実装計画: カード表示の整理・統合 / 割引率ソート / 一括照会2種

- 日付: 2026-05-31
- 設計: [docs/superpowers/specs/2026-05-31-card-consolidation-discount-sort-bulk-recheck-design.md](../superpowers/specs/2026-05-31-card-consolidation-discount-sort-bulk-recheck-design.md)（確定版・承認済み）
- 起点コミット: cbe90f7
- ブランチ: feature/storage-lite-and-scan-modes

設計ドキュメントが正。本計画はチェックボックス順の実装手順。各項目は設計の該当節を参照すること。

## スプリントコントラクト（完成条件）

**正常系**
- 専用ページ・ポップアップのカードが、割引→価格→続刊状態→最新刊 の順で1ブロックに整理表示される。
- 割引の基準巻は「続刊優先・無ければ最新刊フォールバック」。`detectNextVolume` の `has-next` が続刊（next）の価格/割引/発売日/サムネイルを保存する。
- options・popup 両方で割引率（高い順）ソートが選べ、割引の大きいシリーズが上位に来る。未照会・割引なしは末尾。
- 一括照会が2種動く: (1) 一括続刊再確認=表示中の全件を再照会・上書き、(2) 新刊チェック簡易=表示中の「続刊なし/未照会」のみ照会（has-next 済みスキップ）。どちらも完結除外。

**前提・利用条件**
- Amazon ログイン状態で Kindle 一覧をスキャン済みであること。照会は検索結果 HTML を `credentials: 'include'` で取得。
- 個人の蔵書データ・cookie・実購入URL はコミットしない。

**異常系**
- 旧キャッシュ（next 系フィールド無し）でも例外を出さず、割引ソートでは末尾、再照会で解消。
- 一括照会の対象0件時はその旨を表示（簡易は「新刊チェック対象なし」）。fetch 失敗は `status:'unknown'` で握りつぶし継続。
- 簡易照会中はもう一方のボタンも無効化し二重実行を防ぐ。

**副作用・回帰**
- `verify-kindle-library.mjs` / `verify-catalog-probe.mjs` が引き続き pass。
- `catalog-probe.js` / `kindle-library.js` は純粋ロジックのまま（Node でロード時に fetch/DOMParser/window を実行しない）。
- manifest（permissions/host_permissions/content_scripts）は変更しない。
- popup/options の既存機能（スキャン・エクスポート・優先/完結トグル・欠番表示・フィルタ）を壊さない。

## 実装手順（チェックボックス順）

### 1. データモデル: detectNextVolume 拡張（設計「データモデル変更」節）
- [x] `extension/shared/catalog-probe.js` の `detectNextVolume` で、`best`（続刊）更新時に `latest` と同じく `releaseDate / thumbnailUrl / priceText / listPriceText / discountRate` を保持する。
- [x] `has-next` 返り値に `nextReleaseDate / nextThumbnailUrl / nextPriceText / nextListPriceText / nextDiscountRate` を追加（既存 `next*` と `latest*` は維持）。`no-next` / `unknown` は変更しない。
- [x] 純粋性を維持（fetch/DOMParser を持ち込まない）。

### 2. 新規 shared/series-card.js（設計「モジュール境界」節）
- [x] `extension/shared/series-card.js` を UMD ラッパ（catalog-probe.js と同形式）で新規作成。Node では `module.exports`、ブラウザでは `root.__KST_CARD__` に公開。
- [x] 純粋関数を実装・エクスポート: `seriesSearchUrl(seriesKey, author)` / `withClosingDashSeriesKey(seriesKey)` / `formatRanges(ranges)` / `resolvePrimaryOffer(cached)` / `discountValue(cached)`（設計のロジックに従う）。
- [x] ブラウザ専用関数: `probeSeriesWithUrl(catalog, group, searchUrl, seriesKey)` / `probeSeries(catalog, group)`（popup/options の現行ロジックを移植。`fetch` + `DOMParser` 使用。ロード時には実行しない）。
- [x] `renderStatusBlock(targetEl, cached, { completed })`: 設計の順序（割引バッジ→価格→続刊状態→最新刊）で DOM を生成。completed 時は `完結` バッジのみ。バッジは class 名のみ付与し配色は各ページ CSS に委ねる。

### 3. options 改修（設計「カード表示」「割引率ソート」「一括照会」節）
- [x] `options.html`: `series-card.js` を `catalog-probe.js` の後に読込。`<select id="sort">` に `<option value="discount">割引率（高い順）</option>` 追加。一括ボタンを2種に（`↻ 一括続刊再確認` と `＋ 新刊チェック（簡易）`）。
- [x] `options.js`: 重複していた `probeSeries*` / `seriesSearchUrl` / `withClosingDashSeriesKey` / `formatRanges` / `renderNextResult` を撤去し `window.__KST_CARD__` を使う。`catalog` を渡す形に修正。
- [x] `sortSeries` に `discount` 分岐追加（`discountValue` 使用、同率はタイトル昇順）。
- [x] カード描画（`rowEl`）の状況表示を `renderStatusBlock` に統合。`次候補`等の冗長表示を撤去。サムネイルは主オファー→最新刊→所有最新の順で解決。
- [x] `checkVisible` を `runBulkProbe(targets, { label })` に一般化。`fullTargets`（全件・完結除外）と `simpleTargets`（`status!=='has-next'` かつ完結除外）を2ボタンから呼ぶ。abort・throttle(350ms)・定期保存(20件)・進捗表示・実行中の相互ボタン無効化を実装。対象0件時メッセージ。
- [x] `options.css`: 必要なら状況ブロックの微調整（最小限。既存バッジクラスを活用）。

### 4. popup 改修（設計「カード表示」「割引率ソート」「一括照会」節）
- [x] `popup.html`: `series-card.js` を読込。toolbar に割引ソート `<select id="popupSort">`（`優先度順`/`割引率順`）追加。`toolbar-bulk` を2ボタン（`一括再確認`・`新刊チェック`）に。
- [x] `popup.js`: 重複ロジックを撤去し `window.__KST_CARD__` を使う。`getLastScan` の固定 priority ソートを廃し、`render` 内で `popupSort` 値に応じてソート（priority / discount）。割引なし・未照会は末尾。
- [x] カード描画を `renderStatusBlock` に統合。`所有: X / 次候補: Y巻` → 所有レンジのみへ簡素化。
- [x] 一括処理を `runBulkProbe(targets, { label })` 共通ループに差し替え、full/simple 2ボタンから呼ぶ。進捗文言を options と整合。
- [x] `popup.css`: 不足バッジクラス（`.badge.sale`/`.badge.next`/`.badge.latest-date`/`.badge.missing`/`.badge.completed`）を popup パレットで追加。`.sale-text` 廃止。`toolbar-bulk` を `grid-template-columns: 1fr 1fr`。

### 5. 検証スクリプト（設計「検証計画」節）
- [x] `verify-catalog-probe.mjs` に、`detectNextVolume` の `has-next` で `nextPriceText`/`nextDiscountRate`/`nextReleaseDate` が捕捉されることを検証するケースを追加（続刊行に価格/割引がある合成 results）。
- [x] `verify-series-card.mjs` を新規作成: `resolvePrimaryOffer`（has-next→next優先 / no-next→latest / 旧キャッシュ→割引なし）、`discountValue`（割引なし=-1）、`formatRanges` を検証。

### 6. 検証実行 & dist 同期（完了条件）
- [x] `node .\verify-kindle-library.mjs` が pass。
- [x] `node .\verify-catalog-probe.mjs` が pass（新ケース含む）。
- [x] `node .\verify-series-card.mjs` が pass。
- [x] `.\scripts\build-dev.ps1 -Target all` を実行し `dist/dev/chrome` `dist/dev/firefox` を最新化。

### 7. コミット
- [ ] `git add` は変更ファイルを個別指定（`git add -A` 禁止）。個人蔵書データ・cookie を含めない。
- [ ] `git commit`（日本語メッセージ。例: `feat: カード表示統合・割引率ソート・一括照会2種`）。
