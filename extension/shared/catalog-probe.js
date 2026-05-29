(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./kindle-library.js'));
  } else {
    root.__KST_CATALOG__ = factory(root.__KST__);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (kdl) {
  'use strict';

  // 正規化シリーズ名どうしが同一シリーズか緩く判定する。
  function sameSeries(a, b) {
    if (!a || !b) return false;
    const na = String(a).replace(/\s+/g, '');
    const nb = String(b).replace(/\s+/g, '');
    if (!na || !nb) return false;
    return na === nb || na.includes(nb) || nb.includes(na);
  }

  // 検索結果 [{title,url}] から、同一シリーズで highestVolume より先の最小巻を探す。
  // 返り値:
  //   { status:'has-next', nextVolume, nextTitle, nextUrl } 続刊あり
  //   { status:'no-next' }   同一シリーズの続刊が見つからない（完結/最新所有の可能性）
  //   { status:'unknown' }   結果なし/解析不能
  function detectNextVolume(results, options) {
    const { seriesTitle, highestVolume } = options || {};
    if (!Array.isArray(results) || results.length === 0) {
      return { status: 'unknown' };
    }
    if (!Number.isFinite(highestVolume)) {
      return { status: 'unknown' };
    }

    const targetKey = kdl.seriesKeyFromTitle(seriesTitle || '');
    let best = null;
    for (const r of results) {
      const parsed = kdl.splitSeriesAndVolume(r.title || '');
      if (!Number.isFinite(parsed.volume)) continue;
      if (parsed.volume <= highestVolume) continue;
      if (!sameSeries(parsed.seriesKey, targetKey)) continue;
      if (best === null || parsed.volume < best.volume) {
        best = { volume: parsed.volume, title: r.title, url: r.url };
      }
    }

    if (best) {
      return {
        status: 'has-next',
        nextVolume: best.volume,
        nextTitle: best.title,
        nextUrl: best.url,
      };
    }
    return { status: 'no-next' };
  }

  // DOM Document から検索結果 [{asin,title,url}] を抽出する。
  // ⚠ Amazon 検索結果のDOMに依存し壊れやすい。実HTML fixture で要検証・調整。
  function parseSearchResultsFromDoc(doc) {
    const results = [];
    const nodes = doc.querySelectorAll(
      'div[data-asin][data-component-type="s-search-result"], div.s-result-item[data-asin]'
    );
    for (const node of nodes) {
      const asin = node.getAttribute('data-asin');
      if (!asin) continue;
      const titleEl =
        node.querySelector('h2 a span') ||
        node.querySelector('h2 span') ||
        node.querySelector('.a-size-medium.a-text-normal') ||
        node.querySelector('.a-size-base-plus');
      const link =
        node.querySelector('h2 a') || node.querySelector('a.a-link-normal[href*="/dp/"]');
      const title = ((titleEl && titleEl.textContent) || '').trim();
      const href = link && link.getAttribute('href');
      if (!title || !href) continue;
      const url = href.startsWith('http') ? href : `https://www.amazon.co.jp${href}`;
      results.push({ asin, title, url });
    }
    return results;
  }

  return { detectNextVolume, parseSearchResultsFromDoc, sameSeries };
});
