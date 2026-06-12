# Notes to Reviewer — Kindle Series Sale Tracker (Firefox Add-ons)

This document is the source for the "Notes to Reviewer" field in the AMO submission form.
Copy the text block below verbatim into the submission form.

---

## Submission text (copy as-is)

```text
Thank you for reviewing Kindle Series Sale Tracker v0.4.4.

--- Changes in v0.4.4 ---

Each scheduled background cycle now checks every eligible series in throttled
batches. The sidebar/options page shows background progress and failures, plus
auto-scan trigger decisions, skip reasons, progress, completion, and failure.
Kindle Unlimited + coupon price parsing is also improved. No new permissions.

--- Purpose ---

Organizes Amazon.co.jp Kindle library into series, checks follow-up volumes, shows
prices/discounts. All local, no external server.

--- Technical summary ---

No eval(), no new Function(), no remote scripts. Amazon HTML parsed via DOMParser
as data only. Two opt-in automation features (disabled by default): background
follow-up check (chrome.alarms, 12-48h interval) and auto-scan on library page
visit (3-14 day cooldown). Execution status shown in sidebar/options page.

--- Network access (Amazon.co.jp only) ---

1. Library scan: /hz/mycd/digital-console/ajax (user action or opt-in auto-scan)
2. Follow-up check: /s?k=...&i=digital-text (user action or opt-in background)

No other domains. No analytics. No telemetry. Cookies used for in-browser auth
only, never stored or forwarded.

--- Host permission ---

https://www.amazon.co.jp/* covers library Ajax + search results. Content script
scoped to: .../hz/mycd/digital-console/contentlist/booksAll*

--- How to test ---

Requires an Amazon.co.jp account with Kindle books (no test account — extension
uses reviewer's own session, credentials never collected).

1. Install → open Firefox sidebar "Kindle Series Sale Tracker"
2. Open amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/
3. Click "全件取得" (Scan Library)
4. Click "再確認" (Check) on any series
5. Open "専用ページ" → "自動化" to test opt-in automation
6. JA/EN toggle in sidebar header

Source: https://github.com/harness17/kindle-series-sale-tracker (MIT)
```

---

## Field limits and placement

| AMO submission field | Content |
|---|---|
| "Notes to Reviewer" | Paste the text block above |
| Character limit | AMO allows up to ~4 000 characters. The block above is within limit. |

## Checklist before submitting

- [ ] The submitted ZIP matches the source at the commit tagged `v0.4.4`
- [ ] `manifest.json` version field reads `0.4.4`
- [ ] No `CLAUDE_CODE_HANDOFF.md` or personal data files in the ZIP (excluded by build script)
- [ ] `data_collection_permissions.required` is `["none"]` in `browser_specific_settings`
- [ ] Source URL in the notes matches the public GitHub repository
