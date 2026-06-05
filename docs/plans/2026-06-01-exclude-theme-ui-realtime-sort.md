# 実装計画: 除外フラグ・テーマ切替・専用ページUI刷新・リアルタイムソート

- 日付: 2026-06-01
- spec: `docs/superpowers/specs/2026-06-01-exclude-theme-ui-realtime-sort-design.md`
- ブランチ: feature/storage-lite-and-scan-modes

## 重要な前提（spec逸脱・先に読むこと）

**[必須] FOUC対策はインラインscript不可 → 外部 `theme-init.js` を使う。**
MV3拡張ページはデフォルトCSP `script-src 'self'` が適用され、インライン `<script>` は実行不可（`manifests/*` は触らない制約のためCSP緩和もしない）。
- 新規 `extension/shared/theme-init.js` を `options.html`/`popup.html` の `<head>` 内で **stylesheetより前に同期 `<script src>`** として読み込む。外部スクリプトはbody描画前に同期実行されFOUCを防ぐ。
- `localStorage` を同期 read してDOMに `data-theme`/`color-scheme` を適用（`chrome.storage.local` は非同期で描画前に間に合わない）。`localStorage` を同期SoT、`chrome.storage.local.kstTheme` を正本とし、各ページ初期化時の非同期ロードで自己修復（再同期）。
- options/popup は同一拡張オリジンで `localStorage` 共有 → popup追従も同キーで動く。
- `shared/` への新規ファイル追加は許可範囲（「触らない」は `kindle-library.js`/`catalog-probe.js` のロジック指定であってディレクトリではない）。`build-dev.ps1` は `extension/*` 再帰コピーのためビルド変更不要。

**チップ化はcheckboxを維持し見た目だけチップにする（buttonに置換しない）。**
`filterMissing/filterPriority/filterHideCompleted`（＋新規 `filterExcluded`）は `<input type="checkbox">` を `.chip` ラベルで包み、`:has(input:checked)` でスタイル。`els.*.checked` 読み取りと `change` リスナがそのまま生き、ロックステップ制約を満たす。`sort`/`filterStatus` は `<select>`（`.value`）のまま。`checkVisible`/`checkSimple` は `<button>` のまま（restyleのみ）で abort ハンドラ差し替えを温存。

**全コントロールは静的HTMLに置く。** 除外チップ含め `render()` では生成しない（「render()はcontrolsを再生成しない」不変条件）。

## スプリント分割・実装順序

各スプリント末で `node verify-kindle-library.mjs` と `node verify-catalog-probe.mjs` を実行。`series-card.js` を触った場合のみ `node verify-series-card.mjs` も必須。git add は個別ファイル指定（`-A` 禁止）。

---

## スプリント1: 除外フラグ（データ＋ロジック）

### extension/options/options.js
- [ ] 定数 `const EXCLUDED_KEY = 'kstExcludedSeries';`（`{ [seriesKey]: true }`）を追加。
- [ ] モジュールスコープに `let excluded = {};`。
- [ ] `load()` の `chrome.storage.local.get([...])` 配列に `EXCLUDED_KEY` を追加し `excluded = data[EXCLUDED_KEY] || {};`。
- [ ] `rowEl(s)` に除外トグルボタン追加（`actions` 内、`secondary exclude-btn`）。ラベル `excluded[s.key] ? '除外解除' : '除外'`、クリックで `toggleExcluded(s)`。
- [ ] `rowEl(s)` で `if (excluded[s.key]) row.classList.add('excluded');`。
- [ ] `toggleExcluded(s)` を `togglePriority` と同型で追加（トグル→`chrome.storage.local.set({ [EXCLUDED_KEY]: excluded })`→`render()`）。
- [ ] **照会から確実に除外**: `fullTargets()`/`simpleTargets()` の filter に `&& !excluded[s.key]` を**無条件で**追加（「除外を隠す」フィルタON/OFFと独立）。

### extension/options/options.css
- [ ] `.series.excluded { opacity: 0.6; }`（`.completed` と同等）。

### verify
- [ ] `node verify-kindle-library.mjs` / `node verify-catalog-probe.mjs` pass。
- [ ] `git add extension/options/options.js extension/options/options.css` → commit。

---

## スプリント2: テーマ切替（FOUC対策＋3択トグル＋popup追従）

### extension/shared/theme-init.js（新規）
- [ ] IIFEで同期実行。`localStorage.getItem('kstTheme')`（`light|dark|auto`、無効値は `auto`）。
- [ ] `light|dark` のとき `document.documentElement.dataset.theme = value` と `document.documentElement.style.colorScheme = value`。`auto` のとき `dataset.theme` 未設定（mediaに委ねる）。
- [ ] try/catch で `localStorage` 例外を握りつぶす（privateモード等）。

### extension/options/options.html
- [ ] `<head>` の `<link rel="stylesheet">` より前に `<script src="../shared/theme-init.js"></script>`（同期・deferなし）。
- [ ] `.topbar` 右上にテーマトグル（`<select id="themeToggle">` に `auto/light/dark`）。

### extension/options/options.css
- [ ] `:root` をライト（T2琥珀）変数に再定義。`color-scheme` は `:root` で `light dark` のまま。
- [ ] `:root[data-theme="dark"] { ... }` にダーク（T3）変数。
- [ ] `@media (prefers-color-scheme: dark) { :root:not([data-theme]) { ...ダーク変数... } }`（auto時のみmedia）。
- [ ] バッジ等のハードコード色を変数化、またはダーク上書きを `:root[data-theme="dark"]` に追記。

### extension/options/options.js
- [ ] `els.themeToggle` 追加。
- [ ] 初期化: `chrome.storage.local.get(['kstTheme'])` を読みトグル初期値に反映。`localStorage` とズレていれば再同期。
- [ ] `themeToggle` の `change` で `applyTheme(value)`: (1)`localStorage.setItem`、(2)`chrome.storage.local.set`、(3)`dataset.theme`/`style.colorScheme` 更新。theme-init.js とロジックを一致させる。

### extension/popup/popup.html
- [ ] `<head>` の stylesheet より前に `<script src="../shared/theme-init.js"></script>`。popupにトグル・除外UIは追加しない。

### extension/popup/popup.css
- [ ] 先にハードコード色を変数化（`:root` ライト変数定義→本文を `var()` 化）。
- [ ] `:root[data-theme="dark"]` にダーク値。
- [ ] `color-scheme` を `:root` で `light dark`（現状 `light` 固定）に変更し、`@media (prefers-color-scheme: dark) { :root:not([data-theme]) { ... } }` 追加。

### extension/popup/popup.js
- [ ] 初期化で `chrome.storage.local.get(['kstTheme'])` → `localStorage` 再同期＋`dataset.theme`/`colorScheme` 適用（read-only追従）。

### verify
- [ ] verify 2本 pass。
- [ ] `git add extension/shared/theme-init.js extension/options/options.html extension/options/options.css extension/options/options.js extension/popup/popup.html extension/popup/popup.css extension/popup/popup.js` → commit。

---

## スプリント3: 専用ページUI刷新（ツールバーY＋カードB＋配色適用）

### extension/options/options.html
- [ ] ツールバー2段化（既存ID完全維持）。上段: `search`/`sort`/`checkVisible`/`checkSimple`。下段: フィルタチップ群（`filterMissing`/`filterPriority`/`filterStatus`/`filterHideCompleted`/新規 `filterExcluded`）＋クリア系（`clearCache`/`clearScan`）。
- [ ] チップ化: checkbox系は `<label class="chip"><input type="checkbox" id="..."/> ラベル</label>`（id・type保持）。`sort`/`filterStatus` は `<select>` のまま。
- [ ] 「セール中」チップ（新規 `id="filterSale"`）を下段に追加。

### extension/options/options.js
- [ ] `els` に `filterExcluded`・`filterSale` 追加。
- [ ] `passesFilter(s)` に追加: `if (els.filterExcluded.checked && excluded[s.key]) return false;`、`if (els.filterSale.checked && card.discountValue(cache[s.key]) <= 0) return false;`。
- [ ] `els.filterExcluded`/`els.filterSale` の `change` → `render`。render()ではコントロール生成しない。
- [ ] `rowEl` カードB対応: 割引バッジを右上強調、左ボーダー色（`if (cache[s.key]?.status==='has-next') row.classList.add('has-next')`、割引ありで `row.classList.add('on-sale')`）。既存サムネ/meta/actions 組み立ては温存。

### extension/options/options.css
- [ ] ツールバー2段レイアウト（`.toolbar-top`/`.toolbar-filters`、sticky `top` 再調整）。
- [ ] `.chip { ... }` ＋ `.chip:has(input:checked) { ...琥珀アクティブ... }`。
- [ ] カードB: `.series.on-sale { border-left: 3px solid ...; }`、割引バッジ右上強調。
- [ ] 配色T2/T3 の最終調整（スプリント2変数の値確定）。

### series-card.js
- [ ] 原則触らない。触った場合 `node verify-series-card.mjs` 必須。

### verify
- [ ] チップ化後も `checkVisible`/`checkSimple` の abort（中止）が機能することを手動確認。
- [ ] verify 2本（series-card変更時は3本）pass。
- [ ] `git add extension/options/options.html extension/options/options.css extension/options/options.js` → commit。

---

## スプリント4: リアルタイムソート（数件ごと再描画）

### extension/options/options.js
- [ ] `runBulkProbe` ループ内、`done % 20` のキャッシュ保存とは独立に `if (done % 5 === 0) render();`。
- [ ] 照会順は `targets` スナップショットで不変。ループ中に `targets` 再生成しない。
- [ ] スクロール位置保持は実装しない（spec トレードオフ）。
- [ ] popup.js の `runBulkProbe` は変更しない（リアルタイムソートは options 限定）。

### verify
- [ ] 中止（abort）が依然機能すること（`% 5` render が `bulkAbort` ループ脱出を壊さない）を確認。
- [ ] verify 2本 pass。
- [ ] `git add extension/options/options.js` → commit。

---

## 最終: dev同期（user確認用）
- [ ] `scripts\build-dev.ps1 -Target all` で `dist/dev/chrome`/`dist/dev/firefox` 更新。

## リスクと注意点

1. **[最重要] インラインscript不可（CSP）**: spec原文のFOUC手段は動かない。`theme-init.js` 外部同期スクリプト必須。
2. **ロックステップ崩壊**: チップ化で checkbox→button 置換すると `els.*.checked` 全滅。checkbox維持・CSS装飾のみ。
3. **abort回帰**: `runBulkProbe` の listener 差し替え・`disabled` 制御は `checkVisible`/`checkSimple` が `<button>`・同一参照前提。restyleのみ。
4. **get配列漏れ**: `EXCLUDED_KEY`・`kstTheme` を `chrome.storage.local.get([...])` に追加し忘れない。
5. **照会除外の独立性**: `!excluded[s.key]` は「除外を隠す」チップと無条件独立。
6. **popup.css は変数未使用**: ダーク対応前に全ハードコード色を変数化する工程が必要。
7. **color-scheme出し分け**: 明示選択時のみ `style.colorScheme` を当て、auto時は `:root`既定＋mediaに委ねる。
8. **`:has()` 依存**: チップアクティブ表示。Chrome/Firefox現行はサポート済み。
9. **series-card.js 変更時の3本目verify**。
10. **theme適用ロジック二重持ち**: `theme-init.js` と options.js `applyTheme` を必ず一致させる。
