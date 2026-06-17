# AGENTS.md (kindle-series-sale-tracker)

Amazon.co.jp の Kindle 蔵書からシリーズ候補を抽出し、続刊・セール確認を支援する Chrome / Firefox 拡張。Manifest V3 / 素の JavaScript。

## 作業開始

1. `git status --short --branch` で既存変更を確認する。
2. `CLAUDE_CODE_HANDOFF.md` がある場合は、現在の作業に関係する最新セクションを読む。
3. 新機能、複数ファイル修正、広い不具合修正では、正常系・前提条件・異常系・無回帰を含む完成条件を先に宣言する。
4. コード変更前に次の共通ルールを読む。

## 共通ルール

- 常に読む: [.agents/rules/architecture-and-data.md](.agents/rules/architecture-and-data.md)
- 常に読む: [.agents/rules/verification.md](.agents/rules/verification.md)
- Amazon 取得、検索結果解析、fixture、権限を扱う場合: [.agents/rules/amazon-boundary.md](.agents/rules/amazon-boundary.md)
- manifest、store-assets、版上げ、パッケージ、公開を扱う場合: [.agents/rules/release-and-store.md](.agents/rules/release-and-store.md)

Claude Code 固有の共同作業ルールは `CLAUDE.md` と `.claude/rules/` を参照する。プロジェクトの実装契約は `.agents/rules/` を正本とし、Claude/Codex 固有ファイルへ重複コピーしない。

## 必須境界

- `extension/shared/kindle-library.js` を所有データ正規化・シリーズ推定・CSV生成の正本にする。
- `extension/shared/catalog-probe.js` は検索結果の抽出・候補照合、`extension/shared/series-card.js` は照会フローと表示用状態解決を担当する。
- content script は Amazon 同一オリジン取得と保存、popup/options は保存済み結果の表示・設定・明示操作に集中させる。
- Chrome の background DOM 解析は offscreen document、Firefox は background scripts の DOMParser を使う。片側だけの修正にしない。
- cookie、認証情報、実購入URL、個人の蔵書明細をソース、fixture、ログ、handoff、store-assets、パッケージへ入れない。
- permissions / host_permissions の拡大、ストア提出物の作成・公開はユーザー確認を挟む。
- `git add -A` / `git add .` は使わず、stage は明示したファイルだけにする。

## 完了ゲート

- 変更範囲に対応する verify を実行し、失敗を未解決のまま成功扱いしない。
- `extension/` または `manifests/` を変更したら `.\scripts\build-dev.ps1 -Target all` を実行し、`dist/dev/chrome` と `dist/dev/firefox` を更新する。
- Amazon の実ページ確認が必要で自動化できない場合は、未確認範囲とユーザーが行う最小手順を明記する。
- 公開物・提出物は個人情報、ローカルパス、未公開情報、不要ファイルを確認してから共有する。
