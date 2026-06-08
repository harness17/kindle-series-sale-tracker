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
| 最終実行 | 基準時刻（下記）。実際の実行が無い場合は仮値に「(仮)」を付す |
| 次回実行 | 基準時刻 ＋ `kstAutoScanIntervalD` 日 |

進捗は出さない（ページ訪問時のみ発火するため確定的な進捗が無い）。次回実行は ＝ 基準時刻＋間隔日数の**目安**（実際はページ訪問時に発火）。

#### 基準時刻（最終/次回の起点）

`base = kstAutoScanLastAttempt || kstLastScan.scannedAt || kstAutoScanEnabledAt`

- 実際の実行がある（`lastAttempt`/`scannedAt`）→ それを最終実行として表示し、次回＝それ＋間隔。
- 実際の実行が無い（未実行）→ 仮で `kstAutoScanEnabledAt`（自動化を有効にした時刻）を最終欄に「(仮)」付きで表示し、次回＝それ＋間隔。
- 無効時（`kstAutoScanEnabled` が false）→「無効」。

#### `kstAutoScanEnabledAt`（新キー）

- options.js で `autoScanEnabled` を true にした瞬間に `Date.now()` を記録する。
- 後方互換: options/popup の読み込み時、`autoScanEnabled === true` かつ `kstAutoScanEnabledAt` が未設定なら `Date.now()` を補填する（旧バージョンから有効のまま移行したユーザー対策）。

### BGプローブ（詳細表示）

| 項目 | データ源 | 表示 |
|------|---------|------|
| 状態 | `kstBgProbeEnabled` | 有効 / 無効 |
| 最終実行 | `kstBgProbeLastRunAt`（無ければ `kstBgProbeEnabledAt` を仮基準） | 日時。未実行は「(仮)」付き |
| 次回予定 | 導出 `base + 間隔` | 日時。未実行は「(仮)」付き |
| 進捗 | `queue.cursor` ＋ 読み取り側で再計算した eligible 総数 | 「今サイクル X/N 照会済み」 |
| 内訳 | `kstCatalogCache` ＋ scan から集計 | 「続刊あり N件 / 値引き M件」 |

#### 進捗（eligible 総数の再計算）

background.js の `eligibleSeries(scan, completed, excluded)` と同じフィルタを読み取り側でも適用して総数 N を得る（`scan.series` のうち completed / excluded を除き `highestVolume` が有限なもの）。`queue.cursor` は「次チャンクの開始位置」なので「X = cursor 件 照会済み」と解釈する。`cursor === 0` のときは `queue.lastCycleAt` の有無で「サイクル完了直後」か「未着手」かを判別する。

#### 内訳（スナップショット集計）

`kstCatalogCache` の各エントリと scan の `highestVolume` を `series-card.js` の既存関数で評価する:

- 続刊あり: `card.isConfirmedHasNext(card.reconcileCatalog(cacheEntry, highestVolume))` が true の件数
- 値引き: `card.discountValue(card.reconcileCatalog(cacheEntry, highestVolume)) > 0` の件数

completed / excluded は除外する。これは「前回リセット以降の新着」ではなく「現在その状態にあるシリーズ数」のスナップショット。バッジ累積（`kstBgBadgeCount`）とは別物として扱う。

#### 基準時刻（最終/次回の起点）— 自動スキャンと同形

`base = kstBgProbeLastRunAt || kstBgProbeEnabledAt`、`nextRun = base + 間隔(intervalH 時間)`。

- 実行がある（`lastRunAt`）→ 最終＝lastRunAt、次回＝lastRunAt＋間隔。
- 未実行（`lastRunAt` 無し）→ 仮で `kstBgProbeEnabledAt` を最終欄に「(仮)」付き、次回＝enabledAt＋間隔（「(仮)」）。
- 無効時 →「無効」。
- **次回は導出で算出する**（`chrome.alarms.get().scheduledTime` は表示に使わない）。これにより拡張更新でアラームが作り直されても表示・実行判定がリセットされない。

#### `kstBgProbeEnabledAt`（新キー）

- options.js で `bgProbeEnabled` を true にした瞬間に `Date.now()` を記録する（自動スキャンの enabledAt と同様）。
- **background.js でも補填する**（重要）: `onInstalled`/`onStartup` で `bgProbeEnabled === true` かつ `kstBgProbeEnabledAt` 未設定なら `Date.now()` を記録する。これを怠ると、旧バージョンから有効のまま移行したユーザーで due-check の base が 0 になり「常に期限切れ＝起動毎に即実行」になってしまう（罠）。

## 4. UI 配置

### options（専用ページ）

- 「自動化」セクション（options.html の `.automation-settings`）内、トグル/間隔設定の下にステータスブロックを追加。
- ステータスブロックは**折りたたみ式**にし、初期状態は閉じる（冗長なため）。`<details>`/`<summary>` を用い、`summary` に `statusHeading` を表示。`open` 属性は付けない（デフォルト閉）。CSS は options の既存スタイルに最小限で合わせる。
- 自動スキャン行・BGプローブ行をそれぞれ表示。読み込み時と `chrome.storage.onChanged` で更新する。

### popup

- 既存の status 行（`#status`）付近に簡易サマリを追加。
  - 例: 「自動: 最終 6/8 14:00・次回 6/15 14:00 ／ BG: 最終 13:30・続刊2件・値引き1件」
- 自動スキャンは popup でも**最終＋次回**を出す（次回基準は options と同じ）。
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
- `statusProvisional`（「(仮)」/ "(est.)"）— 未実行時の仮の最終/次回に付すマーカー

関数引数の補間は既存の i18n パターン（`function (date) { return ... }`）に揃える。

## 6. BGプローブの確実な実行（拡張更新でリセットされない）

### 問題

現状 `reconcileAlarms`（background.js）は `onInstalled`（拡張の更新・再読込のたびに発火）/ `onStartup` で**無条件に `chrome.alarms.create` を呼ぶ**。`alarms.create` は同名アラームを置き換えるため、周期タイマーが毎回 0 から再スタートする。照会間隔より更新頻度が高いと、アラームは永遠に発火しない。

### 修正（wake-time catch-up が本質）

1. **catch-up 関数 `maybeRunDueBgProbe()` を追加**:
   - `bgProbeEnabled === true` かつ `base = (kstBgProbeLastRunAt || kstBgProbeEnabledAt)` に対し `Date.now() >= base + intervalH時間` なら `runBackgroundProbe()` を実行。
   - `onInstalled` と `onStartup` で `reconcileAlarms()` に加えて `maybeRunDueBgProbe()` を呼ぶ。`onInstalled` が更新のたびに発火することで、更新が「リセット」ではなく「catch-up の機会」に反転する。
2. **`reconcileAlarms` を冪等化**（二次防御・churn 抑止）:
   - 既存アラームを `chrome.alarms.get(ALARM_NAME)` で取得し、`periodInMinutes` が希望周期と一致するなら**作り直さない**。間隔変更時・未作成時のみ create。
3. **`kstBgProbeEnabledAt` の background 補填**（前述の罠）: `onInstalled`/`onStartup` で enabled かつ未設定なら記録。
4. `runBackgroundProbe` 完走で `kstBgProbeLastRunAt = now` が進む → 次回（導出 base+間隔）も自動で前進。`nextRunAt` 専用キーは作らない。

> 注: アラームが拡張更新で消えるか/リセットされるかという Chrome の挙動差に依存しない。catch-up が両ケースで正しさを保証する。アラーム near-simultaneous での二重実行は 24h 周期の個人用途では無害なため、due-gate 一本化は任意（実装しなくてよい）。

### 自動スキャンは変更不要（証拠）

`maybeAutoScan` の呼び出しは content.js のページ読み込み時のみ（grep 確認済み）。アラーム駆動ではなく `staleness = max(scannedAt, lastAttempt)`（いずれも storage 永続）で判定するため、**拡張更新でリセットされない**。期限切れなら次回 Kindle 一覧ページ訪問時に必ず実行される。content script はページが開かないと動作できないため、純バックグラウンド実行はアーキテクチャ上不可。よって自動スキャン側はコード変更しない。

## 変更ファイル一覧

1. `extension/content/content.js` — `maybeAutoScan` の mode 決定を変更（※今回ラウンドでは変更なし）
2. `extension/background/background.js` — `kstBgProbeLastRunAt`／`kstBgProbeEnabledAt`、`maybeRunDueBgProbe`、`reconcileAlarms` 冪等化
3. `extension/popup/popup.js` — BGプローブ表示を base 導出（lastRunAt||enabledAt）に変更
4. `extension/options/options.js` — BGプローブ表示を base 導出に変更、`bgProbeEnabled` 有効化時に enabledAt 記録、`alarms.get` 依存を撤去
5. `extension/options/options.html` — （今回ラウンドでは変更なし）
6. `extension/shared/i18n.js` — （statusProvisional は既存。追加があれば）

## 完成条件

- 正常系:
  - BGプローブ有効時、options に最終実行・次回予定・進捗・内訳が表示される。
  - 自動スキャン有効時、options/popup に最終実行時刻が表示される。
  - ベースラインがある状態で自動スキャンが走ると `simple` で実行される。
- 前提・動作:
  - ベースライン（`scan.items`）が無いとき、自動スキャンは何もしない（full を走らせない）。
  - BGプローブ未実行時、最終・次回が `kstBgProbeEnabledAt` 基準で「(仮)」付き表示される。
  - **更新耐性**: BGプローブ有効状態で拡張を再読込（onInstalled 発火）したとき、`base+間隔` を過ぎていれば `maybeRunDueBgProbe` がその場で実行する。過ぎていなければ実行しない。
- 前提・動作:
  - ベースライン（`scan.items`）が無いとき、自動スキャンは何もしない（full を走らせない）。
  - BGプローブ有効化直後（未実行）は base=enabledAt なので、初回実行は 1 間隔後（起動毎の即実行にならない）。
- 異常系:
  - 各値が未保存のとき「無効 / (仮)」を適切に表示（空欄や NaN を出さない）。
- 無回帰:
  - `node verify-kindle-library.mjs` / `node verify-catalog-probe.mjs` が pass。
  - offscreen.js 無改修でバッジ累積（`kstBgBadgeCount`）の挙動が従来どおり。
  - `reconcileAlarms` 冪等化後も、間隔変更時はアラームが新周期で作り直される。
  - `scripts/build-dev.ps1 -Target all` で dist/dev が最新化される。

## 検証

```powershell
node .\verify-kindle-library.mjs
node .\verify-catalog-probe.mjs
.\scripts\build-dev.ps1 -Target all
```

実動確認: chrome://extensions/ で dist/dev/chrome を読み込み、options で自動化トグルを ON にして BGプローブを手動発火（または間隔到来）させ、ステータスが更新されることを確認する。Amazon ログイン必須の自動スキャン実機確認はユーザー素材ベース。
