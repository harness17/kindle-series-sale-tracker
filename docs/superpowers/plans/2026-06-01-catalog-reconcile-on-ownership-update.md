# 所持更新時の続刊情報リコンサイル Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 続刊購入→簡易更新後に、古い続刊情報（has-next）が新しい `highestVolume` に対して通信なしで再評価され、所持済みの巻が続刊として残らないようにする。

**Architecture:** `series-card.js` に純関数 `reconcileCatalog(cached, highestVolume)` を追加し、`cache` 生データを書き換えず表示時に導出する。各画面（options / popup）で1回だけ reconcile 済みビューを作り、フィルタ・ボタン・チェック対象はすべてそれを参照する。

**Tech Stack:** 素の JavaScript（UMD モジュール）、Manifest V3 Chrome 拡張、Node ベースの `verify-*.mjs` 検証。

設計の根拠は [docs/superpowers/specs/2026-06-01-catalog-reconcile-on-ownership-update-design.md](../specs/2026-06-01-catalog-reconcile-on-ownership-update-design.md) を参照。

---

## File Structure

- `extension/shared/series-card.js` — 中核。`reconcileCatalog` / `isConfirmedHasNext` を追加し、`resolvePrimaryOffer` と `renderStatusBlock` を stale 対応にする。UMD で Node とブラウザ両対応を維持。
- `verify-catalog-probe.mjs` — `reconcileCatalog` / `isConfirmedHasNext` の単体テストを追加。
- `extension/options/options.js` — reconcile 済みビューを1箇所で生成し、全参照をそれ経由にする。
- `extension/popup/popup.js` — `getLastScan` で reconcile を1回適用する。
- `extension/options/options.css` / `extension/popup/popup.css` — 「要再確認」バッジのスタイルを追加。

---

## Task 1: `reconcileCatalog` 純関数と単体テスト

**Files:**
- Modify: `extension/shared/series-card.js`（`return { … }` に関数を追加）
- Test: `verify-catalog-probe.mjs`

- [ ] **Step 1: 失敗するテストを書く**

`verify-catalog-probe.mjs` の冒頭 import を次のように変更し（`series-card.js` を追加）、

```js
const {
  detectNextVolume,
  extractSearchResultOffer,
  normalizePublicationDate,
} = require('./extension/shared/catalog-probe.js');
const { reconcileCatalog, isConfirmedHasNext } = require('./extension/shared/series-card.js');
```

`checks` 配列の末尾（`];` の直前）に次のテストを追加する。

```js
  // --- reconcileCatalog: 所持更新時の続刊情報リコンサイル ---
  {
    name: 'reconcile: 次巻未所持なら変化なし（highestVolume < nextVolume）',
    ok: (() => {
      const cached = { status: 'has-next', nextVolume: 7, latestVolume: 10 };
      const r = reconcileCatalog(cached, 6);
      return r === cached;
    })(),
  },
  {
    name: 'reconcile: カタログ最大巻まで所持で続刊なしへ降格（highestVolume >= latestVolume）',
    ok: (() => {
      const r = reconcileCatalog({ status: 'has-next', nextVolume: 7, latestVolume: 7 }, 7);
      return r.status === 'no-next' && r.reconciled === 'owned-to-latest' && !r.stale;
    })(),
  },
  {
    name: 'reconcile: 買った巻と最新巻の間に未知巻が残れば要再確認（nextVolume <= highestVolume < latestVolume）',
    ok: (() => {
      const r = reconcileCatalog({ status: 'has-next', nextVolume: 7, latestVolume: 10 }, 7);
      return r.status === 'has-next' && r.stale === true && r.reconciled === 'stale';
    })(),
  },
  {
    name: 'reconcile: latestVolume 欠落の旧エントリは nextVolume 相当で降格扱い',
    ok: (() => {
      const r = reconcileCatalog({ status: 'has-next', nextVolume: 7 }, 7);
      return r.status === 'no-next' && r.reconciled === 'owned-to-latest';
    })(),
  },
  {
    name: 'reconcile: has-next 以外（no-next / null）はそのまま返す',
    ok: (() => {
      const noNext = { status: 'no-next', latestVolume: 5 };
      return reconcileCatalog(noNext, 99) === noNext && reconcileCatalog(null, 99) === null;
    })(),
  },
  {
    name: 'reconcile: highestVolume 不明なら変化なし',
    ok: (() => {
      const cached = { status: 'has-next', nextVolume: 7, latestVolume: 10 };
      return reconcileCatalog(cached, undefined) === cached && reconcileCatalog(cached, NaN) === cached;
    })(),
  },
  {
    name: 'isConfirmedHasNext: 確定 has-next は true、stale / no-next / null は false',
    ok:
      isConfirmedHasNext({ status: 'has-next' }) === true &&
      isConfirmedHasNext({ status: 'has-next', stale: true }) === false &&
      isConfirmedHasNext({ status: 'no-next' }) === false &&
      isConfirmedHasNext(null) === false,
  },
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `node .\verify-catalog-probe.mjs`
Expected: FAIL（`reconcileCatalog is not a function` 系のエラー、または追加テストが ✗）

- [ ] **Step 3: 最小実装を書く**

`extension/shared/series-card.js` に次の2関数を追加する（`return { … };` の前に定義）。

```js
  // 所持更新後、照会時点を基準に確定した続刊情報を新しい highestVolume で再評価する。
  // 書き戻さず表示時に導出する純関数。cache の生データ（latestVolume 等）は変更しない。
  //   ① has-next 以外 / highestVolume 不明        → cached をそのまま返す
  //   ② highestVolume < nextVolume               → cached をそのまま返す（次巻未所持）
  //   ③ highestVolume >= latestVolume            → no-next へ降格
  //   ④ nextVolume <= highestVolume < latestVolume → stale（要再確認、status は has-next 維持）
  //   ⑤ latestVolume 欠落の旧エントリ             → latestVolume=nextVolume とみなす（安全側=③で降格）
  function reconcileCatalog(cached, highestVolume) {
    if (!cached || cached.status !== 'has-next') return cached;
    if (!Number.isFinite(highestVolume)) return cached;
    const next = cached.nextVolume;
    if (!Number.isFinite(next)) return cached;
    if (highestVolume < next) return cached;
    const latest = Number.isFinite(cached.latestVolume) ? cached.latestVolume : next;
    if (highestVolume >= latest) {
      return { ...cached, status: 'no-next', reconciled: 'owned-to-latest' };
    }
    return { ...cached, stale: true, reconciled: 'stale' };
  }

  // 「続刊あり確定」= 完結禁止・新刊チェック除外の対象。stale は確定扱いしない。
  function isConfirmedHasNext(cached) {
    return !!cached && cached.status === 'has-next' && !cached.stale;
  }
```

`return { … };` のオブジェクトに `reconcileCatalog,` と `isConfirmedHasNext,` を追記する（アルファベット順の既存配置に合わせる）。

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `node .\verify-catalog-probe.mjs`
Expected: PASS（全 ✓、終了コード 0）

- [ ] **Step 5: コミット**

```bash
git add extension/shared/series-card.js verify-catalog-probe.mjs
git commit -m "feat: reconcileCatalog で所持更新時の続刊情報を通信なし再評価"
```

---

## Task 2: `resolvePrimaryOffer` / `renderStatusBlock` の stale 対応

**Files:**
- Modify: `extension/shared/series-card.js:25-43`（`resolvePrimaryOffer`）、`:57-108`（`renderStatusBlock`）

stale はブラウザ DOM が絡むため Node 単体テストの対象外。Task 6 の実動確認でカバーする。ここではコードの正確性をレビューで担保する。

- [ ] **Step 1: `resolvePrimaryOffer` を stale で null にする**

`extension/shared/series-card.js` の `resolvePrimaryOffer` 先頭を変更する。

変更前:
```js
  function resolvePrimaryOffer(cached) {
    if (!cached || cached.status !== 'has-next') return null;
```
変更後:
```js
  function resolvePrimaryOffer(cached) {
    // stale（要再確認）は next 巻を既に所持しているため、購入オファーとして出さない。
    if (!cached || cached.status !== 'has-next' || cached.stale) return null;
```

- [ ] **Step 2: `renderStatusBlock` に stale 分岐を追加する**

`renderStatusBlock` のステータスバッジ分岐（`if (!cached) { … } else if (cached.status === 'has-next') { … }`）の最初に stale 分岐を足す。

変更前:
```js
    appendSpace(targetEl);
    if (!cached) {
      appendBadge(targetEl, 'badge', '未照会');
    } else if (cached.status === 'has-next') {
```
変更後:
```js
    appendSpace(targetEl);
    if (!cached) {
      appendBadge(targetEl, 'badge', '未照会');
    } else if (cached.stale) {
      appendBadge(targetEl, 'badge recheck', '要再確認');
    } else if (cached.status === 'has-next') {
```

- [ ] **Step 3: stale で最新巻バッジを表示する**

末尾の `showLatest` 判定を、stale でも最新巻を出すよう変更する。

変更前:
```js
    const showLatest =
      cached &&
      cached.status === 'has-next' &&
      cached.latestVolume &&
      offer &&
      cached.latestVolume !== offer.volume;
```
変更後:
```js
    const showLatest =
      cached &&
      cached.latestVolume &&
      (cached.stale || (cached.status === 'has-next' && offer && cached.latestVolume !== offer.volume));
```

- [ ] **Step 4: 既存の Node テストが壊れていないことを確認する**

Run: `node .\verify-catalog-probe.mjs`
Expected: PASS（全 ✓）。`renderStatusBlock` は Node で呼ばないため回帰しない確認。

- [ ] **Step 5: コミット**

```bash
git add extension/shared/series-card.js
git commit -m "feat: 要再確認(stale)の表示とオファー抑制を series-card に追加"
```

---

## Task 3: options.js に reconcile を集約適用

**Files:**
- Modify: `extension/options/options.js`（`sortSeries`/`passesFilter`/`rowEl`/`toggleCompleted`/`simpleTargets`）

reconcile 済みビューを返すヘルパーを1つ作り、`cache[s.key]` の直接参照をすべて置き換える。これで disable ガード（`:193`）とハンドラ（`:276`）の食い違いを防ぐ。

- [ ] **Step 1: ヘルパー `catalogFor` を追加する**

`function passesFilter(s) {` の直前に追加する。

```js
  // 表示・判定はすべて reconcile 済みビューを通す（生 cache を直接参照しない）。
  function catalogFor(s) {
    return card.reconcileCatalog(cache[s.key], s.highestVolume);
  }
```

- [ ] **Step 2: `passesFilter` の続刊状態フィルタを reconcile 経由にする**

変更前（`:82-89` 付近）:
```js
    const status = els.filterStatus.value;
    if (status !== 'all') {
      if (completed[s.key]) return false;
      const cached = cache[s.key];
      if (status === 'has-next' && cached?.status !== 'has-next') return false;
      if (status === 'no-next' && cached?.status !== 'no-next') return false;
      if (status === 'unchecked' && cached) return false;
    }
```
変更後:
```js
    const status = els.filterStatus.value;
    if (status !== 'all') {
      if (completed[s.key]) return false;
      const cached = catalogFor(s);
      if (status === 'has-next' && cached?.status !== 'has-next') return false;
      if (status === 'no-next' && cached?.status !== 'no-next') return false;
      if (status === 'unchecked' && cached) return false;
    }
```

- [ ] **Step 3: `sortSeries` の割引ソートを reconcile 経由にする**

変更前（`:99-103` 付近）:
```js
      if (by === 'discount') {
        const d = card.discountValue(cache[b.key]) - card.discountValue(cache[a.key]);
```
変更後:
```js
      if (by === 'discount') {
        const d = card.discountValue(catalogFor(b)) - card.discountValue(catalogFor(a));
```

- [ ] **Step 4: `rowEl` の cached を reconcile 経由にし、完結ボタン disable を揃える**

変更前（`:153`）:
```js
    const cached = cache[s.key];
```
変更後:
```js
    const cached = catalogFor(s);
```

`checkBtn` のラベル（`:183`）を reconcile 済み `cached` 基準に変更する。

変更前:
```js
    checkBtn.textContent = cache[s.key] ? iconLabel('↻', '再確認') : iconLabel('↻', '次巻を確認');
```
変更後:
```js
    checkBtn.textContent = cached ? iconLabel('↻', '再確認') : iconLabel('↻', '次巻を確認');
```

完結ボタン disable（`:193`）を reconcile 済み `cached` 基準に変更する（stale も has-next を維持するので完結禁止のまま）。

変更前:
```js
    if (!completed[s.key] && cache[s.key]?.status === 'has-next') {
```
変更後:
```js
    if (!completed[s.key] && cached?.status === 'has-next') {
```

- [ ] **Step 5: `toggleCompleted` のガードを reconcile 経由にする**

変更前（`:276`）:
```js
    if (!completed[s.key] && cache[s.key]?.status === 'has-next') return;
```
変更後:
```js
    if (!completed[s.key] && catalogFor(s)?.status === 'has-next') return;
```

- [ ] **Step 6: `simpleTargets` を「確定 has-next のみ除外」に変更する（stale を含める）**

変更前（`:310-312`）:
```js
  function simpleTargets() {
    return currentList().filter((s) => !completed[s.key] && !excluded[s.key] && cache[s.key]?.status !== 'has-next');
  }
```
変更後:
```js
  function simpleTargets() {
    // 確定 has-next（未所持の次巻あり）だけ除外。stale（要再確認）・降格 no-next・未照会は含める。
    return currentList().filter(
      (s) => !completed[s.key] && !excluded[s.key] && !card.isConfirmedHasNext(catalogFor(s))
    );
  }
```

- [ ] **Step 7: Node テストが壊れていないことを確認する**

Run: `node .\verify-catalog-probe.mjs`
Expected: PASS（options.js は Node で読まないが、series-card.js の API 変更が回帰していないことの確認）

- [ ] **Step 8: コミット**

```bash
git add extension/options/options.js
git commit -m "feat: 専用ページで続刊情報を所持更新に合わせ再評価"
```

---

## Task 4: popup.js に reconcile を適用

**Files:**
- Modify: `extension/popup/popup.js:51-59`（`getLastScan`）、`:200-204`（`simpleTargets`）

- [ ] **Step 1: `getLastScan` で catalog を reconcile 済みにする**

変更前（`:54-59`）:
```js
        .map((s) => ({
          ...s,
          title: api.decodeHtmlEntities(s.title),
          catalog: cache[s.key] || null,
          priority: !!priority[s.key],
        }));
```
変更後:
```js
        .map((s) => ({
          ...s,
          title: api.decodeHtmlEntities(s.title),
          catalog: card.reconcileCatalog(cache[s.key] || null, s.highestVolume),
          priority: !!priority[s.key],
        }));
```

- [ ] **Step 2: `simpleTargets` を「確定 has-next のみ除外」に変更する**

変更前（`:200-204`）:
```js
  function simpleTargets() {
    return displayedGroups(currentScan).filter(
      (group) => Number.isFinite(group.highestVolume) && group.catalog?.status !== 'has-next'
    );
  }
```
変更後:
```js
  function simpleTargets() {
    // group.catalog は getLastScan で reconcile 済み。確定 has-next のみ除外し stale は含める。
    return displayedGroups(currentScan).filter(
      (group) => Number.isFinite(group.highestVolume) && !card.isConfirmedHasNext(group.catalog)
    );
  }
```

- [ ] **Step 3: Node テストが壊れていないことを確認する**

Run: `node .\verify-catalog-probe.mjs`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add extension/popup/popup.js
git commit -m "feat: ポップアップで続刊情報を所持更新に合わせ再評価"
```

---

## Task 5: 「要再確認」バッジのスタイル

**Files:**
- Modify: `extension/options/options.css`（`.badge.missing` ブロックの近く、`:309` 付近）
- Modify: `extension/popup/popup.css`（`.badge.missing` ブロックの近く、`:252` 付近）

- [ ] **Step 1: options.css にバッジスタイルを追加する**

`.badge.missing { … }` ブロックの直後に追加する（注意喚起色として既存の `--warn` を流用）。

```css
.badge.recheck {
  background: var(--badge-missing-bg);
  color: var(--warn);
  font-weight: 700;
}
```

- [ ] **Step 2: popup.css にバッジスタイルを追加する**

`.badge.missing { … }` ブロックの直後に追加する。

```css
.badge.recheck {
  background: var(--badge-missing-bg);
  color: var(--warn);
  font-weight: 700;
}
```

- [ ] **Step 3: コミット**

```bash
git add extension/options/options.css extension/popup/popup.css
git commit -m "style: 要再確認バッジのスタイルを追加"
```

---

## Task 6: dev ビルド更新と実動確認

**Files:**
- なし（ビルド成果物 `dist/dev` は Git 管理外）

- [ ] **Step 1: dev ロード先を最新化する**

Run: `.\scripts\build-dev.ps1 -Target all`
Expected: `dist/dev/chrome` と `dist/dev/firefox` に `extension/*` + manifest が反映される。

- [ ] **Step 2: 全 Node 検証を流す**

Run:
```
node .\verify-kindle-library.mjs
node .\verify-catalog-probe.mjs
```
Expected: 両方 PASS（終了コード 0）。

- [ ] **Step 3: 実動確認（手動）**

`chrome://extensions/` で `dist/dev/chrome` を読み込み（既読込なら 🔄 再読み込み）。Amazon Kindle 蔵書ページを開き、次を確認する。

- 続刊あり（has-next）のシリーズで「続刊あり N巻」が出ている状態を用意する（既存 cache で可）。
- そのシリーズの最高巻を上回るよう所持を更新できない場合は、`reconcileCatalog` の挙動を専用ページのフィルタ／バッジで確認する：所持済み巻が cache の latestVolume 以上なら「続刊なし」、間に未知巻が残るなら「要再確認」バッジが出る。
- 「完結にする」ボタン：要再確認・確定 has-next では無効、降格「続刊なし」では有効になる。
- 「新刊チェック（簡易）」：要再確認・続刊なし・未照会が対象に含まれ、確定 has-next は除外される。

実機で所持更新→再評価の一連が確認できない観点は、確認できた範囲と理由を最終報告に明記する（Amazon ログイン必須ページのため agent-browser では検証不可、ユーザー実機確認に委ねる）。

- [ ] **Step 4: handoff を更新する**

`CLAUDE_CODE_HANDOFF.md`（無ければ作成）に、本実装の対象・完成条件・セルフ verify 結果・未検証観点を追記する。

---

## Self-Review

- **Spec coverage:** 純関数（Task1）、stale 表示/オファー抑制（Task2）、options 集約（Task3）、popup 適用（Task4）、バッジ（Task5）、検証/ビルド/実動（Task6）。spec の各節に対応タスクあり。既知の限界は spec に明記済み（コード変更不要）。
- **Placeholder scan:** 各コード手順に実コードあり。TBD/TODO なし。
- **Type consistency:** `reconcileCatalog` / `isConfirmedHasNext` の名称・引数（`cached, highestVolume` / `cached`）は Task1 定義と Task3/4 呼び出しで一致。`card.reconcileCatalog` / `card.isConfirmedHasNext` / `card.discountValue` は `window.__KST_CARD__` 経由で一致。stale / reconciled / status の値（`'no-next'` / `'has-next'` / `'stale'` / `'owned-to-latest'`）も一貫。
