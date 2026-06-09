# ストア審査メモのルール

## 文字数制限

| ストア | フィールド | 上限 |
|--------|-----------|------|
| Firefox Add-ons (AMO) | Notes to Reviewer | 3,000 文字 |
| Chrome Web Store | Test Instructions | 4,000 文字（目安） |

reviewer-notes.md の `Submission text` ブロックはこの上限内に収める。超過していたら圧縮してから提出用テキストとして提示する。

## 構成の優先順位

字数が限られるため、以下の順に重要度が高い。下位は圧縮・省略してよい。

1. **再提出時の修正内容**（リジェクト理由への対処）
2. **目的の一文要約**
3. **技術要点**（eval なし・リモートコードなし・innerHTML 対応状況）
4. **ネットワークアクセス先とトリガー条件**
5. **テスト手順**（番号リスト、最小ステップ）
6. **ソースコード URL**
7. ソースコードレイアウト（省略可 — ZIP 内で確認できるため）
8. データストレージ詳細（省略可 — Privacy タブに記載済みのため）

## Firefox AMO 固有の注意

- `innerHTML` + 動的値は `createElement`/`textContent` に置換する。静的リテラルのみの `innerHTML` は許容される。
- Chrome 専用 API（`sidePanel`, `offscreen`）はブラケット記法（`chrome['sidePanel']`）で参照し、ランタイムガードを併用する。ドット記法は静的解析で警告される。

## 適用タイミング

- reviewer-notes.md を新規作成・更新するとき
- ストア提出パッケージを作成するとき（`package-release.ps1`）
- リジェクト対応で再提出するとき
