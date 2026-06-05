# Notes to Reviewer — Kindle Series Sale Tracker (Firefox Add-ons)

This document is the source for the "Notes to Reviewer" field in the AMO submission form.
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
  background/background.js     — Minimal service worker. Firefox: no-op (sidePanel
                                   API absent). Chrome: sets openPanelOnActionClick.
  content/content.js           — Content script. Runs only on:
                                   https://www.amazon.co.jp/hz/mycd/digital-console/
                                   contentlist/booksAll*
                                 On explicit user action, calls Amazon's own internal
                                 Ajax endpoint (/hz/mycd/digital-console/ajax) to
                                 read the user's Kindle library titles, authors, and
                                 ASINs. Sends the parsed result to the sidebar via
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
  popup/popup.js + popup.html  — Firefox sidebar UI. On user action, fetches Amazon
                                   search result pages via fetch() with
                                   credentials:'include' to check follow-up volumes.
                                   Parsed as document content only, never eval'd.
  options/options.js           — Dedicated full-page UI. Same data, no extra network.

No eval(), no new Function(), no remote script loading, no CDN, no external server.
All bundled assets are static files inside the submitted ZIP.

--- Network access ---

Two fetch patterns, both user-triggered:

1. Library scan (content script → Amazon Ajax):
   URL: https://www.amazon.co.jp/hz/mycd/digital-console/ajax
   Trigger: user clicks "Scan Library" button in the sidebar.
   What it reads: Kindle library item data (title, author, ASIN, read status,
   cover URL). The request uses the user's existing Amazon.co.jp browser session
   (credentials:'include'). No credentials are stored or transmitted elsewhere.

2. Follow-up volume check (popup.js → Amazon search):
   URL: https://www.amazon.co.jp/s?k=<series title>&i=digital-text
   Trigger: user clicks "Check Next Volume" for a series card.
   What it reads: search result HTML — candidate titles, prices, discounts,
   release dates, cover thumbnails. Parsed via DOMParser. Not executed.

No other domains are contacted. No analytics, no telemetry.

--- Data storage ---

All data is stored in browser.storage.local (mapped to chrome.storage.local):
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
     and occasional supplemental search patterns like
     /s?k=<title>+<volume+number>+Kindle

A narrower pattern covering both paths and all sub-variants would require a wildcard
at the path level (/hz/* and /s*) or listing each pattern separately, which would
not practically reduce the scope. The content script itself is narrowly scoped:
  "matches": ["https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll*"]

--- Testing without an Amazon.co.jp account ---

The extension's core functionality requires an Amazon.co.jp account with Kindle books.
If you do not have such an account, you can verify the extension's structure and
permissions by:
  1. Installing the extension.
  2. Opening the Firefox sidebar — it shows an empty series list with scan buttons.
  3. Inspecting the source in about:debugging or the submitted ZIP to confirm
     no remote code, no external domains, and no credential harvesting.

If you do have an Amazon.co.jp account with Kindle books:
  1. Open https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/
  2. Open the Firefox sidebar for "Kindle Series Sale Tracker".
  3. Click the full scan button ("全件取得" / "Scan Library").
  4. After the scan, series candidates appear in the list.
  5. Click "再確認" / "Check" on any series to trigger a follow-up search.

The UI language can be toggled between Japanese (default) and English using the
language button (JA/EN) in the sidebar header.

--- Source availability ---

Source code: https://github.com/harness17/kindle-series-sale-tracker
License: MIT
```

---

## Field limits and placement

| AMO submission field | Content |
|---|---|
| "Notes to Reviewer" | Paste the text block above |
| Character limit | AMO allows up to ~4 000 characters. The block above is within limit. |

## Checklist before submitting

- [ ] The submitted ZIP matches the source at the commit tagged `v0.2.0`
- [ ] `manifest.json` version field reads `0.2.0`
- [ ] No `CLAUDE_CODE_HANDOFF.md` or personal data files in the ZIP (excluded by build script)
- [ ] `data_collection_permissions.required` is `["none"]` in `browser_specific_settings`
- [ ] Source URL in the notes matches the public GitHub repository
