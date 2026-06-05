# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## このリポジトリの位置づけ

`kindle-series-sale-tracker` は **Manifest V3 の Chrome / Firefox 拡張**（独立 git リポジトリ）。Amazon.co.jp の Kindle 蔵書一覧からシリーズ候補を抽出し、続刊確認用リストを作る。素の JavaScript で実装する。

実装方針・取得方式・検証コマンドの詳細は [AGENTS.md](AGENTS.md) を参照する。

## DOM スクレイピング系拡張の検証戦略

Amazon Kindle 蔵書ページの DOM/内部 Ajax に依存するため、対象サイトの変更で壊れやすい。次を用意する:

- `fixtures/<case>.html` — 実 DOM のスニペット（ユーザーから貰った HTML をそのまま保存）
- `verify-kindle-library.mjs` / `verify-catalog-probe.mjs` — jsdom で検出・推定関数を単体検証するスクリプト
- 新パターンに遭遇したら fixtures に追加し、過去ケースの回帰も同時に検証する

### Amazon 等の要ログインサイトの DOM 確認

agent-browser は未認証なので、ログイン必須ページの DOM は取得できない。サンプルが必要なときはユーザーに DevTools (F12) → Console で実行してもらい、出力を `fixtures/<case>.html` に保存して `verify-*.mjs` のテストケースに追加する。

## Git

このリポジトリは remote 未設定のローカルリポジトリ。store package、スクリーンショット、ローカル設定、**個人の Kindle 蔵書データ（購入履歴）** を stage する前に必ず確認する。`git add -A` / `git add .` は使わず、変更ファイルを個別指定する。

## 共同開発ハーネス（Codex × Claude Code）

このリポジトリは Codex と Claude Code が共同で開発する。汎用ハーネス本体と kindle 固有 profile は以下を読む。

@.claude/rules/cross-agent-harness.md
@.claude/rules/project-collaboration-profile.md
@.claude/rules/handoff-protocol.md

**Claude Code が作業を開始するときの流れ：**

1. ユーザーの依頼を聞いたら、汎用ハーネスと kindle profile の担当境界で Codex に振るか自分で握るか判断する。
2. 自分で実装する場合は通常のフローで進め、必要に応じて Codex にレビューを依頼する。
3. Codex に振る・Codex の作業をレビューする場合は `.mcp.json` の codex MCP サーバ経由で連携する。
4. Merge / publish 判断はユーザー指示を待つ。

**最新の引き継ぎ：** ローカルに `CLAUDE_CODE_HANDOFF.md` がある場合だけ参照する。このファイルは公開リポジトリには含めない。
