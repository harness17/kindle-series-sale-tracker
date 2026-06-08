# 設計: 自動実行ステータス表示 ＋ 自動スキャンの簡易化

- 日付: 2026-06-08
- 対象リポジトリ: kindle-series-sale-tracker
- ブランチ: feature/auto-execution-status（実装時に作成）
- ステータス: 承認済み（実装は Codex 共同）

## 背景・目的

自動化機能（自動スキャン / BGプローブ）が「いつ動いたか・次いつ動くか・今どこまで進んだか」がユーザーに見えない。ツールバーバッジの数字しか可視化されておらず、しかも popup を開くと即リセットされる（popup.js:407）。実行状況を popup と専用ページ（options）に表示し、あわせて自動スキャンの動作を「簡易取得のみ」に整理する。

## スコープ

- **動作変更**: `maybeAutoScan`（content.js）を「ベースラインがあれば simple、なければスキップ」に変更。自動では full（全件取得）を走らせない。
- **background.js**: `kstBgProbeLastRunAt` タイムスタンプを 1 箇所追記。
- **表示追加**: popup と options の両方に自動実行ステータスを表示。
- **触らない**:
  - `offscreen/offscreen.js`（バッジ累積の二重経路には手を入れない）
  - `shared/kindle-library.js` / `shared/catalog-probe.js` / `shared/series-card.js` の検出・推定ロジック
  - `manifests/*` の権限（`alarms` は chrome/firefox 両方に既存）
  - `fixtures/` / `verify-*.mjs`（既存関数の再利用のみのため）

## 設計方針

**「background はタイムスタンプ 1 個だけ追加。残りは読み取り側で導出」** — background.js と offscreen.js の二重経路（バッジ累積）の改修を避け、回帰リスクを最小化する。バッジ内訳はスナップショット方式（現在の状態を集計）で出す。

## 1. 自動スキャンの簡易化（content.js `maybeAutoScan`）

現状（content.js:420）:

```js
const mode = Array.isArray(scan?.items) && scan.items.length > 0 ? 'simple' : 'full';
```

変更後:

- `scan.items` が**有る** → `mode = 'simple'` で実行
- `scan.items` が**無い**（初回・旧縮退データ） → **何もせず return**（自動では full を走らせない。初回 full は手動のまま）

理由: `simple` モードはベースラインが無いと例外を投げる（content.js:343-345 `simpleScanNeedsBase`）。常時 simple にすると初回が失敗するため、ベースライン無しはスキップする。

`kstAutoScanLastAttempt` の更新タイミングは現状維持（スキップ時は更新しない＝最終実行時刻が偽更新されない）。

## 2. BGプローブ最終実行時刻の記録（background.js）

`runBackgroundProbe` 内、offscreen / inline 両モードを通った後の共通点（現状 ~222 行、`const badgeCount = ...` 付近）で:

```js
await storageSet({ [BG_PROBE_LAST_RUN_KEY]: Date.now() });
```

- 新ストレージキー: `kstBgProbeLastRunAt`
- `BG_PROBE_LAST_RUN_KEY` 定数を background.js 上部に追加
- offscreen.js は**変更しない**（共通点が両モードをカバーするため）
- 「対象シリーズ無し」early return（現状 186-191 行）でも記録するか: 記録する（実行した事実を残す）。

## 3. ステータス表示の内容

### 自動スキャン（簡易表示）

| 項目 | 内容 |
|------|------|
| 状態 | 有効 / 無効（`kstAutoScanEnabled`） |
| 最終実行 | `kstAutoScanLastAttempt`（無ければ `kstLastScan.scannedAt`、それも無ければ「未実行」） |

次回予定・進捗は出さない（ページ訪問時のみ発火する opportunistic 動作のため、確定的な次回時刻を示せない）。

### BGプローブ（詳細表示）

| 項目 | データ源 | 表示 |
|------|---------|------|
| 状態 | `kstBgProbeEnabled` | 有効 / 無効 |
| 最終実行 | `kstBgProbeLastRunAt` | 日時（無ければ「未実行」） |
| 次回予定 | `chrome.alarms.get('kstBgProbe')` → `scheduledTime` | 日時（取得不可なら非表示） |
| 進捗 | `queue.cursor` ＋ 読み取り側で再計算した eligible 総数 | 「今サイクル X/N 照会済み」 |
| 内訳 | `kstCatalogCache` ＋ scan から集計 | 「続刊あり N件 / 値引き M件」 |

#### 進捗（eligible 総数の再計算）

background.js の `eligibleSeries(scan, completed, excluded)` と同じフィルタを読み取り側でも適用して総数 N を得る（`scan.series` のうち completed / excluded を除き `highestVolume` が有限なもの）。`queue.cursor` は「次チャンクの開始位置」なので「X = cursor 件 照会済み」と解釈する。`cursor === 0` のときは `queue.lastCycleAt` の有無で「サイクル完了直後」か「未着手」かを判別する。

#### 内訳（スナップショット集計）

`kstCatalogCache` の各エントリと scan の `highestVolume` を `series-card.js` の既存関数で評価する:

- 続刊あり: `card.isConfirmedHasNext(card.reconcileCatalog(cacheEntry, highestVolume))` が true の件数
- 値引き: `card.discountValue(card.reconcileCatalog(cacheEntry, highestVolume)) > 0` の件数

completed / excluded は除外する。これは「前回リセット以降の新着」ではなく「現在その状態にあるシリーズ数」のスナップショット。バッジ累積（`kstBgBadgeCount`）とは別物として扱う。

## 4. UI 配置

### options（専用ページ）

- 「自動化」セクション（options.html の `.automation-settings`）内、トグル/間隔設定の下にステータスブロックを追加。
- 自動スキャン行・BGプローブ行をそれぞれ表示。読み込み時と `chrome.storage.onChanged` で更新する。

### popup

- 既存の status 行（`#status`）付近に簡易サマリを追加。
  - 例: 「自動: 最終 6/8 14:00 ／ BG: 最終 13:30・続刊2件・値引き1件」
- popup を開いた時点の値で表示（リアルタイム購読は不要）。

無効な機能は「無効」と明示する（空欄にしない）。

## 5. i18n（i18n.js）

ja / en 両方に文字列を追加。命名は既存（`lastScan` 等）に倣う。必要な文字列の例:

- `statusHeading`（「実行状況」/ "Status"）
- `autoScanStatusLabel` / `bgProbeStatusLabel`
- `statusEnabled` / `statusDisabled` / `statusNeverRun`（「未実行」/ "Never run"）
- `statusLastRun(date)` / `statusNextRun(date)`
- `statusProgress(done, total)`（「今サイクル {0}/{1} 照会済み」）
- `statusBreakdown(next, discount)`（「続刊 {0}件 / 値引き {1}件」）

関数引数の補間は既存の i18n パターン（`function (date) { return ... }`）に揃える。

## 変更ファイル一覧

1. `extension/content/content.js` — `maybeAutoScan` の mode 決定を変更
2. `extension/background/background.js` — `kstBgProbeLastRunAt` 追記＋定数追加
3. `extension/popup/popup.js` — status 簡易サマリ
4. `extension/options/options.js` — ステータス描画
5. `extension/options/options.html` — ステータス表示要素
6. `extension/shared/i18n.js` — 文字列追加（ja/en）

## 完成条件

- 正常系:
  - BGプローブ有効時、options に最終実行・次回予定・進捗・内訳が表示される。
  - 自動スキャン有効時、options/popup に最終実行時刻が表示される。
  - ベースラインがある状態で自動スキャンが走ると `simple` で実行される。
- 前提・動作:
  - ベースライン（`scan.items`）が無いとき、自動スキャンは何もしない（full を走らせない）。
- 異常系:
  - `chrome.alarms.get` が null を返す / 未スケジュールのとき、次回予定は非表示（エラーにしない）。
  - 各値が未保存のとき「未実行 / 無効」を表示（空欄や NaN を出さない）。
- 無回帰:
  - `node verify-kindle-library.mjs` / `node verify-catalog-probe.mjs` が pass。
  - offscreen.js 無改修でバッジ累積（`kstBgBadgeCount`）の挙動が従来どおり。
  - `scripts/build-dev.ps1 -Target all` で dist/dev が最新化される。

## 検証

```powershell
node .\verify-kindle-library.mjs
node .\verify-catalog-probe.mjs
.\scripts\build-dev.ps1 -Target all
```

実動確認: chrome://extensions/ で dist/dev/chrome を読み込み、options で自動化トグルを ON にして BGプローブを手動発火（または間隔到来）させ、ステータスが更新されることを確認する。Amazon ログイン必須の自動スキャン実機確認はユーザー素材ベース。
