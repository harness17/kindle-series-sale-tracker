(function () {
  'use strict';

  const CACHE_KEY = 'kstCatalogCache';
  const BG_PROBE_QUEUE_KEY = 'kstBgProbeQueue';
  const BG_BADGE_COUNT_KEY = 'kstBgBadgeCount';

  function nextQueue(queue, chunkLength) {
    const cursor = Number.isFinite(queue?.cursor) ? queue.cursor : 0;
    const eligibleLength = Number.isFinite(queue?.eligibleLength) ? queue.eligibleLength : null;
    let nextCursor = cursor + chunkLength;
    let lastCycleAt = Number.isFinite(queue?.lastCycleAt) ? queue.lastCycleAt : 0;

    if (eligibleLength !== null && nextCursor >= eligibleLength) {
      nextCursor = 0;
      lastCycleAt = Date.now();
    }

    return { cursor: nextCursor, lastCycleAt };
  }

  const REQUEST_DELAY_MS = 350;

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function probeChunk(message) {
    const catalog = window.__KST_CATALOG__;
    const card = window.__KST_CARD__;
    const chunk = Array.isArray(message.chunk) ? message.chunk : [];
    const prevCache = message.prevCache || {};
    const newCache = {};
    let badgeCount = Number(message.currentBadgeCount) || 0;
    let isFirst = true;

    console.log('[KST] offscreen probe chunk: %d series', chunk.length);

    for (const series of chunk) {
      if (!isFirst) await delay(REQUEST_DELAY_MS);
      isFirst = false;
      try {
        const result = await card.probeSeries(catalog, series);
        const cacheEntry = { ...result, checkedAt: Date.now() };
        newCache[series.key] = cacheEntry;

        const reconciled = card.reconcileCatalog(cacheEntry, series.highestVolume);
        const prevReconciled = card.reconcileCatalog(prevCache[series.key], series.highestVolume);
        if (card.isConfirmedHasNext(reconciled) && !card.isConfirmedHasNext(prevReconciled)) {
          badgeCount += 1;
        }
        if (card.discountValue(reconciled) > 0 && card.discountValue(prevReconciled) <= 0) {
          badgeCount += 1;
        }
      } catch (error) {
        console.warn('[KST] background probe skipped', series?.key || series?.title, error);
      }
    }

    await chrome.storage.local.set({
      [CACHE_KEY]: { ...prevCache, ...newCache },
      [BG_PROBE_QUEUE_KEY]: nextQueue(message.queue || {}, chunk.length),
      [BG_BADGE_COUNT_KEY]: badgeCount,
    });

    return { done: true, badgeCount };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'kst:bgProbeChunk') return false;

    probeChunk(message)
      .then((response) => sendResponse(response))
      .catch((error) => {
        console.warn('[KST] background probe chunk failed', error);
        sendResponse({ done: false, error: String(error?.message || error) });
      });
    return true;
  });
})();
