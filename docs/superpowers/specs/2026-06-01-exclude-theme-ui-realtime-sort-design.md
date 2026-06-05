# 設計: 除外フラグ・テーマ切替・専用ページUI刷新・リアルタイムソート

- 日付: 2026-06-01
- 対象リポジトリ: kindle-series-sale-tracker
- ブランチ: feature/storage-lite-and-scan-modes
- ステータス: 承認済み（実装は Codex 共同）

## 背景・目的

専用ページ（options）に以下4点を追加・改善する。

1. シリーズの **除外フラグ**（興味なし/誤検出を一括照会の対象外にする）
2. **テーマ切替**（ライト / ダーク / OS追従）
3. 専用ページの **UI刷新**（カード・ツールバー・配色）
4. 新刊照会中の **リアルタイムソート**（数件ごとに再描画）

## スコープ

- **専用ページ（options）**: フル刷新。カードB（ステータス強調）＋ ツールバーY（2段整理・チップ化）＋ 配色 T2(ライト・琥珀)/T3(ダーク) ＋ テーマトグル ＋ 除外フラグ ＋ 数件ごと再ソート。
- **popup**: テーマ追従のみ（ダーク対応CSS＋初期適用）。カードレイアウト・機能は現状維持。
- **触らない**: `shared/kindle-library.js` / `shared/catalog-probe.js` の検出・推定ロジック、`manifests/*` の権限、データスキャン処理。

## 1. 除外フラグ

- 新ストレージキー `kstExcludedSeries`（`{ [seriesKey]: true }`）を `kstCompletedSeries`/`kstPrioritySeries` と並列に追加。
- カードに「除外」トグルボタンを追加。除外シリーズは `.completed` と同じく薄く（opacity 0.6）表示する（「薄く表示」要件）。
- **照会対象から確実に外す**: `fullTargets()` / `simpleTargets()` で、「除外を隠す」フィルタの ON/OFF とは独立に、除外シリーズを明示的に除外する。薄く表示されている状態でも一括照会の対象に含めない。
- ツールバー下段に「除外を隠す」チップを追加。
- 除外は **専用ページのみ**（popup には除外UIを追加しない）。

## 2. テーマ切替（ライト / ダーク / OS追従）

- 右上トグルで3択。選択を `chrome.storage.local`（キー `kstTheme`: `light|dark|auto`）に保存。
- CSS構成:
  - `:root` をライト(T2琥珀)変数に定義。
  - `:root[data-theme="dark"]` にダーク(T3)変数を定義。
  - `auto` のときのみ `@media (prefers-color-scheme: dark)` でダーク変数を当てる（明示選択時は media を効かせない）。
- **初期フラッシュ(FOUC)対策**: MV3拡張ページは CSP（`script-src 'self'`）でインライン `<script>` が実行できないため、新規 `extension/shared/theme-init.js` を `options.html` / `popup.html` の `<head>` 内で stylesheet より前に同期 `<script src>` として読み込む。theme-init.js は `localStorage` を同期 read して DOM 描画前に `document.documentElement.dataset.theme` と `color-scheme` を適用する。`localStorage` を同期 SoT、`chrome.storage.local.kstTheme` を正本とし、各ページ初期化時の非同期ロードで再同期（自己修復）する。options/popup は同一拡張オリジンで `localStorage` を共有するため popup 追従も同キーで動く。
- 明示選択時は `color-scheme` も合わせて切替（スクロールバー等ネイティブ部品の追従）。
- **popup も同じ `kstTheme` を読み**、同方式（ダーク変数＋head同期適用）でテーマ追従させる。

## 3. ツールバー / カード刷新

- チェックボックス → トグルチップ化（欠番あり / 優先のみ / セール中 / 完結を隠す / 除外を隠す）。
  - **既存ID と `els` 参照・`.checked` 読み取りをロックステップで変更**する。`search/sort/filterMissing/filterPriority/filterStatus/filterHideCompleted/checkVisible/checkSimple/clearCache/clearScan` の参照を維持し、一括照会中の abort ハンドラ差し替え（`checkVisible`/`checkSimple`）挙動を壊さない。
  - `render()` は controls を再生成しない前提を維持する。
- レイアウト: 上段=検索 / ソート / 一括照会2種、下段=フィルタチップ群 / クリア系。
- カードB: サムネ左、右上に割引バッジ強調、左ボーダー色でセール/続刊状態を示す。
- 「セール中」チップは割引（`card.discountValue`）が有効なシリーズの絞り込み。

## 4. リアルタイムソート（数件ごと）

- `runBulkProbe` 内で N=5 件ごとに `render()` を呼び、割引率順などを逐次反映。
- 照会順はループ前に確定したスナップショット配列で不変（再ソートされるのは表示のみ）。
- キャッシュ保存は既存の20件ごとを維持（再描画頻度とは独立）。
- **トレードオフ**: 再ソート時にスクロール位置は保持しない（「数件ごと」採用前提で許容）。

## 触るファイル

- `extension/shared/theme-init.js`（新規・FOUC対策の同期スクリプト）
- `extension/options/options.html`
- `extension/options/options.css`
- `extension/options/options.js`
- `extension/popup/popup.html`（theme-init.js 読み込み追加）
- `extension/popup/popup.css`（変数化＋ダーク変数）
- `extension/popup/popup.js`（テーマ再同期）
- 必要なら `extension/shared/series-card.js` を最小限（カード描画共通化が要る場合のみ）

## 担当境界（Codex × Claude Code）

- **Codex**: options / popup の content・UI 実装（上記1〜4の実装本体）。
- **Claude Code**: レビュー（契約・回帰・セキュリティ観点）、データモデル追加（`kstExcludedSeries` キー設計）の妥当性確認、manifest 影響の確認。
- **user**: 実ブラウザでの目視確認、merge/publish 判断。

## 完成条件

- 正常系:
  - 除外ボタンでシリーズを除外/解除でき、薄く表示される。
  - 「除外を隠す」チップで除外シリーズの表示/非表示を切替できる。
  - テーマトグルでライト/ダーク/自動を切替でき、再オープン後も保持される。
  - 自動テーマが OS のダーク設定に追従する。
  - 新刊照会中、割引率順などが数件ごとに並び替わる。
- 利用前提（ローカル単一ユーザー）:
  - テーマ・除外フラグは `chrome.storage.local` / `localStorage` に永続。
- 異常系:
  - 除外シリーズは「一括続刊再確認」「新刊チェック（簡易）」の **両方** で照会対象から外れる。
  - テーマ初期表示でライト→ダークのフラッシュが出ない。
- 回帰防止:
  - `node verify-kindle-library.mjs` / `node verify-catalog-probe.mjs` が pass（UIは非カバー）。
  - チップ化後も一括照会の中止（abort）が機能する。

## 検証

- セルフ verify: `node verify-kindle-library.mjs`、`node verify-catalog-probe.mjs`
- dev 同期: `scripts\build-dev.ps1 -Target all` で `dist/dev/chrome`・`dist/dev/firefox` を更新
- 実動確認（user）: chrome://extensions/ で再読込 → 専用ページで上記完成条件を目視
