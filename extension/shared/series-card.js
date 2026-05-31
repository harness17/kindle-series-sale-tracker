(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.__KST_CARD__ = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function seriesSearchUrl(seriesKey, author) {
    const query = encodeURIComponent(`${seriesKey} ${author ? `${author} ` : ''}Kindle`);
    return `https://www.amazon.co.jp/s?k=${query}&i=digital-text`;
  }

  function withClosingDashSeriesKey(seriesKey) {
    const value = String(seriesKey || '').trim();
    if (!value || /[-‐－―—]$/.test(value)) return '';
    return /\s[-‐－―—]\S/.test(value) ? `${value}-` : '';
  }

  function formatRanges(ranges) {
    return (ranges || []).map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ');
  }

  function resolvePrimaryOffer(cached) {
    if (!cached) return null;
    const useNext = cached.status === 'has-next';
    return {
      volume: useNext ? cached.nextVolume : cached.latestVolume,
      title: useNext ? cached.nextTitle : cached.latestTitle,
      url: useNext ? cached.nextUrl : cached.latestUrl,
      releaseDate: useNext ? cached.nextReleaseDate : cached.latestReleaseDate,
      thumbnailUrl: useNext ? cached.nextThumbnailUrl : cached.latestThumbnailUrl,
      priceText: useNext ? cached.nextPriceText : cached.latestPriceText,
      listPriceText: useNext ? cached.nextListPriceText : cached.latestListPriceText,
      discountRate: (useNext ? cached.nextDiscountRate : cached.latestDiscountRate) || null,
      isNext: useNext,
    };
  }

  function discountValue(cached) {
    const offer = resolvePrimaryOffer(cached);
    return offer && offer.discountRate ? offer.discountRate : -1;
  }

  function appendBadge(targetEl, className, text) {
    const badge = document.createElement('span');
    badge.className = className;
    badge.textContent = text;
    targetEl.appendChild(badge);
    return badge;
  }

  function appendSpace(targetEl) {
    if (targetEl.childNodes.length) targetEl.appendChild(document.createTextNode(' '));
  }

  function renderStatusBlock(targetEl, cached, options) {
    const completed = !!(options && options.completed);
    targetEl.textContent = '';
    targetEl.classList.add('status-block');

    if (completed) {
      appendBadge(targetEl, 'badge completed', '完結');
      return;
    }

    const offer = resolvePrimaryOffer(cached);
    if (offer && offer.discountRate) {
      appendBadge(targetEl, 'badge sale', `${offer.discountRate}%OFF`);
    }

    if (offer && offer.priceText) {
      appendSpace(targetEl);
      appendBadge(targetEl, 'badge price', `価格 ${offer.priceText}`);
    }

    appendSpace(targetEl);
    if (!cached) {
      appendBadge(targetEl, 'badge', '未照会');
    } else if (cached.status === 'has-next') {
      appendBadge(targetEl, 'badge next', `続刊 ${cached.nextVolume}巻`);
      if (cached.nextUrl) {
        appendSpace(targetEl);
        const link = document.createElement('a');
        link.href = cached.nextUrl;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.textContent = cached.nextTitle || '購入ページ';
        targetEl.appendChild(link);
      }
    } else if (cached.status === 'no-next') {
      appendBadge(targetEl, 'badge', '続刊なし');
    } else {
      appendBadge(targetEl, 'badge', '判定不能');
    }

    const showLatest =
      cached &&
      cached.latestVolume &&
      (!offer || !offer.isNext || cached.latestVolume !== offer.volume);
    if (showLatest) {
      appendSpace(targetEl);
      const date = cached.latestReleaseDate ? ` ${cached.latestReleaseDate}` : '';
      appendBadge(targetEl, 'badge latest-date', `最新 ${cached.latestVolume}巻${date}`);
    }
  }

  async function probeSeriesWithUrl(catalog, group, searchUrl, seriesKey) {
    const res = await fetch(searchUrl, { credentials: 'include' });
    if (!res.ok) return { status: 'unknown' };
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const results = catalog.parseSearchResultsFromDoc(doc);
    return catalog.detectNextVolume(results, {
      seriesTitle: group.title,
      seriesKey,
      highestVolume: group.highestVolume,
      ownedImprint: group.imprint,
    });
  }

  async function probeSeries(catalog, group) {
    if (!Number.isFinite(group.highestVolume)) return { status: 'unknown' };
    try {
      const result = await probeSeriesWithUrl(catalog, group, group.searchUrl, group.seriesKey);
      if (result.status === 'has-next') return result;

      const closedDashKey = withClosingDashSeriesKey(group.seriesKey || group.title);
      if (!closedDashKey) return result;

      const fallbackUrl = seriesSearchUrl(closedDashKey, group.author);
      if (fallbackUrl === group.searchUrl) return result;

      const fallback = await probeSeriesWithUrl(catalog, group, fallbackUrl, closedDashKey);
      return fallback.status === 'has-next' ? fallback : result;
    } catch (error) {
      return { status: 'unknown' };
    }
  }

  return {
    discountValue,
    formatRanges,
    probeSeries,
    probeSeriesWithUrl,
    renderStatusBlock,
    resolvePrimaryOffer,
    seriesSearchUrl,
    withClosingDashSeriesKey,
  };
});
