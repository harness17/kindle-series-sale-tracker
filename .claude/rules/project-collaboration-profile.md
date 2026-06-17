# Project Collaboration Profile

kindle-series-sale-tracker の実装契約は `AGENTS.md` と `.agents/rules/` を正本とする。このファイルは Claude Code と Codex の担当・レビュー境界だけを定義する。

## プロジェクト

- Manifest V3 Chrome / Firefox 拡張
- Amazon.co.jp のログイン済みブラウザセッション内で Kindle 蔵書と検索結果を扱う
- `origin` 設定済み。現在ブランチと未コミット変更を毎回確認する
- 個人の蔵書データ、認証情報、store提出物の公開判断が高リスク領域

## 担当の考え方

| 条件 | 主担当 |
|---|---|
| 限定的な実装・回帰テスト | 現在の実装者 |
| Amazon DOM変更への追従 | 実装者、反対側がfixtureと誤検出をレビュー |
| background / offscreen のChrome・Firefox差分 | 実装者、反対側が両browser契約をレビュー |
| データschema、storage migration、quota方針 | 設計を先に合意し、反対側レビュー |
| permissions、host_permissions、外部通信 | user確認必須、反対側レビュー |
| version、package、listing、提出、publish | userが最終判断 |

固定的に「Codexは実装、Claudeは設計」と割り当てない。既存変更の所有者、現在のhandoff、競合可能性に応じて分ける。

## 重大レビュー項目

- permissions / host_permissions / 外部通信の不要な拡大
- cookie、token、実購入URL、個人の蔵書データの保存・ログ・fixture・package混入
- `kindle-library` / `catalog-probe` / `series-card` の責務混在
- Chrome offscreen と Firefox inline background の片側だけの更新
- message、storage key、cache version の利用側更新漏れ
- full/simple scan、quota縮退、全件background巡回の既存契約破壊
- regression fixtureまたは関連 verify の欠落
- manifest、listing、privacy、reviewer notes の不一致

## Review Handoff

反対側レビューを依頼するときは、次をhandoffに含める。

- 完成条件
- 変更ファイルと所有範囲
- 実装上の判断と代替案
- 実行したverifyと未実施の実ブラウザ確認
- 特に見てほしい重大レビュー項目
