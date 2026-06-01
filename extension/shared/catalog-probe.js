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
    const normalizeKey = (value) =>
      kdl.normalizeSeriesKey(value).replace(/\s+/g, '').replace(/[-‐－―—~～]+$/g, '');
    const na = normalizeKey(a);
    const nb = normalizeKey(b);
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

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function normalizePublicationDate(text) {
    const value = String(text || '');
    const label = '(?:発売日|発行日|配信開始日|Publication date|Published|Release date)';
    const patterns = [
      new RegExp(`${label}\\s*[:：]?\\s*(\\d{4})\\s*年\\s*(\\d{1,2})\\s*月\\s*(\\d{1,2})\\s*日`, 'i'),
      new RegExp(`${label}\\s*[:：]?\\s*(\\d{4})[/-](\\d{1,2})[/-](\\d{1,2})`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = value.match(pattern);
      if (!match) continue;
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${pad2(month)}-${pad2(day)}`;
      }
    }
    return '';
  }

  function extractSearchResultDate(node) {
    return normalizePublicationDate(node && node.textContent);
  }

  function yenText(value) {
    return `￥${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  }

  function normalizeDigits(text) {
    return String(text || '').replace(/[０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    );
  }

  function parseYenPrice(text) {
    const value = normalizeDigits(text);
    const match = value.match(/[￥¥]\s*([\d,]+)/) || value.match(/([\d,]+)\s*円/);
    if (!match) return null;
    const price = Number(match[1].replace(/,/g, ''));
    return Number.isFinite(price) && price >= 0 ? price : null;
  }

  function parseYenPrices(text) {
    const value = normalizeDigits(text);
    const prices = [];
    const patterns = [/[￥¥]\s*([\d,]+)/g, /([\d,]+)\s*円/g];
    for (const pattern of patterns) {
      for (const match of value.matchAll(pattern)) {
        const price = Number(match[1].replace(/,/g, ''));
        if (Number.isFinite(price) && price >= 0) prices.push(price);
      }
    }
    return prices;
  }

  function parseDiscountRate(text) {
    const value = normalizeDigits(text);
    const match = value.match(/(\d{1,3})\s*[％%]\s*(?:OFF|オフ|割引)?/i);
    if (!match) return null;
    const rate = Number(match[1]);
    return Number.isFinite(rate) && rate > 0 && rate <= 100 ? rate : null;
  }

  // タイトルに「20%OFF」などが含まれる商品名を、割引率として誤検出しないため除外する。
  const TITLE_EXCLUDE_SELECTOR =
    'h2 a, h2 span, h3 a, .a-size-medium.a-text-normal, .a-size-base-plus, [data-cy="title-recipe"]';

  function collectSignalText(node, options) {
    if (!node) return '';
    const excludeTitles = !!(options && options.excludeTitles);
    let scope = node;
    if (excludeTitles && typeof node.cloneNode === 'function') {
      scope = node.cloneNode(true);
      if (scope && typeof scope.querySelectorAll === 'function') {
        scope.querySelectorAll(TITLE_EXCLUDE_SELECTOR).forEach((el) => {
          if (typeof el.removeAttribute === 'function') el.removeAttribute('title');
          if (typeof el.remove === 'function') el.remove();
        });
      }
    }

    const parts = [scope.textContent || ''];
    if (typeof scope.querySelectorAll === 'function') {
      scope
        .querySelectorAll('[aria-label], [title], [data-a-strike], [data-a-color], [data-csa-c-content-id]')
        .forEach((el) => {
          ['aria-label', 'title', 'data-a-strike', 'data-a-color', 'data-csa-c-content-id'].forEach(
            (attr) => {
              const value = typeof el.getAttribute === 'function' ? el.getAttribute(attr) : '';
              if (value) parts.push(value);
            }
          );
        });
    }
    return parts.join(' ').slice(0, 4000);
  }

  function queryText(node, selectors) {
    for (const selector of selectors) {
      const el = node.querySelector(selector);
      if (el && el.textContent) return el.textContent;
    }
    return '';
  }

  function queryTexts(node, selectors) {
    const texts = [];
    for (const selector of selectors) {
      if (typeof node.querySelectorAll === 'function') {
        node.querySelectorAll(selector).forEach((el) => {
          if (el && el.textContent) texts.push(el.textContent);
        });
      } else {
        const el = node.querySelector(selector);
        if (el && el.textContent) texts.push(el.textContent);
      }
    }
    return texts;
  }

  function selectCurrentPriceText(node, selectors) {
    const domPrices = queryTexts(node, selectors)
      .map((text) => parseYenPrice(text))
      .filter((price) => price !== null);
    const signalText = collectSignalText(node, { excludeTitles: true });
    const hasKindleUnlimited = /Kindle\s*Unlimited|読み放題/i.test(signalText);
    const prices = hasKindleUnlimited ? [...domPrices, ...parseYenPrices(signalText)] : domPrices;
    if (prices.length === 0) return '';

    let price = prices[0];
    if (hasKindleUnlimited && price === 0) {
      const purchasePrice = prices.find((candidate) => candidate > 0);
      if (purchasePrice !== undefined) price = purchasePrice;
    }
    return yenText(price);
  }

  function extractSearchResultOffer(node) {
    if (!node) return {};
    const priceText = selectCurrentPriceText(node, [
      '.a-price:not(.a-text-price):not(.wl-deal-price) .a-offscreen',
      '[data-a-color="price"] .a-price .a-offscreen',
      '.a-price .a-offscreen',
    ]);
    const listPriceText = queryText(node, [
      '.a-price.a-text-price .a-offscreen',
      '.a-text-price .a-offscreen',
      '.a-text-strike .a-offscreen',
      '.a-text-strike',
    ]);
    const price = parseYenPrice(priceText);
    const listPrice = parseYenPrice(listPriceText);
    const signalText = collectSignalText(node, { excludeTitles: true });
    const textDiscount = parseDiscountRate(signalText);
    const computedDiscount =
      price !== null && listPrice !== null && listPrice > price
        ? Math.round(((listPrice - price) / listPrice) * 100)
        : null;
    const discountRate = Math.max(textDiscount || 0, computedDiscount || 0) || null;
    return {
      priceText: price !== null ? yenText(price) : '',
      listPriceText: listPrice !== null && listPrice !== price ? yenText(listPrice) : '',
      discountRate: discountRate || null,
    };
  }

  // 検索結果 [{title,url}] から、同一シリーズで highestVolume より先の最小巻を探す。
  // 返り値:
  //   { status:'has-next', nextVolume, nextTitle, nextUrl, latestVolume?, latestReleaseDate? } 続刊あり
  //   { status:'no-next' }   同一シリーズの続刊が見つからない（完結/最新所有の可能性）
  //   { status:'unknown' }   結果なし/解析不能
  function detectNextVolume(results, options) {
    const { seriesTitle, seriesKey, highestVolume, ownedImprint } = options || {};
    if (!Array.isArray(results) || results.length === 0) {
      return { status: 'unknown' };
    }
    if (!Number.isFinite(highestVolume)) {
      return { status: 'unknown' };
    }

    // 照合キーは呼び出し側が算出済みの seriesKey を優先する。装飾タイトル
    // （版分割グループの「…（レーベル）」）を seriesKeyFromTitle に通すと実カタログ
    // 結果と一致しないため。seriesKey 内の数字を巻マーカー誤認しないよう巻数抽出はしない。
    // seriesKey 未指定時は従来どおり seriesTitle から導出する。
    const targetKey =
      seriesKey != null && seriesKey !== ''
        ? kdl.normalizeSeriesKey(seriesKey).replace(/\s+/g, '')
        : kdl.seriesKeyFromTitle(seriesTitle || '');
    let best = null;
    let latest = null;
    for (const r of results) {
      const parsed = kdl.splitSeriesAndVolume(r.title || '');
      if (!Number.isFinite(parsed.volume)) continue;
      if (!sameSeries(parsed.seriesKey, targetKey)) continue;
      // 別エディション（別レーベルの新装版／単話・分冊版）は続刊として出さない。
      if (isSplitVolumeEdition(r.title)) continue;
      if (isDifferentImprint(ownedImprint, parsed.imprint)) continue;
      if (latest === null || parsed.volume > latest.volume) {
        latest = {
          volume: parsed.volume,
          title: r.title,
          url: r.url,
          releaseDate: r.releaseDate || '',
          thumbnailUrl: r.thumbnailUrl || '',
          priceText: r.priceText || '',
          listPriceText: r.listPriceText || '',
          discountRate: r.discountRate || null,
        };
      }
      if (parsed.volume <= highestVolume) continue;
      if (best === null || parsed.volume < best.volume) {
        best = {
          volume: parsed.volume,
          title: r.title,
          url: r.url,
          releaseDate: r.releaseDate || '',
          thumbnailUrl: r.thumbnailUrl || '',
          priceText: r.priceText || '',
          listPriceText: r.listPriceText || '',
          discountRate: r.discountRate || null,
        };
      }
    }

    if (best) {
      return {
        status: 'has-next',
        nextVolume: best.volume,
        nextTitle: best.title,
        nextUrl: best.url,
        nextReleaseDate: best.releaseDate || '',
        nextThumbnailUrl: best.thumbnailUrl || '',
        nextPriceText: best.priceText || '',
        nextListPriceText: best.listPriceText || '',
        nextDiscountRate: best.discountRate || null,
        latestVolume: latest?.volume ?? best.volume,
        latestTitle: latest?.title ?? best.title,
        latestUrl: latest?.url ?? best.url,
        latestReleaseDate: latest?.releaseDate || '',
        latestThumbnailUrl: latest?.thumbnailUrl || '',
        latestPriceText: latest?.priceText || '',
        latestListPriceText: latest?.listPriceText || '',
        latestDiscountRate: latest?.discountRate || null,
      };
    }
    return latest
      ? {
          status: 'no-next',
          latestVolume: latest.volume,
          latestTitle: latest.title,
          latestUrl: latest.url,
          latestReleaseDate: latest.releaseDate || '',
          latestThumbnailUrl: latest.thumbnailUrl || '',
          latestPriceText: latest.priceText || '',
          latestListPriceText: latest.listPriceText || '',
          latestDiscountRate: latest.discountRate || null,
        }
      : { status: 'no-next' };
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
      const image = node.querySelector('img.s-image');
      const title = ((titleEl && titleEl.textContent) || '').trim();
      const href = link && link.getAttribute('href');
      if (!title || !href) continue;
      const url = href.startsWith('http') ? href : `https://www.amazon.co.jp${href}`;
      const offer = extractSearchResultOffer(node);
      results.push({
        asin,
        title,
        url,
        releaseDate: extractSearchResultDate(node),
        thumbnailUrl: (image && image.getAttribute('src')) || '',
        ...offer,
      });
    }
    return results;
  }

  return {
    detectNextVolume,
    extractSearchResultOffer,
    normalizePublicationDate,
    parseSearchResultsFromDoc,
    sameSeries,
  };
});
