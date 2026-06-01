# Kindle 蔵書・カタログデータ契約

このメモは、拡張が Amazon の `GetContentOwnershipData` レスポンスと続刊チェック用の検索結果から何を取得し、ローカルに何を保存するかを整理する。

## 蔵書取得レスポンス

`GetContentOwnershipData` の1冊ごとに確認している主なフィールド:

- `title`: 書名。
- `authors`: 著者リスト、または著者文字列。
- `asin`: Kindle ASIN。
- `readStatus`: 既読状態。
- `acquiredTime`: ユーザーがその本を取得した時刻のタイムスタンプ。
- `acquiredDate`: 取得日。存在する場合だけ利用できる。
- `productImage`: 表紙画像URL。

このレスポンスでは確認できていないもの:

- 発行日。
- 発売日。
- 商品詳細ページURL。
- 価格。
- セール状態・割引率。

`acquiredTime` は発行日ではない。ユーザーが入手した日時なので、発売日・発行日として表示してはいけない。

## 正規化した書誌

`extension/shared/kindle-library.js` は、蔵書取得レスポンスの各 item をグルーピング用に正規化する。

- `title`
- `authors`
- `author`: 表示・集計用に第一著者だけへ正規化した文字列。
- `asin`
- `readStatus`
- `acquiredTime`
- `acquiredDate`
- `seriesKey`: タイトルから推定したシリーズ名。
- `volume`: タイトルから推定した巻数。
- `imprint`: タイトルから推定したレーベルまたは版の識別子。
- `thumbnailUrl`: `productImage` から正規化した表紙画像URL。

## 保存するスキャン結果

スキャン結果は `chrome.storage.local` の `kstLastScan` に保存する。

保存する `items` は容量対策のため最小化する。

- `asin`
- `seriesKey`
- `volume`
- `imprint`
- `author`

保存する `items` には、書名、著者配列、既読状態、取得日時、取得日、各本の画像URLを含めない。

保存する `series` は表示用のシリーズ要約。

- `key`
- `title`
- `seriesKey`
- `author`
- `imprint`
- `count`
- `ownedVolumes`
- `highestVolume`
- `nextVolume`
- `searchUrl`
- `latestOwnedThumbnailUrl`

`latestOwnedThumbnailUrl` はシリーズごとに1枚だけ保存する。保存対象は、画像URLが取れた中で最も巻数が大きい所有巻の表紙URL。これにより、全冊分の画像URLを保存せず、通常スキャン直後からサムネイルを表示できる。

## 続刊チェックで取得する検索結果データ

続刊チェックは、各シリーズの `searchUrl` に対して Amazon 検索結果HTMLを取得し、検索結果カードから情報を抽出する。

検索結果カードから抽出する候補データ:

- `asin`: 検索結果カードの `data-asin`。
- `title`: 検索結果タイトル。
- `url`: 商品ページへのリンク。
- `releaseDate`: 検索結果カードのテキストに `発売日` / `発行日` / `配信開始日` などがある場合に正規化した日付。
- `thumbnailUrl`: 検索結果カード内の `img.s-image` の `src`。
- `priceText`: 現在価格。例: `￥550`。
- `listPriceText`: 参考価格・過去価格など、取り消し線価格として取れた場合の価格。
- `discountRate`: 検索結果テキスト内の割引率、または `listPriceText` と `priceText` から計算できた割引率。

これらの候補から、同一シリーズ・同一版と判定できるものだけを対象にして、最高巻より先の最小巻を `next*`、検索結果内の最大巻を `latest*` として扱う。

## カタログキャッシュ

続刊チェック結果は `chrome.storage.local` の `kstCatalogCache` に保存する。シリーズごとのキャッシュは以下を持ち得る。

- `status`
- `nextVolume`
- `nextTitle`
- `nextUrl`
- `latestVolume`
- `latestTitle`
- `latestUrl`
- `latestReleaseDate`
- `latestThumbnailUrl`
- `latestPriceText`
- `latestListPriceText`
- `latestDiscountRate`
- `checkedAt`

発売日・発行日、価格、割引率は、検索結果DOMから取れた場合だけ表示できる。蔵書スキャンだけでは埋められない。

## 欠番判定ルール

欠番は、通常 `1巻` から最高所有巻までの間で所有していない巻として計算する。たとえば所有巻が `[2]` の場合、`1巻` は欠番扱いにする。

`0巻` は例外。`0巻` を所有している場合は追加の開始巻として扱うが、`0巻` を所有していないこと自体は欠番にしない。たとえば所有巻 `[0, 2, 3]` は欠番 `[1]` になる。
