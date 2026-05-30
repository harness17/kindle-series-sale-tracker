(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./kindle-library.js'));
  } else {
    root.__KST_CATALOG__ = factory(root.__KST__);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (kdl) {
  'use strict';

  // 同一シリーズ判定は正規化 seriesKey の完全一致のみ。
  // 部分一致にすると「小林さんちのメイドラゴン」が「…エルマのＯＬ日記」等の
  // スピンオフを同一シリーズと誤判定して続刊照合がごっちゃになるため避ける。
  function sameSeries(a, b) {
    if (!a || !b) return false;
    const na = String(a).replace(/\s+/g, '');
    const nb = String(b).replace(/\s+/g, '');
    return na !== '' && na === nb;
  }

  // 単話版・分冊版（1話ずつの配信）を見分ける。所有しているのは単行本（巻）なので、
  // 話数で連番が進む単話版を「続刊」として出すと、完結済み作品でも延々と続刊扱いになる。
  // 【単話版】は stripNoise で seriesKey から消えるため、必ず加工前の raw title で判定する。
  // 例:「Ｌｖ１魔王とワンルーム勇者【単話版】 ７１ (ＦＵＺコミックス)」を除外。
  function isSplitVolumeEdition(rawTitle) {
    return /単話|分冊|話売り/.test(String(rawTitle || ''));
  }

  // 所有している版（レーベル）と別レーベルの候補は、同じ作品の「別エディション」
  // （新装版・愛蔵版など）なので続刊扱いしない。判定は両方に版名があり、かつ異なるときだけ。
  // 片方でも版名が空なら（情報不足）従来どおり拾う＝ミッドランでの改称取りこぼしを最小化する。
  // 例: 所有「MFコミックス フラッパーシリーズ」に対し「エリア88 14 (マンガの金字塔)」を除外。
  function isDifferentImprint(ownedImprint, candidateImprint) {
    return Boolean(ownedImprint) && Boolean(candidateImprint) && ownedImprint !== candidateImprint;
  }

  // 検索結果 [{title,url}] から、同一シリーズで highestVolume より先の最小巻を探す。
  // 返り値:
  //   { status:'has-next', nextVolume, nextTitle, nextUrl } 続刊あり
  //   { status:'no-next' }   同一シリーズの続刊が見つからない（完結/最新所有の可能性）
  //   { status:'unknown' }   結果なし/解析不能
  function detectNextVolume(results, options) {
    const { seriesTitle, highestVolume, ownedImprint } = options || {};
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
      // 別エディション（別レーベルの新装版／単話・分冊版）は続刊として出さない。
      if (isSplitVolumeEdition(r.title)) continue;
      if (isDifferentImprint(ownedImprint, parsed.imprint)) continue;
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
