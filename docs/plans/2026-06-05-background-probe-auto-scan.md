# バックグラウンドカタログ照会 + 自動スキャン

## スプリントコントラクト

実装内容: バックグラウンドでの定期カタログ照会（続刊/セール確認）と、Kindleページ訪問時の自動スキャンを追加する。

完成条件:

### 正常系
- [ ] Kindleページを開くと（設定ON・前回スキャンからN日以上経過時）quietモードでスキャンが走る
- [ ] alarm発火で最大8件のシリーズをcatalog probe、cacheを更新する
- [ ] 新しい続刊/セール発見時にバッジカウントが増える
- [ ] サイドパネル/サイドバーを開くとバッジがクリアされる
- [ ] cursorは全件消化後に0リセット、次のalarmから再び先頭から照会する

### 設定・認可
- [ ] デフォルト: 自動スキャンOFF、バックグラウンド照会OFF（オプトイン）
- [ ] 設定はchrome.storage.localに保存・復元される
- [ ] 設定OFFのときはalarmが登録されない/削除される
- [ ] options.htmlに自動化設定セクション（トグル+間隔セレクト）がある

### 異常系
- [ ] catalog probe中にfetchが失敗してもconsole.warnし次のシリーズに進む
- [ ] SWが途中でkillされてもcursorが保存されているため次のalarm発火で再開できる
- [ ] 自動スキャン失敗時はバナー表示なし（console.warnのみ）

### 副作用（no-regression）
- [ ] 既存の手動スキャン・手動probe・exclude/completed/priorityフラグが壊れない
- [ ] `verify-kindle-library.mjs` / `verify-catalog-probe.mjs` が全pass維持
- [ ] `build-dev.ps1 -Target all` が成功する

---

## 実装フェーズ

### Phase 1: Manifest + 権限

**`manifests/chrome.json`:**
- `permissions` を `["activeTab", "storage", "sidePanel", "alarms", "offscreen"]` に変更

**`manifests/firefox.json`:**
- `permissions` を `["activeTab", "storage", "alarms"]` に変更
- `"action": { "default_title": "__MSG_actionTitle__" }` を追加（badge表示のため）
- `"background"` セクションを追加:
  ```json
  "background": {
    "scripts": [
      "shared/kindle-library.js",
      "shared/catalog-probe.js",
      "shared/series-card.js",
      "background/background.js"
    ],
    "persistent": false
  }
  ```

### Phase 2: Offscreen Document（Chrome DOMParserブリッジ）

**新規 `extension/offscreen/offscreen.html`:**
```html
<!DOCTYPE html>
<html>
  <head><meta charset="UTF-8" /></head>
  <body>
    <script src="../shared/kindle-library.js"></script>
    <script src="../shared/catalog-probe.js"></script>
    <script src="../shared/series-card.js"></script>
    <script src="offscreen.js"></script>
  </body>
</html>
```

**新規 `extension/offscreen/offscreen.js`:**
- `chrome.runtime.onMessage` で `kst:bgProbeChunk` を受信
- 受信した `chunk`（シリーズ配列）と `prevCache` を使い、各シリーズに対し `window.__KST_CARD__.probeSeries(window.__KST_CATALOG__, series)` を呼ぶ
- 新規 has-next / 新規セール発見でバッジインクリメント判定
- `kstCatalogCache` + `kstBgProbeQueue`（cursor進行）+ `kstBgBadgeCount`（加算）を **1回の `chrome.storage.local.set`** で原子的に書き込む
- 応答 `{ done: true, badgeCount }` を返す

バッジ判定ロジック:
- `card.isConfirmedHasNext(newResult) && !card.isConfirmedHasNext(prevEntry)` → カウント+1
- `card.discountValue(newResult) > 0 && card.discountValue(prevEntry) <= 0` → カウント+1

### Phase 3: Background オーケストレータ

**`extension/background/background.js` 拡張:**

既存の sidePanel.setPanelBehavior を維持しつつ以下を追加:

1. **alarm reconciliation**（`onInstalled` + `onStartup`）:
   - storage から `kstBgProbeEnabled` / `kstBgProbeIntervalH` を読む
   - 有効なら `chrome.alarms.create('kstBgProbe', { periodInMinutes: intervalH * 60 })`
   - 無効なら `chrome.alarms.clear('kstBgProbe')`

2. **`storage.onChanged` ハンドラ**:
   - `kstBgProbeEnabled` / `kstBgProbeIntervalH` の変更で alarm 再構成

3. **`alarms.onAlarm` ハンドラ**（`name === 'kstBgProbe'`）:
   ```
   1. storage 読み取り: kstBgProbeEnabled, api.STORAGE_KEY, COMPLETED_KEY, EXCLUDED_KEY, CACHE_KEY, kstBgProbeQueue
   2. eligibleリスト構築: series.filter(s => !completed[s.key] && !excluded[s.key] && Number.isFinite(s.highestVolume))
      seriesKey でアルファベット順ソート（cursor安定性）
   3. cursor clamp: cursor >= eligible.length なら 0にリセット + lastCycleAt記録
   4. chunk = eligible.slice(cursor, cursor + 8)
   5. Chrome: offscreen document 作成/再利用 → kst:bgProbeChunk メッセージ送信
      Firefox: inline で probeSeries 実行（shared libs は background.scripts で読み込み済み）
   6. badge更新: chrome.action.setBadgeText({ text: String(count) || '' })
   7. Chrome: chrome.offscreen.closeDocument()
   ```

4. **ブラウザ分岐**: `typeof chrome.offscreen !== 'undefined'` で判定

5. **`runtime.onMessage` ハンドラ**:
   - `kst:reconcileAlarms` → alarm再構成（options.jsから呼ばれる）
   - `kst:bgProbeResult` → badge更新 + offscreen close（Chrome）

### Phase 4: Badge クリア

**`extension/popup/popup.js` の `init()` に追加:**
```javascript
chrome.action.setBadgeText({ text: '' });
chrome.storage.local.set({ kstBgBadgeCount: 0 });
```

### Phase 5: 自動スキャン（content script）

**`extension/content/content.js` の末尾に追加:**

1. モジュールレベル変数 `let silentAutoScan = false`
2. `showBanner` / `showProgress` 内で `if (silentAutoScan) return` ガード
3. `async function maybeAutoScan()`:
   - storage から `kstAutoScanEnabled`, `kstAutoScanIntervalD`, `api.STORAGE_KEY`, `kstAutoScanLastAttempt` を読む
   - 無効なら return
   - `Date.now() - max(scannedAt, lastAttempt) < intervalD * 86400000` なら return
   - `kstAutoScanLastAttempt = Date.now()` を保存（連打防止）
   - `silentAutoScan = true`
   - mode = `scan.items?.length > 0 ? 'simple' : 'full'`
   - `collectKindleBooks(mode)` を呼ぶ
   - finally で `silentAutoScan = false`
4. IIFE末尾: `maybeAutoScan().catch(e => console.warn('[KST] auto-scan error', e))`

### Phase 6: 設定UI + i18n

**`extension/shared/i18n.js`:**
新規キー11個を ja/en テーブルに追加:
`automationHeading`, `autoScanLabel`, `autoScanIntervalLabel`,
`bgProbeLabel`, `bgProbeIntervalLabel`,
`days3`, `days7`, `days14`, `hours12`, `hours24`, `hours48`

**`extension/options/options.html`:**
`<section class="automation-settings">` を追加（`<main>` の前）:
- 自動スキャン: checkbox + select(3d/7d/14d)
- バックグラウンド照会: checkbox + select(12h/24h/48h)
- `data-i18n` 属性でi18n対応

**`extension/options/options.js`:**
- 定数追加: `AUTO_SCAN_ENABLED_KEY`, `AUTO_SCAN_INTERVAL_KEY`, `BG_PROBE_ENABLED_KEY`, `BG_PROBE_INTERVAL_KEY`
- `els` に4つの新要素参照追加
- `init()`: storage読み取りで4キー追加、UIに反映
- change イベント: storage書き込み + `chrome.runtime.sendMessage({ type: 'kst:reconcileAlarms' })`

---

## ストレージキー（新規7個）

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `kstBgProbeEnabled` | boolean | `false` | BG照会ON/OFF |
| `kstBgProbeIntervalH` | number | `24` | 照会間隔（時間） |
| `kstBgProbeQueue` | `{cursor, lastCycleAt}` | `{cursor:0, lastCycleAt:0}` | 照会進捗 |
| `kstAutoScanEnabled` | boolean | `false` | 自動スキャンON/OFF |
| `kstAutoScanIntervalD` | number | `7` | スキャン間隔（日） |
| `kstAutoScanLastAttempt` | number | `0` | 最終試行タイムスタンプ |
| `kstBgBadgeCount` | number | `0` | バッジ未読カウント |

---

## 技術的注意点

- **Chrome MV3 SW では DOMParser 不可** → offscreen document で解決
- **Firefox は background.scripts（イベントページ）** → DOMParser 利用可、offscreen 不要
- **offscreen document の atomic write**: cache + cursor + badge を1回の storage.set で書く
- **SW kill 耐性**: cursor が storage に保存されているため、killされても次のalarmで再開
- **自動スキャンの throttle**: lastAttempt を先に保存（失敗でも再試行を抑制）
- **badge の `action` 依存**: Firefox は `action` キーが必要（`sidebar_action` だけでは不足）
