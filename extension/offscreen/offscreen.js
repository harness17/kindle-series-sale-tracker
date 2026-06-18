(function () {
  'use strict';

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
  const MAX_CONSECUTIVE_UNKNOWN = 3;

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function probeChunk(message) {
    const catalog = window.__KST_CATALOG__;
    const card = window.__KST_CARD__;
    const chunk = Array.isArray(message.chunk) ? message.chunk : [];
    const prevCache = message.prevCache || {};
    const newCache = {};
    const badgeKeys = {};
    let badgeCount = Number(message.currentBadgeCount) || 0;
    let failedCount = 0;
    let unknownStreak = Number(message.initialUnknownStreak) || 0;
    let isFirst = true;

    console.log('[KST] offscreen probe chunk: %d series', chunk.length);

    for (const series of chunk) {
      if (!isFirst) await delay(REQUEST_DELAY_MS);
      isFirst = false;
      let result;
      try {
        result = await card.probeSeries(catalog, series);
      } catch (error) {
        failedCount += 1;
        unknownStreak = 0;
        console.warn('[KST] background probe skipped', series?.key || series?.title, error);
        continue;
      }

      if (result?.status === 'unknown') {
        unknownStreak += 1;
        if (unknownStreak >= MAX_CONSECUTIVE_UNKNOWN) {
          throw new Error(
            `Catalog results were indeterminate for ${MAX_CONSECUTIVE_UNKNOWN} consecutive series; retry later`
          );
        }
        if (prevCache[series.key] == null) {
          newCache[series.key] = { ...result, checkedAt: Date.now() };
        }
        continue;
      }

      unknownStreak = 0;
      const cacheEntry = { ...result, checkedAt: Date.now() };
      newCache[series.key] = cacheEntry;

      const reconciled = card.reconcileCatalog(cacheEntry, series.highestVolume);
      const prevReconciled = card.reconcileCatalog(prevCache[series.key], series.highestVolume);
      if (card.isConfirmedHasNext(reconciled) && !card.isConfirmedHasNext(prevReconciled)) {
        badgeCount += 1;
        badgeKeys[series.key] = { ...(badgeKeys[series.key] || {}), next: true };
      }
      if (card.discountValue(reconciled) > 0 && card.discountValue(prevReconciled) <= 0) {
        badgeCount += 1;
        badgeKeys[series.key] = { ...(badgeKeys[series.key] || {}), sale: true };
      }
    }

    const updatedQueue = nextQueue(message.queue || {}, chunk.length);
    return {
      done: true,
      badgeCount,
      badgeKeys,
      cacheEntries: newCache,
      failedCount,
      unknownStreak,
      queue: updatedQueue,
    };
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
