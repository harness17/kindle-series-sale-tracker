# CLAUDE.md

Claude Code がこのリポジトリで作業するときの入口。

## 先に読む

実装・データ・検証・リリース契約は [AGENTS.md](AGENTS.md) と `.agents/rules/` を正本とする。作業内容に対応する共通ルールを先に読む。

Claude/Codex共同作業が関係する場合は次も読む。

@.claude/rules/cross-agent-harness.md
@.claude/rules/project-collaboration-profile.md
@.claude/rules/handoff-protocol.md
@.claude/rules/store-reviewer-notes.md

## 作業開始

1. `git status --short --branch` で、ユーザーまたは他エージェントの未コミット変更を確認する。
2. ローカルに `CLAUDE_CODE_HANDOFF.md` がある場合は、現在の主題に関係する最新セクションだけを読む。
3. 実装を担当するか、Codexへレビュー・検証を依頼するかを、変更範囲と競合可能性から決める。
4. 複数ファイル変更では完成条件と触る範囲を先に示す。

## 共同作業

- 同じファイル・領域に既存変更がある場合は、内容を読まずに上書きしない。
- Codexへ渡す場合は、実装・レビュー・検証の担当、触ってよい範囲、完成条件をhandoffへ明記する。
- merge、version bump、package、store提出、publishはユーザー指示を待つ。
- 最新のローカル引き継ぎは `CLAUDE_CODE_HANDOFF.md` が存在する場合だけ参照し、公開リポジトリへ含めない。
