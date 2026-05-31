# Kindle Series Tracker — 専用ページ＋続刊検出 設計

- 日付: 2026-05-29
- 対象: `kindle-series-sale-tracker`
- 作成: Claude Code（ユーザー合意済み）

## 背景・目的

ポップアップは上位80件しか表示できず、所有巻の少ないシリーズ（例: ゾンビ屋れい子 11冊）が埋もれる。
ユーザーが本当に欲しいのは「**続きを買うべきシリーズ**」の一覧。すなわち:

1. 全シリーズを専用ページで一覧・検索・全巻表示したい
2. 所有レンジ内の**欠番**（例: 1-3,5-6 → 4が抜け）を購入候補として出したい
3. **完結して新刊が無いシリーズは除外**し、続刊が存在するものだけ出したい

調査結果（実データ確認済み）: Amazon の `GetContentOwnershipData` には**シリーズ/カタログ情報が無い**（seriesId・全巻数・次巻ASINなし）。
したがって「最高巻より先の続刊が存在するか」は Amazon カタログを**シリーズ単位で照会**しないと分からない。
4773シリーズの一括照会は throttle/時間的に非現実的なため、**オンデマンド照会**とする。

## 方針（ユーザー選択）

- 表示形態: 拡張の **options_page**（専用HTML）
- 続刊判定: **オンデマンド照会**（見たシリーズだけ Amazon を1回照会、結果はキャッシュ）
- フェーズ1（権限変更なし）とフェーズ2（要 host_permissions）を両方実装する

## 非目標（YAGNI）

- 全シリーズの一括バックグラウンド照会
- 価格・セール情報の取得（将来）
- 紙/Audible/Kindle Unlimited 横断

---

## アーキテクチャ

```
options/options.html + options.js   … 専用ページ（一覧・検索・ソート・フィルタ・照会ボタン）
shared/kindle-library.js            … 既存SSOT。欠番計算・レンジ整形の純関数を追加
shared/catalog-probe.js (新規)      … 検索結果HTMLから続刊有無を判定する純パーサ（fixture駆動）
content/ background                 … 既存の取得は不変
chrome.storage.local
  kstLastScan                       … 既存（series, items, totalItems）
  kstCatalogCache (新規)            … { [seriesKey]: { checkedAt, hasNext, nextTitle, nextUrl } }
```

データフロー:
1. options ページ起動 → `kstLastScan.series` を読み、欠番・レンジを算出して全件描画。
2. ユーザーが「次巻を確認」押下 → options ページが Amazon 検索を1回 fetch（host_permissions）→ `catalog-probe` で解析 → 結果をキャッシュ＆表示。
3. フィルタ「続刊ありのみ」「欠番ありのみ」で絞り込み。

---

## フェーズ1: 専用ページ＋欠番検出（権限変更なし）

### shared/kindle-library.js に純関数を追加
- `computeOwnedRanges(volumes) → [[1,3],[5,6]]`（連番をレンジ化）
- `computeMissingVolumes(volumes) → [4]`（1巻〜最高巻の間の抜け。最高巻より先は含めない。0巻を所有しているシリーズでは0巻を例外として扱う）
- 純関数は `shared/kindle-library.js` に置いて export（テスト可能）。**呼び出しは options.js 側**で、既存の `series[].ownedVolumes`（保存済み）から算出する。
  - → `buildSeriesSummary` は変更せず、**再スキャン不要**で新ページが動く（既存スキャン結果をそのまま使える）。

### options ページ
- manifest に `"options_page": "options/options.html"` を追加（権限不要）。
- `kstLastScan.series` 全件を描画（80件制限なし）。各行: タイトル / 著者 / 所有レンジ / 欠番（赤バッジ）/ 次候補 / 「次巻を確認」ボタン / 検索リンク。
- 上部: 検索ボックス（タイトル絞り込み）、ソート（冊数・最高巻・タイトル）、フィルタ（欠番ありのみ）。
- 仮想化はせず、まず全件描画（4773件）。重ければ後でページング。

### テスト（verify-kindle-library.mjs 追記）
- `[1,2,3,5,6]` → ranges `[[1,3],[5,6]]` / missing `[4]`
- `[1,2,3]` → ranges `[[1,3]]` / missing `[]`
- `[5]`（単巻）→ ranges `[[5,5]]` / missing `[]`
- `[2,4,6]` → missing `[3,5]`

---

## フェーズ2: オンデマンド続刊照会（要 host_permissions）

### manifest 変更（⚠ 権限拡張・ユーザー承認済み）
- `"host_permissions": ["https://www.amazon.co.jp/*"]` を追加。
- options ページから amazon.co.jp へ credentialed cross-origin fetch するため。

### catalog-probe（fixture駆動・壊れやすい前提）
- インターフェース: `detectNextVolume(html, { title, highestVolume }) → { hasNext, nextTitle, nextUrl } | { status:'unknown' }`
- 入力HTML = Amazon 検索結果（`searchUrl` に巻数を絡めたクエリ）。結果から「最高巻+1以降に該当する商品」を検出。
- **実装の最初のタスク = ユーザーが実検索結果HTMLを DevTools で採取 → `fixtures/catalog-*.html` 保存 → パーサをそれに対して作る**（この拡張の既存方式）。
- 照会は options 側で `fetch(searchUrl, {credentials:'include'})` → `detectNextVolume` に渡す。
- 結果を `kstCatalogCache[seriesKey]` にキャッシュ（再訪時は再照会しない／手動再チェックボタンは将来）。

### フィルタ「続刊ありのみ」
- キャッシュ済みで `hasNext=true` のシリーズだけ表示。未照会は別扱い（「未確認」）。

### テスト
- `verify-catalog-probe.mjs`: 採取fixtureに対し、続刊あり/なし/判定不能を検証。

---

## 完成条件（スプリントコントラクト）

- 正常系1: options ページで全シリーズ（4773件）が表示され、検索・ソートできる。
- 正常系2: 所有 `[1,2,3,5,6]` のシリーズが「所有 1-3, 5-6 / 欠番 4」と表示される。
- 正常系3: 「次巻を確認」で1シリーズだけ照会し、続刊があれば購入リンク、無ければ「続刊なし（完結/最新所有）」と表示。再訪時はキャッシュから即表示（再照会しない）。
- フィルタ: 「欠番ありのみ」「続刊ありのみ（照会済み）」で絞り込める。
- 権限: host_permissions は amazon.co.jp のみ。過剰権限なし。
- 異常系: 照会失敗（throttle/HTML変化）時は「判定不能」を表示し、ページ全体は壊れない。
- 副作用: 既存の `verify-kindle-library.mjs` が引き続き pass。content/popup の既存取得は不変。

## リスク・オープン事項

- catalog-probe は Amazon 検索HTMLに依存し壊れやすい → fixture＋verify で回帰を担保。実HTML採取が前提。
- 4773件の全件DOM描画のパフォーマンス → まず素朴に描画、重ければページング/簡易仮想化を後追い。
- 検索結果から「同一シリーズの次巻」を誤検出する可能性（別シリーズ/別版）→ タイトル一致と巻数一致のヒューリスティクスを fixture で詰める。
- options ページからの照会は host_permissions が前提。Chrome 再読込時に権限再承認が要る場合あり。
