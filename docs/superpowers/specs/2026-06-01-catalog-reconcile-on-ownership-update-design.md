# 所持更新時の続刊情報リコンサイル — 設計

- 日付: 2026-06-01
- 対象ブランチ: feature/storage-lite-and-scan-modes
- 状態: ユーザー承認済み（設計）

## 背景と問題

拡張は所持情報と続刊情報を別ストアで持つ。

- **所持情報** = `scan`（`api.STORAGE_KEY`）。各シリーズの `ownedVolumes` / `highestVolume`。全件取得・簡易更新で書き換わる。
- **続刊情報** = `cache`（`kstCatalogCache`）。`seriesKey → { status, nextVolume, latestVolume, … checkedAt }`。続刊チェックで書き換わる。

`cache` の `status:'has-next'` と `nextVolume` は、**照会した時点の `highestVolume` を基準に確定された値**である。

ユーザーの実フロー「続刊チェック → 続刊を買う → 簡易更新 → 専用ページを更新」では次が起きる。

1. 続刊チェックで `cache[key] = { status:'has-next', nextVolume:7, latestVolume:… }`。
2. 7巻を購入。
3. 簡易更新で `highestVolume` が 7 に上がる。
4. しかし `cache` は再評価されず、`has-next / nextVolume=7`（既に所持している巻）が残り続ける。

## 根本原因の切り分け（確定）

`content.js` の simple モードは `collectRecentBooks` → `api.mergeScan(existingMinimal, newBooks)` → `summarizeNormalizedBooks` で series を再計算する。最近購入した巻は取得日降順の先頭に来るため未知 ASIN として確実に拾われ、`highestVolume` は正しく更新される。

したがって原因は **(a) 所持は更新されるが `cache` が新 `highestVolume` に対して再評価されない** で確定。「スキャンが新刊を取り込んでいない(b)」ではない。表示時リコンサイルで解決できる。

## 方針

所持更新時に、**通信なし**で `cache` を新 `highestVolume` に対して再評価する。`cache` には照会時の `latestVolume`（カタログ上で見つかった最大巻）が保存済みのため、ネットワークなしで判定できる。

書き戻しはしない（表示時導出）。`cache` の生データを温存し、`highestVolume` が変わるたび開くだけで正しく再判定される。明示トリガーは不要で、簡易更新後に専用ページ／ポップアップを開けば自動反映される。

## 中核: `series-card.js` の純関数 `reconcileCatalog`

```
reconcileCatalog(cached, highestVolume):
  ① cached が has-next 以外 / highestVolume が有限でない → cached をそのまま返す
  ② highestVolume < nextVolume                        → cached をそのまま返す（まだ次巻未所持）
  ③ highestVolume >= latestVolume                     → { …cached, status:'no-next', reconciled:'owned-to-latest' }（降格）
  ④ nextVolume <= highestVolume < latestVolume         → { …cached, stale:true, reconciled:'stale' }（要再確認、status は has-next 維持）
  ⑤ latestVolume が欠落した旧エントリ                  → latestVolume = nextVolume とみなして判定（安全側＝買えば③で降格）
```

純関数。Node（`require`）とブラウザの両方で読める既存の UMD 構成を保つ。

## リコンサイル適用は1箇所に集約

二重参照によるガードの食い違い（ボタンは押せるのにハンドラが弾く等）を防ぐため、各画面で1回だけ reconcile 済みビューを作り、下流は全てそれを参照する。

- **options.js**: `currentList` または `render` で `cache[s.key]` を1回 reconcile し、各行に持たせる。`rowEl`・`passesFilter`（続刊状態フィルタ）・完結ボタンの disable（現状 `:193`）・`toggleCompleted` ガード（現状 `:276`）・`simpleTargets`・`fullTargets` はすべてその reconcile 済みステータスを参照する。
- **popup.js**: `getLastScan`（現状 `:57` の `catalog: cache[s.key] || null`）で `catalog: reconcileCatalog(cache[s.key], group.highestVolume)` を1回適用する。`render`・`simpleTargets` 等の下流は揃う。

## 表示ルール

- **③ 降格 no-next** → 「続刊なし」バッジ（既存どおり）。
- **④ stale** → 「要再確認」バッジ ＋ 最新N巻を表示する。買った巻（next）の価格/割引/サムネは所持済みのため出さない。`resolvePrimaryOffer` は `stale` のとき `null` を返す（割引ソート・サムネ選択から除外される）。
- `renderStatusBlock` は reconcile 済みのオブジェクトを受け取り、`stale` 分岐を追加する。

## 完結ボタン

- **無効のまま**: 確定 has-next（②変化なし）＋ **stale**（④）。stale は `latestVolume` という未所持の上位巻の存在が確定しているため、続刊あり確定と同じ扱いで完結禁止（コミット `bbed7b6` の趣旨どおり）。
- **許可**: 降格 no-next（③）・未照会・判定不能。

## 新刊チェック（簡易 / simpleTargets）

確定 has-next（②）**のみ**除外。**stale（④）・降格 no-next（③）・未照会は対象に含める**。要再確認の解消と、照会後に出た新刊の取りこぼし回収を兼ねる。

## 既知の限界

通信なし reconcile は照会時点の `latestVolume` を基準にする。照会後に新刊が出ている場合、降格 no-next 判定では一時的にそれを取りこぼし得る。ただし降格 no-next は新刊チェック（簡易）の対象に含まれるため、再チェックで回収される。これは no-network を選択した結果の許容済みトレードオフ。

## 検証

`verify-catalog-probe.mjs` に `reconcileCatalog` の単体テストを追加する。

- 変化なし: `highestVolume < nextVolume` で cached が不変
- 降格: `highestVolume >= latestVolume` で `status:'no-next'`
- 要再確認: `nextVolume <= highestVolume < latestVolume` で `stale:true`、`status` は has-next 維持
- latestVolume 欠落の旧エントリ: `latestVolume=nextVolume` 相当の判定
- has-next 以外（no-next / unknown / null）: そのまま返す

加えて `extension/` を変更するため、最終応答前に `scripts/build-dev.ps1 -Target all` で `dist/dev` を最新化する。

## 変更見込みファイル

- `extension/shared/series-card.js`（`reconcileCatalog` 追加、`resolvePrimaryOffer`/`renderStatusBlock` の stale 対応）
- `extension/options/options.js`（reconcile 集約適用）
- `extension/popup/popup.js`（reconcile 集約適用）
- `extension/options/options.css` / `extension/popup`（「要再確認」バッジのスタイル少量）
- `verify-catalog-probe.mjs`（単体テスト追加）
