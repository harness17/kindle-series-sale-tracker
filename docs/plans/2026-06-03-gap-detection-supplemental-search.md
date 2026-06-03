# ギャップ検出 + 補完検索

- ベースコミット: `8f691ef`
- 対象ブランチ: `feature/storage-lite-and-scan-modes`

## 背景

Amazon 検索は1回あたり最新 20件前後しか返さない。107巻所有・216巻が最新のシリーズでは
108巻がヒットせず `nextVolume=214` のように誤判定される。

## スプリントコントラクト

- 正常系: 所有107巻・最新216巻のシリーズで「続刊・価格確認」を押すと108巻が `nextVolume` になる（補完検索が108巻を返した場合）
- ギャップなし: `nextVolume <= highestVolume + 3` の場合は補完検索を実行しない
- 異常系: 補完検索が失敗・結果なしの場合は初回検索結果をそのまま返す
- 副作用: `verify-catalog-probe.mjs` が引き続き全 pass する
- dist: `scripts\build-dev.ps1 -Target all` が成功する

## 変更ファイル

- `extension/shared/series-card.js`（主な変更）

変更しないファイル:
- `extension/shared/catalog-probe.js`
- `verify-catalog-probe.mjs`
- `manifests/` 以下

## 実装チェックリスト

- [ ] `fetchSearchResults(catalog, url)` ヘルパーを `probeSeriesWithUrl` の直上に追加する
  - `fetch(url, { credentials: 'include' })` → `!res.ok` なら `[]` を返す
  - `DOMParser().parseFromString(html, 'text/html')` → `catalog.parseSearchResultsFromDoc(doc)` を返す

- [ ] `probeSeriesWithUrl` を `fetchSearchResults` の薄いラッパーにリファクタする
  - シグネチャ `(catalog, group, searchUrl, seriesKey)` は維持する
  - `results.length === 0` なら `{ status: 'unknown' }` を返す

- [ ] `probeSeries` にギャップ検出と補完検索を追加する
  - 初回: `fetchSearchResults(catalog, group.searchUrl)` → `detectNextVolume`
  - ギャップ条件: `result.status === 'has-next' && result.nextVolume > group.highestVolume + 3`
  - 補完URL: `seriesSearchUrl(`${group.seriesKey || group.title} ${group.highestVolume + 1}`, '')`
  - 補完fetch: 独立した `try/catch` で囲み、失敗時は初回結果を維持する
  - マージ: `primaryResults.concat(gapResults)` → `detectNextVolume` を呼び直す
  - 採用条件: `mergedResult.status === 'has-next'` のときのみ採用
  - closing-dash フォールバックは既存ロジックを維持する

- [ ] `node verify-catalog-probe.mjs` が全 pass することを確認する

- [ ] `scripts\build-dev.ps1 -Target all` を実行して `dist/dev` を更新する

- [ ] 変更ファイルを個別指定で `git add` して `git commit` する（`git add -A` 禁止）
