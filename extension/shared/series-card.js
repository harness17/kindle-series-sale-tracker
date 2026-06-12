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
    // stale（要再確認）は next 巻を既に所持しているため、購入オファーとして出さない。
    if (!cached || cached.status !== 'has-next' || cached.stale) return null;
    const catalog =
      typeof globalThis !== 'undefined' ? globalThis.__KST_CATALOG__ : null;
    const priceVersionMatches =
      !catalog ||
      !catalog.PRICE_CALC_VERSION ||
      cached.nextPriceCalcVersion === catalog.PRICE_CALC_VERSION;
    return {
      volume: cached.nextVolume,
      title: cached.nextTitle,
      url: cached.nextUrl,
      releaseDate: cached.nextReleaseDate,
      thumbnailUrl: cached.nextThumbnailUrl,
      priceText: priceVersionMatches ? cached.nextPriceText : '',
      listPriceText: priceVersionMatches ? cached.nextListPriceText : '',
      discountRate: priceVersionMatches ? cached.nextDiscountRate || null : null,
      isNext: true,
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
    const cardLang = (options && options.lang) || 'ja';
    const cardI18n = typeof window !== 'undefined' && window.__KST_I18N__;
    function ct(key) {
      var args = Array.prototype.slice.call(arguments, 1);
      if (!cardI18n) return key;
      return cardI18n.translate.apply(null, [cardLang, key].concat(args));
    }

    targetEl.textContent = '';
    targetEl.classList.add('status-block');

    if (completed) {
      appendBadge(targetEl, 'badge completed', ct('completed'));
      return;
    }

    const offer = resolvePrimaryOffer(cached);
    if (offer && offer.discountRate) {
      appendBadge(targetEl, 'badge sale', `${offer.discountRate}%OFF`);
    }

    if (offer && offer.priceText) {
      appendSpace(targetEl);
      appendBadge(targetEl, 'badge price', ct('priceText', offer.priceText));
    }

    appendSpace(targetEl);
    if (!cached) {
      appendBadge(targetEl, 'badge', ct('unchecked'));
    } else if (cached.stale) {
      appendBadge(targetEl, 'badge recheck', ct('stale'));
    } else if (cached.status === 'has-next') {
      appendBadge(targetEl, 'badge next', ct('hasNextVol', cached.nextVolume));
      if (cached.nextUrl) {
        appendSpace(targetEl);
        const link = document.createElement('a');
        link.href = cached.nextUrl;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.textContent = cached.nextTitle || ct('buyPage');
        targetEl.appendChild(link);
      }
    } else if (cached.status === 'no-next') {
      appendBadge(targetEl, 'badge', ct('noNextVol'));
    } else {
      appendBadge(targetEl, 'badge', ct('unknown'));
    }

    const showLatest =
      cached &&
      cached.latestVolume &&
      (cached.stale || (cached.status === 'has-next' && offer && cached.latestVolume !== offer.volume));
    if (showLatest) {
      appendSpace(targetEl);
      const date = cached.latestReleaseDate ? ` ${cached.latestReleaseDate}` : '';
      appendBadge(targetEl, 'badge latest-date', ct('latestVolInfo', cached.latestVolume, date));
    }

    if (
      cached &&
      cached.status === 'has-next' &&
      !cached.stale &&
      cached.completionCost !== null &&
      cached.completionFoundCount > 0 &&
      cached.completionExpectedSpan > 1
    ) {
      appendSpace(targetEl);
      const isPartial = cached.completionFoundCount < cached.completionExpectedSpan;
      let label;
      if (isPartial) {
        const estimated = Math.round(
          (cached.completionCost / cached.completionFoundCount) * cached.completionExpectedSpan
        );
        label = ct('completionCostPartial', estimated);
      } else {
        label = ct('completionCostFull', cached.completionCost, cached.completionFoundCount);
      }
      appendBadge(targetEl, 'badge completion-cost', label);
    }
  }

  async function fetchSearchResults(catalog, url) {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return [];
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return catalog.parseSearchResultsFromDoc(doc);
  }

  async function probeSeriesWithUrl(catalog, group, searchUrl, seriesKey) {
    const results = await fetchSearchResults(catalog, searchUrl);
    if (results.length === 0) return { status: 'unknown' };
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
      const primaryResults = await fetchSearchResults(catalog, group.searchUrl);
      let result = catalog.detectNextVolume(primaryResults, {
        seriesTitle: group.title,
        seriesKey: group.seriesKey,
        highestVolume: group.highestVolume,
        ownedImprint: group.imprint,
      });

      if (result.status === 'has-next' && result.nextVolume > group.highestVolume + 3) {
        try {
          const extraResults = [];
          for (let page = 2; page <= 5; page += 1) {
            try {
              const pageUrl = group.searchUrl + '&page=' + page;
              const pageResults = await fetchSearchResults(catalog, pageUrl);
              extraResults.push(...pageResults);
            } catch (error) {
              // Skip failed pagination pages and keep using available results.
            }
          }

          const gapUrl = seriesSearchUrl(`${group.seriesKey || group.title} ${group.highestVolume + 1}`, '');
          const gapResults = await fetchSearchResults(catalog, gapUrl);
          const mergedResult = catalog.detectNextVolume(primaryResults.concat(extraResults).concat(gapResults), {
            seriesTitle: group.title,
            seriesKey: group.seriesKey,
            highestVolume: group.highestVolume,
            ownedImprint: group.imprint,
          });
          if (mergedResult.status === 'has-next') result = mergedResult;
        } catch (error) {
          // Keep the primary result when the supplemental search fails.
        }
      }

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

  // 所持更新後、照会時点を基準に確定した続刊情報を新しい highestVolume で再評価する。
  // 書き戻さず表示時に導出する純関数。cache の生データ（latestVolume 等）は変更しない。
  //   ① has-next 以外 / highestVolume 不明        → cached をそのまま返す
  //   ② highestVolume < nextVolume               → cached をそのまま返す（次巻未所持）
  //   ③ highestVolume >= latestVolume            → no-next へ降格
  //   ④ nextVolume <= highestVolume < latestVolume → stale（要再確認、status は has-next 維持）
  //   ⑤ latestVolume 欠落の旧エントリ             → latestVolume=nextVolume とみなす（安全側=③で降格）
  function reconcileCatalog(cached, highestVolume) {
    if (!cached || cached.status !== 'has-next') return cached;
    if (!Number.isFinite(highestVolume)) return cached;
    const next = cached.nextVolume;
    if (!Number.isFinite(next)) return cached;
    if (highestVolume < next) return cached;
    const latest = Number.isFinite(cached.latestVolume) ? cached.latestVolume : next;
    if (highestVolume >= latest) {
      return { ...cached, status: 'no-next', reconciled: 'owned-to-latest' };
    }
    return { ...cached, stale: true, reconciled: 'stale' };
  }

  // 「続刊あり確定」= 完結禁止・新刊チェック除外の対象。stale は確定扱いしない。
  function isConfirmedHasNext(cached) {
    return !!cached && cached.status === 'has-next' && !cached.stale;
  }

  return {
    discountValue,
    formatRanges,
    isConfirmedHasNext,
    probeSeries,
    probeSeriesWithUrl,
    reconcileCatalog,
    renderStatusBlock,
    resolvePrimaryOffer,
    seriesSearchUrl,
    withClosingDashSeriesKey,
  };
});
