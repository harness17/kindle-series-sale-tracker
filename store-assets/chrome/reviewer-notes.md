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

--- Source code layout ---

extension/
  background/background.js     — Service worker. Sets openPanelOnActionClick so the
                                   extension action opens the side panel directly.
  content/content.js           — Content script. Runs only on:
                                   https://www.amazon.co.jp/hz/mycd/digital-console/
                                   contentlist/booksAll*
                                 On explicit user action, calls Amazon's own internal
                                 Ajax endpoint (/hz/mycd/digital-console/ajax) to
                                 read the user's Kindle library titles, authors, and
                                 ASINs. Sends the parsed result to the side panel via
                                 chrome.runtime.sendMessage. Does NOT read cookies
                                 or credentials directly.
  shared/kindle-library.js     — Pure functions: parse Ajax response, normalize
                                   series title and volume number from book titles.
  shared/catalog-probe.js      — Pure functions: detect next unowned volume from
                                   Amazon search result HTML (parsed as a document,
                                   not executed).
  shared/series-card.js        — DOM rendering helpers for series cards. No network.
  shared/i18n.js               — Client-side ja/en text strings. No network.
  shared/theme-init.js         — Reads chrome.storage.local for theme preference.
  popup/popup.js + popup.html  — Side panel UI. On user action, fetches Amazon search
                                   result pages via fetch() with credentials:'include'
                                   to check follow-up volumes. Parsed as document
                                   content only, never eval'd.
  options/options.js            — Dedicated options page. Same data, no extra network.

No eval(), no new Function(), no remote script loading, no CDN, no external server.
All bundled assets are static files inside the submitted ZIP.

--- Network access ---

Two fetch patterns, both user-triggered:

1. Library scan (content script → Amazon Ajax):
   URL: https://www.amazon.co.jp/hz/mycd/digital-console/ajax
   Trigger: user clicks "Scan Library" button in the side panel.
   What it reads: Kindle library item data (title, author, ASIN, read status,
   cover URL). Uses the user's existing Amazon.co.jp browser session
   (credentials:'include'). No credentials are stored or transmitted elsewhere.

2. Follow-up volume check (popup.js → Amazon search):
   URL: https://www.amazon.co.jp/s?k=<series title>&i=digital-text
   Trigger: user clicks "Check Next Volume" for a series card.
   What it reads: search result HTML — candidate titles, prices, discounts,
   release dates, cover thumbnails. Parsed via DOMParser. Not executed as code.

No other domains are contacted. No analytics, no telemetry.

--- Data storage ---

All data is stored in chrome.storage.local:
  - Library scan results (series candidates, volume ranges)
  - Follow-up check cache (next volume info, prices)
  - UI settings (theme, language, sort order)
  - Per-series flags (priority, completed, excluded)

Nothing is uploaded to any server. amazon.co.jp session cookies are used only to
authenticate the in-browser fetch requests and are never read, stored, or forwarded.

--- Why the broad host permission ---

The manifest declares:
  "host_permissions": ["https://www.amazon.co.jp/*"]

Reason: two distinct Amazon.co.jp URL patterns are accessed at runtime:
  1. /hz/mycd/digital-console/ajax (library data)
  2. /s?k=...&i=digital-text&page=N (search results for follow-up checks)
     and occasional supplemental search patterns

The content script itself is narrowly scoped to:
  "matches": ["https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll*"]

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

- [ ] The submitted ZIP matches the source at the commit tagged `v0.4.0`
- [ ] `manifest.json` version field reads `0.4.0`
- [ ] No `CLAUDE_CODE_HANDOFF.md` or personal data files in the ZIP (verified by build script)
- [ ] Host permission justification text in listing-en.md is copied to the Privacy tab
- [ ] "Remote code usage" is set to No
- [ ] Source URL in the notes matches the public GitHub repository
