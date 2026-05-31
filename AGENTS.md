# AGENTS.md (kindle-series-sale-tracker)

Amazon.co.jp の Kindle 蔵書一覧からシリーズ候補を抽出し、続刊確認用リストを作る Chrome 拡張プロトタイプ。Manifest V3 / 素の JavaScript。

## 検証コマンド

```powershell
node .\verify-kindle-library.mjs
node .\verify-catalog-probe.mjs
.\scripts\build-dev.ps1 -Target all
.\scripts\package-release.ps1 -Target all
```

`verify-kindle-library.mjs` は所有データ抽出・シリーズ推定・CSV出力・所有レンジ/欠番計算を検証する。
`verify-catalog-probe.mjs` は続刊検出（最高巻より先の巻の検出）マッチングを検証する。検索結果DOM抽出 `parseSearchResultsFromDoc` は実HTML fixture での検証が別途必要。
`extension/` または `manifests/` を変更したら、最終応答前に `.\scripts\build-dev.ps1 -Target all` を実行し、`dist/dev/chrome` と `dist/dev/firefox` に反映する。`dist/` はGit管理外なので、ソース変更のたびに再生成する。

## 取得方式

- 対象ページ: `https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll*`
- content script が同一オリジンで `GetContentOwnershipData` を呼び、`title` / `authors` / `asin` / `readStatus` / `acquiredTime` / `productImage` を取得する
- 保存する明細 `items` は `asin` / `seriesKey` / `volume` / `imprint` / `author` に圧縮する。表紙はシリーズ要約の `latestOwnedThumbnailUrl` に最新所有巻1枚だけ保存する
- 発行日・発売日は `GetContentOwnershipData` では確認できていないため、通常スキャン時点では保存しない。続刊照会時に検索結果から取れた場合だけ `kstCatalogCache` に保存する
- 保存先は `chrome.storage.local`
- cookie、ログイン情報、実購入URLは保存しない

## 実装方針

- `extension/shared/kindle-library.js` を所有データ正規化・シリーズ推定・CSV出力の Single Source of Truth にする
- content script は Amazon からの取得と storage 保存に集中させる
- popup は保存済み結果の表示とエクスポートに集中させる
- セール検出や未購入ASIN確定を追加する場合は、まず fixture を追加して verify を拡張する

## 既知の制約

- Amazon 内部 Ajax 依存のため、ページ変更で壊れる可能性がある
- シリーズ名と巻数はタイトル文字列からの簡易推定
- 価格・セール情報は未実装
- host permissions や store package 作成はユーザー確認を挟む
