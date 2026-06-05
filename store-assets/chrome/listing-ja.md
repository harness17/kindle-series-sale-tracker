# Chrome Web Store Listing Draft

## Upload Package

- Zip: `dist/chrome/kindle-series-sale-tracker-chrome-v0.1.0.zip`
- Version: `0.1.0`

## Graphic Assets

- Store icon: `extension/icons/icon128.png`
- Screenshot 1: `store-assets/chrome/screenshots/01-options-list-1280x800.png`
- Screenshot 2: `store-assets/chrome/screenshots/02-side-panel-1280x800.png`
- Small promo tile: `store-assets/chrome/promo/small-promo-440x280.png`

## Basic Information

- Name: `Kindle Series Sale Tracker`
- Summary:

```text
Amazon.co.jpのKindle蔵書からシリーズ候補を抽出し、続刊・価格確認リストを作ります。
```

- Category: `Shopping`
- Language: `Japanese`
- Homepage URL: `https://github.com/harness17/kindle-series-sale-tracker`
- Support URL: `https://github.com/harness17/kindle-series-sale-tracker/issues`
- Privacy Policy URL: `https://github.com/harness17/kindle-series-sale-tracker/blob/main/PRIVACY.md`

## Detailed Description

```text
Kindle Series Sale Tracker は、Amazon.co.jp のKindle蔵書一覧からシリーズ候補を抽出し、続刊確認用のリストを作る拡張機能です。

できること:
- Amazon.co.jp のKindle蔵書一覧をユーザー操作でスキャン
- タイトルと著者からシリーズ候補を推定
- 所有巻レンジと欠番候補を表示
- Amazon検索結果から取れた場合だけ、続刊候補の価格・割引率・発売日・表紙を表示
- シリーズごとの優先表示、完結、除外フラグをローカル保存
- CSV / JSON でスキャン結果をエクスポート
- サイドパネルと専用ページで一覧を確認

データの扱い:
取得した蔵書データ、続刊チェック結果、設定はブラウザ内のローカルストレージに保存されます。開発者のサーバーへ送信しません。AmazonのCookie、ログイン情報、パスワードは保存しません。

注意:
この拡張機能はAmazon.co.jpの画面と内部応答に依存します。Amazon側の仕様変更により、取得や続刊チェックが動かなくなる場合があります。価格・割引率・発売日は検索結果から取得できた場合だけ表示します。
```

## Privacy Tab

### Single Purpose

```text
Amazon.co.jp のKindle蔵書一覧をユーザー操作で取得し、シリーズ別の所有巻・欠番・続刊候補・価格確認リストをローカルで整理すること。
```

### Permission Justifications

#### `storage`

```text
スキャン結果、続刊チェックのキャッシュ、テーマ設定、優先表示・完結・除外フラグをブラウザ内に保存するために使用します。
```

#### `activeTab`

```text
ユーザーが現在開いているAmazon.co.jpのKindle蔵書ページに対して、ユーザー操作でスキャン開始メッセージを送るために使用します。
```

#### `sidePanel`

```text
Kindleシリーズ候補と続刊チェック結果を、ページを閉じずに確認できるサイドパネルとして表示するために使用します。
```

#### `https://www.amazon.co.jp/*`

```text
Amazon.co.jpのKindle蔵書ページから蔵書一覧を取得し、Amazon.co.jp検索結果から続刊候補・価格・割引率を確認するために使用します。対象はこの拡張機能の表示機能に必要なAmazon.co.jp内のページに限定しています。
```

### Host Permission Justification

```text
This extension needs access to https://www.amazon.co.jp/* because its single purpose is to organize the user's Amazon.co.jp Kindle library and check follow-up volume candidates on Amazon.co.jp.

The content script runs only on the Kindle library URL pattern:
https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll*

The broader Amazon.co.jp host permission is used so the extension can, after an explicit user action, fetch Amazon.co.jp Kindle search result pages from the user's browser session to parse follow-up candidate titles, prices, discounts, release dates, thumbnails, and product URLs.

The extension does not request access to other websites. It does not collect or transmit Amazon credentials, cookies, or Kindle library data to the developer or any third-party server. Scan results and settings are stored locally in chrome.storage.local.
```

Japanese reference:

```text
この拡張機能は、Amazon.co.jp のKindle蔵書一覧を整理し、Amazon.co.jp上で続刊候補を確認することだけを目的としています。

content script は次のKindle蔵書URLにだけ自動挿入されます。
https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll*

host permission の https://www.amazon.co.jp/* は、ユーザー操作で続刊確認を行う際に、Amazon.co.jp の検索結果ページを取得し、候補タイトル、価格、割引率、発売日、サムネイル、商品URLを解析するために使用します。

他のWebサイトへのアクセス権限は要求していません。Amazonの認証情報、Cookie、Kindle蔵書データを開発者または第三者のサーバーへ送信しません。スキャン結果と設定は chrome.storage.local にローカル保存されます。
```

### Remote Code Usage

Select: `No`

```text
No. This extension does not execute remotely hosted code.

All JavaScript, HTML, CSS, and image assets used by the extension are bundled inside the submitted extension package. The extension does not load external scripts, does not inject remote script tags, does not use eval/new Function to execute fetched strings, and does not import code from a CDN or remote server.

The extension fetches Amazon.co.jp pages only as data, after user action, to parse Kindle library and search result content needed for the extension's single purpose. Fetched Amazon.co.jp HTML is parsed as document content and is not executed as code.
```

Japanese reference:

```text
いいえ。この拡張機能はリモートホストされたコードを実行しません。

拡張機能で使用する JavaScript / HTML / CSS / 画像は、すべて提出する拡張パッケージ内に同梱されています。外部scriptの読み込み、リモートscriptタグの挿入、fetchした文字列の eval/new Function 実行、CDNや外部サーバーからのコード import は行いません。

Amazon.co.jp へのfetchは、ユーザー操作後にKindle蔵書ページや検索結果ページをデータとして取得し、拡張機能の目的に必要な情報を解析するためだけに使います。取得したHTMLは文書データとして解析し、コードとして実行しません。
```

### Data Collection Disclosure

Suggested selections:

- Website content: Yes
- Authentication information: No
- Personally identifiable information: No
- Financial and payment information: No
- Health information: No
- Personal communications: No
- Location: No
- Web history: No, unless the dashboard classifies Amazon.co.jp page content access broadly as browsing activity. If asked, disclose that access is limited to Amazon.co.jp pages needed for the user-facing Kindle library and follow-up check features.

Certification text:

```text
The extension uses data only to provide its single purpose: organizing the user's Amazon.co.jp Kindle library and follow-up volume checks locally in the browser. It does not sell, share, or transmit user data to the developer or third parties.
```

## Distribution

- Visibility: start with `Unlisted` if you want a cautious first review, or `Public` if ready for search listing.
- Regions: Japan is the primary target. Use all regions only if you want broader availability despite Amazon.co.jp-only functionality.
- Pricing: Free.

## Test Instructions

```text
This extension is designed for Amazon.co.jp Kindle library users.

Review steps:
1. Install the extension.
2. Open https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/ while signed in to an Amazon.co.jp account that has Kindle books.
3. Click the extension action to open the side panel.
4. Click "Kindle一覧" if the library page is not already open.
5. On the Kindle library page, click "全件取得" or "簡易更新".
6. After the scan completes, open "専用ページ" or the side panel to view series candidates.
7. Click "再確認" or "新刊チェック（簡易）" to fetch Amazon.co.jp search results and show follow-up candidate information when available.

No test account is provided because the extension only works with the reviewer's own Amazon.co.jp browser session. The extension does not collect or transmit Amazon credentials.
```

## Notes For Reviewer

```text
Kindle Series Sale Tracker stores scan results only in chrome.storage.local. It does not operate a backend server and does not send Kindle library data to the developer.

The extension requests Amazon.co.jp host access because it must run on the Kindle library page and fetch Amazon.co.jp search results from the user's browser session. It does not request access to other websites.
```
