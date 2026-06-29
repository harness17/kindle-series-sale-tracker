# Notes to Reviewer — Kindle Series Sale Tracker (Chrome Web Store)

This document is the source for the "Test Instructions" field in the Chrome Web Store
Developer Dashboard submission form.
Copy the text block below verbatim into the submission form.

---

## Submission text (copy as-is)

```text
Thank you for reviewing Kindle Series Sale Tracker.

--- Purpose ---

This extension helps users of Amazon.co.jp's Kindle store organize their purchased
books into series, check whether follow-up volumes exist, and see prices and
discounts — all locally in the browser, with no external server.

--- Changes in v0.5.2 ---

Bug fixes:
- Badge count now matches the number of series shown as NEW in the side panel.
  Previously, a single series with both a new sequel and a new sale incremented
  the badge by 2 while only one NEW marker appeared.
- Series matching for follow-up volume detection now handles titles where
  Amazon uses an ideographic space (U+3000) in search results but a regular
  space in the owned title (e.g. "異修羅　新魔王戦争" vs "異修羅 新魔王戦争").
- NEW badge layout no longer compresses the series title when multiple badges
  (NEW Sequel + NEW Sale + book count) appear on the same row.

No new permissions. No new external network access.

--- Network access ---

Two fetch patterns, triggered by user action or the corresponding opt-in automation:

1. Library scan (content script → Amazon Ajax):
   URL: https://www.amazon.co.jp/hz/mycd/digital-console/ajax
   Trigger: user clicks "Scan Library", or the user-enabled auto-scan becomes due
   when the Kindle library page is visited.
   What it reads: Kindle library item data (title, author, ASIN, read status,
   cover URL). Uses the user's existing Amazon.co.jp browser session
   (credentials:'include'). No credentials are stored or transmitted elsewhere.

2. Follow-up volume check (popup.js → Amazon search):
   URL: https://www.amazon.co.jp/s?k=<series title>&i=digital-text
   Trigger: user clicks "Check Next Volume", or the user-enabled scheduled
   background check becomes due.
   What it reads: search result HTML — candidate titles, prices, discounts,
   release dates, cover thumbnails. Parsed via DOMParser. Not executed as code.

No other domains are contacted. No analytics, no telemetry.

--- Technical summary ---

No eval(), no new Function(), no remote script loading, no CDN, no external server.
All bundled assets are static files inside the submitted ZIP.

Chrome uses an offscreen document solely for DOMParser access (service workers
lack DOM APIs). The offscreen document communicates only via chrome.runtime
messaging — it does not use chrome.storage or other extension APIs.

--- How to test ---

Testing requires an Amazon.co.jp account that has Kindle books. No test account
can be provided because the extension operates entirely within the reviewer's own
Amazon.co.jp browser session. Amazon credentials are never collected.

Steps:
1. Install the extension and click the extension action to open the side panel.
2. Open https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/
   while signed in to an Amazon.co.jp account.
3. In the side panel, click the full scan button ("全件取得" / "Scan Library").
4. After the scan completes, series candidates appear in the list.
5. Click "再確認" / "Check" on any series card to trigger a follow-up search.
   Price, discount rate, and release date are shown when available on Amazon.co.jp.
6. To switch the UI to English, click the "JA/EN" toggle in the side panel header.
7. In "専用ページ" / the options page, enable either automation feature and
   review its trigger, running, completed, failed, or skipped status.
8. The background check history section shows the last 20 run results.

--- Source availability ---

Source code: https://github.com/harness17/kindle-series-sale-tracker
License: MIT
```

---

## Field limits and placement

| Dashboard field | Content |
|---|---|
| "Test Instructions" | Paste the text block above |

## Checklist before submitting

- [ ] The submitted ZIP matches the source at the commit tagged `v0.5.2`
- [ ] `manifest.json` version field reads `0.5.2`
- [ ] No `CLAUDE_CODE_HANDOFF.md` or personal data files in the ZIP (verified by build script)
- [ ] Host permission justification text in listing-en.md is copied to the Privacy tab
- [ ] "Remote code usage" is set to No
- [ ] Source URL in the notes matches the public GitHub repository
