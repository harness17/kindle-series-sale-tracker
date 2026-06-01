# Project Collaboration Profile（kindle-series-sale-tracker）

`cross-agent-harness.md` を kindle-series-sale-tracker に適用するためのプロジェクト固有設定。

## プロジェクト

- 名前: kindle-series-sale-tracker
- 種別: 単一の Manifest V3 Chrome 拡張（独立 git リポジトリ、remote 未設定）。Amazon.co.jp の Kindle 蔵書一覧からシリーズ候補を抽出し、続刊確認用リストを作る
- 主な検証対象: `manifests/<target>.json`、content script、background service worker、popup、`extension/shared/kindle-library.js`、`fixtures/`、`verify-kindle-library.mjs` / `verify-catalog-probe.mjs`
- 注意領域: host permissions、Amazon Kindle 蔵書ページ（`contentlist/booksAll*`）の DOM / 内部 Ajax 依存、Chrome Web Store 提出物、ログイン必須ページの検証、`store-assets/`、**個人の Kindle 蔵書データ（購入履歴）の非コミット**

## 担当境界

| 条件 | 振り先 |
|------|--------|
| content / popup / background / `shared/kindle-library.js` の限定修正 | Codex |
| Manifest 権限、host permissions、Chrome Web Store 公開判断 | Claude Code + user |
| Amazon Kindle 蔵書ページの DOM 変更への追従と fixture 追加 | Codex（Claude Code がレビュー） |
| ログイン必須ページの DOM 採取や実ブラウザ確認 | user が素材提供、実装者が fixture 化 |
| データモデル（蔵書正規化・シリーズ推定・巻数/欠番計算）の構造変更 | Claude Code + user |
| release package / screenshot / store listing 判断 | user |

## Verify コマンド

通常のセルフ verify:

```powershell
node .\verify-kindle-library.mjs
node .\verify-catalog-probe.mjs
```

- `verify-kindle-library.mjs` は所有データ抽出・シリーズ推定・CSV出力・所有レンジ/欠番計算を検証する。
- `verify-catalog-probe.mjs` は続刊検出（最高巻より先の巻の検出）マッチングを検証する。検索結果DOM抽出 `parseSearchResultsFromDoc` は実 HTML fixture での検証が別途必要。
- `extension/` または `manifests/` を変更したら、最終応答前に以下を実行して `dist/dev/chrome` と `dist/dev/firefox` を最新化する。`dist/` はGit管理外なので、コード変更とdevロード先の同期はエージェント側の完了条件に含める。

```powershell
.\scripts\build-dev.ps1 -Target all
```

store 提出物を確認する場合:

```powershell
.\scripts\package-release.ps1 -Target all
```

実動確認が必要な場合:

```text
scripts\build-dev.ps1 で extension/* + manifests/<target>.json を dist/dev/<browser>/ へステージし、
chrome://extensions/ で「パッケージ化されていない拡張機能」として読み込み、変更後に再読み込みする。
```

Amazon ログイン必須ページの DOM は agent-browser で取得できない。ユーザー提供の DevTools console 出力を `fixtures/` に保存して検証する。

## レビュー観点

### 動作

- 蔵書一覧取得 → シリーズ推定 → CSV / 続刊確認リスト出力の主要導線が動くか
- fixtures に対する検出・推定結果が期待通りか
- DOM / Ajax 変更に対して検出ロジックが過度に brittle になっていないか

### 契約

- `manifests/<target>.json` の permissions / host_permissions / content_scripts が実装と一致しているか
- background、content、popup の message contract が一致しているか
- `extension/shared/kindle-library.js` を変更した場合、content script と Node 検証（verify-*.mjs）の両方で読める形式を保っているか

### テスト

- `verify-kindle-library.mjs` / `verify-catalog-probe.mjs` が pass するか
- 新しい DOM パターンに対応したら fixture を追加しているか
- 過去 fixture の回帰を壊していないか

### セキュリティ・運用

- host permissions を必要最小限にしているか
- cookie、ログイン情報、実購入 URL、**個人の Kindle 蔵書データ（`kindle-series-books.json` 等の購入履歴）** をコミットしていないか
- store package や screenshot に不要な個人情報が入っていないか
- content script がページ DOM を破壊したり、外部送信したりしていないか

### スタイル

- 素の JavaScript / Manifest V3 の既存構成に揃っているか
- unrelated cleanup や依頼外ファイル変更が混ざっていないか
- `git add -A` / `git add .` を使わず、変更ファイルを個別指定しているか

## kindle-series-sale-tracker 固有の重大指摘

以下は原則として merge / publish ブロッカーにする。

- permissions / host_permissions の過剰化
- cookie、ログイン情報、実購入 URL、個人の Kindle 蔵書データ（購入履歴）の混入
- Chrome Web Store 提出物に不要ファイルや個人情報が混ざる
- message contract 変更で background / content / popup の片側だけが更新されている
- fixture 回帰検証が失敗している
- manifest version / content script match が Amazon Kindle 蔵書ページ（`contentlist/booksAll*`）と一致していない
