# Chrome Web Store Listing — English

## Upload Package

- Zip: `dist/chrome/kindle-series-sale-tracker-chrome-v0.4.0.zip`
- Version: `0.4.0`

## Graphic Assets

- Store icon: `extension/icons/icon128.png`
- Screenshot 1 (Japanese UI): `store-assets/chrome/screenshots/01-options-list-1280x800.png`
- Screenshot 2 (Japanese UI): `store-assets/chrome/screenshots/02-side-panel-1280x800.png`
- Screenshot 1 (English UI): `store-assets/chrome/screenshots/en/01-options-list-1280x800.png` *(take after switching language toggle to EN)*
- Screenshot 2 (English UI): `store-assets/chrome/screenshots/en/02-side-panel-1280x800.png` *(take after switching language toggle to EN)*
- Small promo tile (EN): `store-assets/chrome/promo/small-promo-440x280-en.png`

## Basic Information

- Name: `Kindle Series Sale Tracker`
- Summary (≤132 chars):

```text
Track your Amazon.co.jp Kindle series — check next volumes, prices, discounts, and estimate completion costs. Runs locally.
```

- Category: `Shopping`
- Language: `English`
- Homepage URL: `https://github.com/harness17/kindle-series-sale-tracker`
- Support URL: `https://github.com/harness17/kindle-series-sale-tracker/issues`
- Privacy Policy URL: `https://github.com/harness17/kindle-series-sale-tracker/blob/main/PRIVACY.md`

## Detailed Description

```text
Kindle Series Sale Tracker helps you organize your Amazon.co.jp Kindle library by series. Identify owned volumes, check for follow-up releases, and see prices and discounts — all locally in your browser, without any server.

Features:
• Scan your Kindle library from the Amazon.co.jp digital console with one click
• Automatically detect series and estimate owned volume ranges
• Check next-volume availability with price, discount rate, and release date
• Estimate the total cost to complete an unfinished series
• Mark series as completed, priority, or excluded
• Export your series list as CSV or JSON
• Sidebar panel and dedicated options page
• Opt-in background check for new volumes and sales (badge notification)
• Opt-in auto-scan when visiting the Kindle library page

Privacy:
All scan results and settings are stored locally in your browser (chrome.storage.local). No data is sent to any external server. Background checks also target only Amazon.co.jp pages, with results stored locally. Amazon credentials, cookies, and purchase history are never stored or transmitted to the developer.

Note:
This extension depends on Amazon.co.jp page structure. Changes on Amazon's side may affect library scanning or follow-up checks. Prices, discounts, and release dates are shown only when retrievable from Amazon.co.jp search results.

This extension is designed for Amazon.co.jp (Japanese Kindle store) only.
```

## Privacy Tab

### Single Purpose

```text
Scan the user's Amazon.co.jp Kindle library, organize titles into series, and provide locally stored follow-up volume and price check results.
```

### Permission Justifications

#### `storage`

```text
Used to save scan results, follow-up check cache, theme settings, per-series flags (priority, completed, excluded), and automation settings locally in the browser.
```

#### `alarms`

```text
Used to schedule opt-in background checks for new volumes and sales. The alarm fires only when the user enables this feature in the options page.
```

#### `offscreen`

```text
Used to parse Amazon.co.jp search result HTML (via DOMParser) during background checks. The Service Worker cannot access DOMParser, so an offscreen document is created temporarily for parsing and closed immediately after each check.
```

#### `activeTab`

```text
Used to send a scan-start message to the Amazon.co.jp Kindle library page currently open in the user's tab, triggered only by explicit user action.
```

#### `sidePanel`

```text
Used to display the series list and follow-up check results in a sidebar panel so users can review them without navigating away from Amazon pages.
```

#### `https://www.amazon.co.jp/*`

```text
Required to run the content script on the Kindle library page and to fetch Amazon.co.jp search result pages (after explicit user action or opt-in background schedule) for follow-up volume candidates, prices, discounts, release dates, and thumbnails. Access is limited to Amazon.co.jp pages needed for the extension's single purpose. No other websites are accessed.
```

### Host Permission Justification

```text
This extension needs access to https://www.amazon.co.jp/* because its single purpose is to organize the user's Amazon.co.jp Kindle library and check follow-up volume candidates on Amazon.co.jp.

The content script runs only on the Kindle library URL pattern:
https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll*

The broader Amazon.co.jp host permission is used so the extension can, after an explicit user action or an opt-in background schedule, fetch Amazon.co.jp Kindle search result pages from the user's browser session to parse follow-up candidate titles, prices, discounts, release dates, thumbnails, and product URLs.

The extension does not request access to other websites. It does not collect or transmit Amazon credentials, cookies, or Kindle library data to the developer or any third-party server. Scan results and settings are stored locally in chrome.storage.local.
```

### Remote Code Usage

Select: `No`

```text
No. This extension does not execute remotely hosted code.

All JavaScript, HTML, CSS, and image assets are bundled inside the submitted extension package. The extension does not load external scripts, inject remote script tags, use eval or new Function on fetched strings, or import code from a CDN or remote server.

The extension fetches Amazon.co.jp pages only as data, after explicit user action or opt-in background schedule, to parse Kindle library and search result content needed for its single purpose. Fetched HTML is parsed as document content and is not executed as code.
```

### Data Collection Disclosure

Suggested selections:

- Website content: Yes (Amazon.co.jp Kindle library and search result pages, read in the user's browser session only)
- Authentication information: No
- Personally identifiable information: No
- Financial and payment information: No
- Health information: No
- Personal communications: No
- Location: No
- Web history: No

Certification text:

```text
The extension uses data only to provide its single purpose: organizing the user's Amazon.co.jp Kindle library and follow-up volume checks locally in the browser. It does not sell, share, or transmit user data to the developer or third parties.
```

## Distribution

- Visibility: `Public`
- Regions: All regions (functionality is Amazon.co.jp-specific, but listing in English broadens discoverability)
- Pricing: Free

## Test Instructions

```text
This extension is designed for Amazon.co.jp Kindle library users.

Review steps:
1. Install the extension.
2. Open https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/ while signed in to an Amazon.co.jp account that has Kindle books.
3. Click the extension action to open the side panel.
4. Click the library scan button ("Kindle一覧" / "Scan Library") if the library page is not already open.
5. On the Kindle library page, click the full scan or quick update button.
6. After the scan completes, open the side panel or dedicated page to view series candidates.
7. Click the follow-up check button to fetch Amazon.co.jp search results and show next-volume price and availability.
8. Open the dedicated options page and scroll to the "Automation" section. Enable "Check next volumes and sales in the background" to schedule automatic checks. A badge number appears on the extension icon when new volumes or sales are found.
9. Enable "Auto-scan when visiting the Kindle library" to auto-scan when revisiting the library page.

No test account is provided because the extension only works with the reviewer's own Amazon.co.jp browser session. The extension does not collect or transmit Amazon credentials.

The UI language can be toggled between Japanese and English using the language button in the sidebar.
```

## Notes For Reviewer

```text
Kindle Series Sale Tracker stores scan results only in chrome.storage.local. It does not operate a backend server and does not send Kindle library data to the developer.

The extension requests Amazon.co.jp host access because it must run on the Kindle library page and fetch Amazon.co.jp search results from the user's browser session. It does not request access to other websites.

Version 0.3.0 adds two opt-in automation features: background catalog probe (using chrome.alarms + offscreen document for HTML parsing) and auto-scan on Kindle library page visit. Both are disabled by default and can be enabled in the options page. The offscreen document is created only during background probe execution and closed immediately after.

Version 0.4.0 adds a collapsible "execution status" display (last run, next run, progress, and snapshot counts of series with new volumes / sales) for the two automation features, shown in the popup/side panel and the options page. It also makes the background catalog probe resilient to extension reloads/updates by running a catch-up check on startup/install instead of relying only on a periodic alarm, and auto-scan now only runs the lightweight incremental fetch. No new permissions are requested in 0.4.0; all data stays in chrome.storage.local.

The UI supports Japanese and English (toggle in the sidebar header).
```
