# Firefox Add-ons Listing — English

## Upload Package

- Zip: `dist/firefox/kindle-series-sale-tracker-firefox-v0.2.0.zip`
- Version: `0.2.0`
- Extension ID: `kindle-series-sale-tracker@harness`

## Graphic Assets

- Icon: `extension/icons/icon128.png`
- Screenshot 1 (Japanese UI): `store-assets/firefox/screenshots/01-options-list-1280x800.png`
- Screenshot 2 (Japanese UI): `store-assets/firefox/screenshots/02-side-panel-1280x800.png`
- Screenshot 1 (English UI): `store-assets/firefox/screenshots/en/01-options-list-1280x800.png` *(take after switching language toggle to EN)*
- Screenshot 2 (English UI): `store-assets/firefox/screenshots/en/02-side-panel-1280x800.png` *(take after switching language toggle to EN)*

## Basic Information

- Name: `Kindle Series Sale Tracker`
- Summary (≤250 chars):

```text
Track your Amazon.co.jp Kindle series — check next volumes, prices, discounts, and estimate completion costs. All data stays in your browser. No server required.
```

- Category: `Shopping`
- Language: `English`
- Homepage: `https://github.com/harness17/kindle-series-sale-tracker`
- Support site: `https://github.com/harness17/kindle-series-sale-tracker/issues`
- Privacy Policy: `https://github.com/harness17/kindle-series-sale-tracker/blob/main/PRIVACY.md`
- License: `MIT License`

## Description

```text
Kindle Series Sale Tracker helps you organize your Amazon.co.jp Kindle library by series. Identify owned volumes, check for follow-up releases, and see prices and discounts — all locally in your browser.

Features:
• Scan your Kindle library from the Amazon.co.jp digital console with one click
• Automatically detect series and estimate owned volume ranges
• Check next-volume availability with price, discount rate, and release date
• Estimate the total cost to complete an unfinished series
• Mark series as completed, priority, or excluded
• Export your series list as CSV or JSON
• Firefox sidebar panel and dedicated options page
• Japanese / English UI toggle

Privacy:
All scan results and settings are stored locally in your browser. No data is sent to any external server. Amazon credentials, cookies, and purchase history are never stored or transmitted.

Note:
This extension depends on Amazon.co.jp page structure. Changes on Amazon's side may affect library scanning or follow-up checks. Prices, discounts, and release dates are shown only when retrievable from Amazon.co.jp search results.

This extension is designed for Amazon.co.jp (Japanese Kindle store) only.
```

## Version Notes (0.2.0)

```text
Version 0.2.0

New in this version:
- Japanese / English UI toggle
- Series completion cost estimate
- Improved next-volume detection for long series (gap detection + supplemental search + pagination)
- Firefox sidebar support
- MIT License and Privacy Policy

Initial features:
- Amazon.co.jp Kindle library manual scan
- Series candidates, owned volume ranges, gap detection
- Follow-up volume, price, discount rate, release date check
- CSV / JSON export
```

## Data Collection / Privacy

Manifest setting:

```json
"data_collection_permissions": {
  "required": ["none"]
}
```

Explanation:

```text
This extension does not collect or transmit any personal data to the developer or any third-party server.

Amazon.co.jp Kindle library and search result page content is read and parsed locally in the user's browser to provide the extension's features. Scan results, follow-up check results, and settings are saved in browser extension storage (localStorage/IndexedDB equivalent).

Amazon credentials, cookies, and passwords are never stored or transmitted.
```

## Permission Justifications

### `storage`

```text
Used to save scan results, follow-up check cache, theme settings, and per-series flags (priority, completed, excluded) locally in the browser.
```

### `activeTab`

```text
Used to send a scan-start message to the Amazon.co.jp Kindle library page currently open in the user's tab, triggered only by explicit user action.
```

### `https://www.amazon.co.jp/*`

```text
Required to run the content script on the Kindle library page and to fetch Amazon.co.jp search result pages (after explicit user action) for follow-up volume candidates, prices, discounts, release dates, and thumbnails. No other websites are accessed.
```

## Reviewer Notes

```text
This extension is designed for Amazon.co.jp Kindle library users.

Review steps:
1. Install the extension.
2. Open https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/ while signed in to an Amazon.co.jp account that has Kindle books.
3. Open the Firefox sidebar for "Kindle Series Sale Tracker".
4. Click the library scan button if the library page is not already open.
5. On the Kindle library page, click the full scan or quick update button.
6. After the scan completes, open the sidebar or dedicated page to view series candidates.
7. Click the follow-up check button to fetch Amazon.co.jp search results and show next-volume information.

No test account is provided because the extension only works with the reviewer's own Amazon.co.jp browser session. The extension does not collect or transmit Amazon credentials.

The UI language can be toggled between Japanese and English using the language button in the sidebar header.

The extension stores scan results only in browser extension storage. It does not operate a backend server and does not send Kindle library data to the developer.
```
