# カード表示の整理・統合 / 割引率ソート / 一括続刊再確認 — 設計

- 日付: 2026-05-31
- 対象拡張: kindle-series-sale-tracker
- ブランチ: feature/storage-lite-and-scan-modes（または派生ブランチ）
- 実装担当: Codex（Claude Code がレビュー）。データモデル変更（detectNextVolume 拡張）は Claude Code + user 領域

## 目的

専用ページ（options）とポップアップ（popup）の両方で、シリーズカードの表示内容を整理・統合し、割引率順ソートと一括続刊再確認を追加する。セールトラッカーとして「いま買うべき続刊が割引されているシリーズ」を素早く見つけられる状態にする。

## ユーザー確定事項

| 項目 | 決定 |
|------|------|
| カード統合 | (a) 描画ロジックを shared 集約 / (b) セール情報を1ブロックに集約 / (c) popup と options で表示統一 / (d) 冗長表示を削る — **すべて実施** |
| 割引率ソート | options + popup **両方**に追加。未照会・割引なしは末尾 |
| 一括照会 | **2種**を用意。(1) **一括続刊再確認**=表示中の全件を再照会・上書き（重い）。(2) **新刊チェック（簡易）**=表示中の「続刊なし/未照会」のみ照会（軽い。`has-next` 済みはスキップ）。どちらも完結フラグは除外。options/popup 共通の挙動 |
| 割引の基準巻 | **続刊（nextVolume）を優先、続刊が無ければ最新刊（最高巻）にフォールバック**。両方の価格/割引を取得・保存する |

## アーキテクチャ方針

### モジュール境界（verify-green を守る）

- `kindle-library.js` / `catalog-probe.js` は **純粋ロジックのまま維持**する（`verify-*.mjs` が Node で依存するため、ロード時に `fetch`/`DOMParser`/`window` を実行しない）。
- 新規 `extension/shared/series-card.js`（UMD ラッパ。既存2モジュールと同形式）に、popup/options で重複しているブラウザ依存・描画ロジックを集約する：
  - `seriesSearchUrl(seriesKey, author)`（純粋）
  - `withClosingDashSeriesKey(seriesKey)`（純粋）
  - `formatRanges(ranges)`（純粋。現状 popup/options に重複）
  - `probeSeries(catalog, group)` / `probeSeriesWithUrl(catalog, group, url, seriesKey)`（fetch + DOMParser。ブラウザ専用）
  - `resolvePrimaryOffer(cached)` — カード表示・ソート用の「主オファー」解決（後述。純粋）
  - `discountValue(cached)` — ソート用の数値（割引なし/未照会は -1。純粋）
  - `renderStatusBlock(targetEl, cached, { completed })` — 続刊・価格・割引・最新刊を1ブロックに描画（DOM 生成）
- 純粋関数（`seriesSearchUrl` / `withClosingDashSeriesKey` / `formatRanges` / `resolvePrimaryOffer` / `discountValue`）は UMD の Node エクスポート経由で `verify-*.mjs` から単体検証可能にする。`probeSeries*` と `renderStatusBlock` はブラウザ専用で単体検証対象外。

### CSS は共通化しない

popup（幅420px・light固定・独自パレット `#f7f4ee`）と options（light/dark・別パレット）は視覚設計が別物。共通スタイルシート化は palette/width 回帰リスクが高いので採らない。**統一は shared 描画関数が出力する DOM 構造・クラス名で担保**し、各ページの CSS が自分のパレットでバッジを描く。

- options.css: 既存のバッジクラス（`.badge.sale` / `.badge.next` / `.badge.latest-date` / `.badge.price` / `.badge.missing` / `.badge.completed` / `.badge.priority`）を活用。
- popup.css: 不足しているバッジクラス（`.badge.sale` / `.badge.next` / `.badge.latest-date` / `.badge.missing` / `.badge.completed`）を popup パレットで追加。既存 `.sale-text` ベタ書きは廃止しバッジに統一。

## データモデル変更（detectNextVolume）

`catalog-probe.js` の `detectNextVolume` を拡張し、続刊（`best`）の価格・割引・発売日・サムネイルも捕捉する。現状 `best` は `{ volume, title, url }` のみ。

```js
// best 更新時に latest と同じ属性を保持する
if (best === null || parsed.volume < best.volume) {
  best = {
    volume: parsed.volume,
    title: r.title,
    url: r.url,
    releaseDate: r.releaseDate || '',
    thumbnailUrl: r.thumbnailUrl || '',
    priceText: r.priceText || '',
    listPriceText: r.listPriceText || '',
    discountRate: r.discountRate || null,
  };
}
```

`has-next` の返り値に next 系フィールドを追加する（latest 系は維持）：

```
nextVolume, nextTitle, nextUrl,
nextReleaseDate, nextThumbnailUrl, nextPriceText, nextListPriceText, nextDiscountRate,
latestVolume, latestTitle, latestUrl, latestReleaseDate, latestThumbnailUrl,
latestPriceText, latestListPriceText, latestDiscountRate
```

`no-next` / `unknown` は変更なし（latest 系のみ）。

### 主オファー解決 resolvePrimaryOffer(cached)

カード表示・割引ソートの基準。

```js
function resolvePrimaryOffer(cached) {
  if (!cached) return null;
  const hasNext = cached.status === 'has-next';
  // 続刊優先。続刊が無ければ最新刊にフォールバック。
  const useNext = hasNext;
  return {
    volume: useNext ? cached.nextVolume : cached.latestVolume,
    title: useNext ? cached.nextTitle : cached.latestTitle,
    url: useNext ? cached.nextUrl : cached.latestUrl,
    releaseDate: useNext ? cached.nextReleaseDate : cached.latestReleaseDate,
    priceText: useNext ? cached.nextPriceText : cached.latestPriceText,
    listPriceText: useNext ? cached.nextListPriceText : cached.latestListPriceText,
    discountRate: (useNext ? cached.nextDiscountRate : cached.latestDiscountRate) || null,
    isNext: useNext,
  };
}
function discountValue(cached) {
  const offer = resolvePrimaryOffer(cached);
  return offer && offer.discountRate ? offer.discountRate : -1; // 末尾送り
}
```

後方互換: 既存キャッシュ（next 系フィールド無し）は `has-next` でも next* が undefined。その場合 `resolvePrimaryOffer` は割引なし扱い（-1）になり、再照会すれば埋まる。一括再確認で上書きされる。

## カード表示の統合（before → after）

主役は「主オファー（=買う巻）の割引・価格」。冗長表示を削る。

### 削るもの
- popup の `次候補: N巻`（probe 前の推定。続刊照会結果と重複）→ 表示から削除（巻数推定はボタン活性判定に内部利用のみ）。
- popup の `所有: X / 次候補: Y巻` → `所有 X`（options と同じ所有レンジ表示に統一）。
- 価格・割引・続刊・最新刊が別々の行/区切りに散っていたのを `renderStatusBlock` の1ブロックに集約。

### renderStatusBlock が出力する1ブロック（completed でない場合）
順序（セール訴求を上に）:
1. **割引バッジ**（主オファーに割引がある場合のみ）: `NN%OFF`（`.badge.sale` 強調）
2. **価格**: `主オファー価格`（`.badge.price`。割引時は割引バッジと並ぶ）
3. **続刊状態**:
   - `has-next` → `続刊 N巻`（`.badge.next`）＋購入リンク（nextTitle or「購入ページ」）
   - `no-next` → `続刊なし`
   - `unknown` → `未照会`（probe 前）/ `判定不能`（probe 済みだが解析不能）を区別
4. **最新刊**（続刊と別巻のとき、補足として）: `最新 M巻 (YYYY-MM-DD)`（`.badge.latest-date`）。続刊＝最新刊なら省略。

completed の場合: `完結`（`.badge.completed`）バッジのみ（手動完結は最優先表示）。

### カード全体の項目（popup/options 共通の論理構造）
- タイトル（strong）
- サムネイル（主オファー or 最新刊 or 所有最新のサムネイル）
- メタ: 著者 / 所有レンジ（`.badge`）/ 欠番（`.badge.missing`, options のみ既存）/ 優先（`.badge.priority`）
- 状況ブロック（`renderStatusBlock`）
- アクション: [options] 優先トグル・再確認・完結トグル・Amazonリンク / [popup] 再確認・Amazonリンク

popup は幅制約があるため欠番バッジは出さない（options のみ。現状維持）。アクションの差（popup に優先/完結トグル無し）は現状維持（今回スコープ外）。

## 割引率ソート

### options
`<select id="sort">` に追加: `<option value="discount">割引率（高い順）</option>`。`sortSeries` に分岐追加:

```js
if (by === 'discount') {
  const d = discountValue(cache[b.key]) - discountValue(cache[a.key]);
  if (d !== 0) return d;
  return a.title.localeCompare(b.title, 'ja');
}
```

### popup
popup には現状ソート UI が無い（優先度順固定）。toolbar に小さな `<select id="popupSort">` を追加:
- `priority`（既定・現行挙動: 優先度順）
- `discount`（割引率 高い順。同率は優先度→タイトル）

`getLastScan` での固定 priority ソートをやめ、`render` 内で選択値に応じてソートする。割引なし/未照会は末尾。

## 一括照会（2種: 一括続刊再確認 / 新刊チェック簡易）

対象シリーズ抽出を共通化し、ボタンごとにフィルタを変える。完結は常に除外。

```js
// full（一括続刊再確認）: 表示中の全件を再照会・上書き
const fullTargets = currentList().filter((s) => !completed[s.key]);
// simple（新刊チェック簡易）: 「続刊なし/未照会」のみ。has-next 済みはスキップ
const simpleTargets = currentList().filter(
  (s) => !completed[s.key] && cache[s.key]?.status !== 'has-next'
);
```

照会ループ本体（throttle・abort・定期保存・進捗表示・完了後 render）は両者で共有し、対象配列とボタン文言だけ差し替える。

### options
- toolbar に2ボタン: `↻ 一括続刊再確認`（全件再照会・上書き）と `＋ 新刊チェック（簡易）`（続刊なし/未照会のみ）。
- 既存 `checkVisible` を `runBulkProbe(targets, { label })` に一般化し、両ボタンから呼ぶ。
- 既存の abort・throttle（`REQUEST_DELAY_MS=350`）・定期保存（20件毎）は維持。実行中はもう一方のボタンも無効化する。
- 開始時に対象件数を明示（API quota ルール）: `照会中… {done}/{total}`。完了時サマリは `{series.length}シリーズ（{done}件{再確認|新刊チェック}）`（中止時は「中止」追記、簡易は対象0件なら「新刊チェック対象なし」）。
- 完了後 `render()` で再描画（最新刊日付・割引・ソート反映）。

### popup
- toolbar-bulk を `grid-template-columns: 1fr 1fr` にして2ボタン: `一括再確認` と `新刊チェック`。
- shared の `probeSeries` を使う共通ループ `runBulkProbe(targets, { label })` に差し替え（DRY）。進捗表示を options と整合（`{label}中… {done}/{total}`）。
- popup は表示上限80件で件数が限定的なため abort ボタンは追加しない（現状維持）。完結は `getLastScan` で除外済みのため `simpleTargets` は `cache[s.key]?.status !== 'has-next'` 条件のみで足りる。

## 検証計画

### 自動（Node）
- `verify-catalog-probe.mjs`: `detectNextVolume` の `has-next` で **next 系フィールド（nextPriceText / nextDiscountRate / nextReleaseDate）が捕捉される**ことを検証するケースを追加。続刊に割引がある fixture/合成結果でアサート。
- `series-card.js` の純粋関数を検証する `verify-series-card.mjs`（新規、軽量）を追加: `resolvePrimaryOffer`（has-next→next優先 / no-next→latest / 旧キャッシュ→割引なし）と `discountValue`（割引なし=-1）と `formatRanges`。
- 既存 `verify-kindle-library.mjs` の回帰が壊れないこと。
- `parseSearchResultsFromDoc` の next 価格抽出は実 HTML fixture が望ましい（無ければ合成 results で detectNextVolume を検証し、DOM 抽出は既存の offer fixture でカバー）。

### dev ビルド同期（完了条件）
```powershell
.\scripts\build-dev.ps1 -Target all
```
`dist/dev/chrome` `dist/dev/firefox` を最新化（dist は Git 管理外）。

### 実動確認（要 Amazon ログイン、user 素材 or 手動）
- 全件取得 → 一括続刊再確認 → 割引率順ソートで、割引の大きい続刊が上位に来る。
- 新刊チェック（簡易）は「続刊なし/未照会」のみ照会し、`has-next` 済みはスキップする（対象件数が full より少ない）。
- popup の割引率ソート切替が効く。両ページに一括ボタン2種が並ぶ。
- カードに割引/価格/続刊/最新刊が1ブロックで整理表示される。
- 完結フラグのシリーズは一括照会（両種）の対象外。

## 影響ファイル

| ファイル | 変更 |
|----------|------|
| `extension/shared/catalog-probe.js` | `detectNextVolume` に next 系オファー捕捉を追加（データモデル変更） |
| `extension/shared/series-card.js` | **新規**。probe/描画/ソート補助の共通ロジック |
| `extension/popup/popup.html` | shared/series-card.js 読込、割引ソート select 追加、一括ボタン2種 |
| `extension/popup/popup.js` | 重複ロジック撤去・shared 利用、ソート、`runBulkProbe` 共通化（full/simple）、カード描画統合 |
| `extension/popup/popup.css` | バッジクラス追加、`.sale-text` 廃止、toolbar-bulk を2列に |
| `extension/options/options.html` | shared/series-card.js 読込、割引ソート option 追加、一括ボタン2種 |
| `extension/options/options.js` | 重複ロジック撤去・shared 利用、割引ソート、`runBulkProbe` 共通化（full/simple）、カード描画統合 |
| `extension/options/options.css` | 必要なら状況ブロック微調整（最小限） |
| `verify-catalog-probe.mjs` | next 系オファー捕捉の検証ケース追加 |
| `verify-series-card.mjs` | **新規**。純粋関数の検証 |

manifest（permissions / host_permissions / content_scripts）の変更は無い。shared/series-card.js は popup/options の HTML から読み込むだけで、content script の manifest には追加不要。

## スコープ外 / 非ゴール（YAGNI）

- popup へ優先/完結トグルを追加すること（アクション差は現状維持）。
- content script・background の message contract 変更。
- 価格・割引の履歴保存やセール通知。
- options/popup の CSS 完全統一（パレット統合）。

## リスク

- **DOM 依存**: 続刊の価格/割引抽出は Amazon 検索結果 DOM に依存。`extractSearchResultOffer` は既存実装を流用するため新規リスクは小さいが、続刊行の DOM が最新刊行と構造差がある可能性は fixture で確認。
- **一括再確認の負荷**: 表示中全件を再照会するため、ライブラリが大きいと Amazon へのリクエストが多数になる。throttle（350ms）＋ abort ＋ 開始時件数表示で緩和（api-quota ルール準拠）。
- **後方互換**: 旧キャッシュに next 系が無い→割引ソートで末尾。一括再確認で解消。
