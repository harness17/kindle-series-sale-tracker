# Notes to Reviewer — Kindle Series Sale Tracker (Firefox Add-ons)

This document is the source for the "Notes to Reviewer" field in the AMO submission form.
Copy the text block below verbatim into the submission form.

---

## Submission text (copy as-is)

```text
Thank you for reviewing Kindle Series Sale Tracker v0.5.1.

--- Changes in v0.5.1 ---

Series name parsing fixes:
- Dangling open brackets left after volume marker extraction are now stripped
  (e.g. a title ending with "（1巻" no longer leaves "（" in the series name).
- Ideographic space (U+3000) is now recognized as a subtitle separator. When a
  title has the form "Subtitle　SeriesName N", the series key is extracted from
  the right segment (e.g. "強行偵察　宇宙兵志願 ２" → series "宇宙兵志願").
- Trailing digits directly after kanji/hiragana are now detected as volume
  numbers (e.g. "シリーズ名2" → volume 2). Katakana endings are excluded to
  preserve titles like "エリア88".

No new permissions. No new external network access. Internal parsing only.

--- Purpose ---

Organizes an Amazon.co.jp Kindle library into series, checks follow-up volumes,
and shows prices/discounts. All data remains local; no external server is used.

--- Technical summary ---

No eval(), new Function(), or remote scripts. Amazon HTML is parsed via DOMParser
as data only. Two automation features are disabled by default: background
follow-up checks (alarms, 12-48h) and auto-scan on library visits (3-14 days).

Firefox parses background results in its non-persistent background script. It
does not request Chrome's offscreen permission.

--- Network access (Amazon.co.jp only) ---

1. Library scan: /hz/mycd/digital-console/ajax (user action or opt-in auto-scan)
2. Follow-up check: /s?k=...&i=digital-text (user action or opt-in background)

No other domains, analytics, or telemetry. Cookies are used only by the browser
for Amazon authentication and are never stored or forwarded by the extension.

--- Host permission ---

https://www.amazon.co.jp/* covers library Ajax + search results. Content script
scoped to: .../hz/mycd/digital-console/contentlist/booksAll*

--- How to test ---

Requires an Amazon.co.jp account with Kindle books. No test account is provided;
the extension uses the reviewer's own session. Credentials are never collected.

1. Install → open Firefox sidebar "Kindle Series Sale Tracker"
2. Visit amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/
3. Click "全件取得" (Scan Library) → series list appears
4. Click "再確認" (Check) on any series → price/sequel info shown
5. Open "専用ページ" → enable background check and auto-scan
6. Background check runs all eligible series; history shows last 20 results
7. JA/EN toggle in sidebar header switches UI language

Source: https://github.com/harness17/kindle-series-sale-tracker (MIT)
```

---

## Field limits and placement

| AMO submission field | Content |
|---|---|
| "Notes to Reviewer" | Paste the text block above |
| Character limit | AMO allows up to ~4 000 characters. The block above is within limit. |

## Checklist before submitting

- [ ] The submitted ZIP matches the source at the commit tagged `v0.5.1`
- [ ] `manifest.json` version field reads `0.5.1`
- [ ] No `CLAUDE_CODE_HANDOFF.md` or personal data files in the ZIP (excluded by build script)
- [ ] `data_collection_permissions.required` is `["none"]` in `browser_specific_settings`
- [ ] Source URL in the notes matches the public GitHub repository
