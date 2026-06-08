(function () {
  'use strict';

  const STORAGE_KEY = globalThis.__KST__?.STORAGE_KEY || 'kstLastScan';
  const CACHE_KEY = 'kstCatalogCache';
  const COMPLETED_KEY = 'kstCompletedSeries';
  const EXCLUDED_KEY = 'kstExcludedSeries';
  const BG_PROBE_ENABLED_KEY = 'kstBgProbeEnabled';
  const BG_PROBE_INTERVAL_KEY = 'kstBgProbeIntervalH';
  const BG_PROBE_QUEUE_KEY = 'kstBgProbeQueue';
  const BG_PROBE_LAST_RUN_KEY = 'kstBgProbeLastRunAt';
  const BG_BADGE_COUNT_KEY = 'kstBgBadgeCount';
  const ALARM_NAME = 'kstBgProbe';
  const CHUNK_SIZE = 8;
  const DEFAULT_INTERVAL_H = 24;
  const REQUEST_DELAY_MS = 350;

  if (
    typeof chrome !== 'undefined' &&
    chrome.sidePanel &&
    typeof chrome.sidePanel.setPanelBehavior === 'function'
  ) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((e) => console.error(e));
  }

  function storageGet(keys) {
    return chrome.storage.local.get(keys);
  }

  function storageSet(payload) {
    return chrome.storage.local.set(payload);
  }

  function markBgProbeLastRun() {
    return storageSet({ [BG_PROBE_LAST_RUN_KEY]: Date.now() });
  }

  function normalizeIntervalH(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_INTERVAL_H;
  }

  async function setBadge(count) {
    if (!chrome.action?.setBadgeText) return;
    const badgeCount = Number(count) || 0;
    await chrome.action.setBadgeText({ text: badgeCount > 0 ? String(badgeCount) : '' });
    if (chrome.action.setBadgeBackgroundColor) {
      await chrome.action.setBadgeBackgroundColor({ color: '#c2410c' });
    }
  }

  async function reconcileAlarms() {
    if (!chrome.alarms) return;
    const data = await storageGet([BG_PROBE_ENABLED_KEY, BG_PROBE_INTERVAL_KEY]);
    if (data[BG_PROBE_ENABLED_KEY]) {
      const intervalH = normalizeIntervalH(data[BG_PROBE_INTERVAL_KEY]);
      await chrome.alarms.create(ALARM_NAME, { periodInMinutes: intervalH * 60 });
    } else {
      await chrome.alarms.clear(ALARM_NAME);
    }
  }

  function eligibleSeries(scan, completed, excluded) {
    return (Array.isArray(scan?.series) ? scan.series : [])
      .filter((s) => !completed[s.key] && !excluded[s.key] && Number.isFinite(s.highestVolume))
      .sort((a, b) => String(a.key || '').localeCompare(String(b.key || ''), 'ja'));
  }

  function currentQueue(queue, eligibleLength) {
    let cursor = Number.isFinite(queue?.cursor) ? queue.cursor : 0;
    let lastCycleAt = Number.isFinite(queue?.lastCycleAt) ? queue.lastCycleAt : 0;
    if (cursor < 0 || cursor >= eligibleLength) {
      cursor = 0;
      lastCycleAt = Date.now();
    }
    return { cursor, lastCycleAt, eligibleLength };
  }

  function nextQueue(queue, chunkLength) {
    let cursor = queue.cursor + chunkLength;
    let lastCycleAt = queue.lastCycleAt;
    if (cursor >= queue.eligibleLength) {
      cursor = 0;
      lastCycleAt = Date.now();
    }
    return { cursor, lastCycleAt };
  }

  function shouldUseOffscreen() {
    return typeof chrome.offscreen !== 'undefined' && typeof chrome.offscreen.createDocument === 'function';
  }

  async function ensureOffscreenDocument() {
    const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');
    if (typeof chrome.offscreen.hasDocument === 'function') {
      const hasDocument = await chrome.offscreen.hasDocument();
      if (hasDocument) return;
    }
    try {
      await chrome.offscreen.createDocument({
        url: offscreenUrl,
        reasons: ['DOM_PARSER'],
        justification: 'Parse Amazon search result HTML for background Kindle series checks.',
      });
    } catch (error) {
      if (!/Only a single offscreen document/i.test(String(error?.message || error))) throw error;
    }
  }

  async function closeOffscreenDocument() {
    if (typeof chrome.offscreen?.closeDocument !== 'function') return;
    try {
      await chrome.offscreen.closeDocument();
    } catch (_) {
      // The document may already be closed after a failed or canceled probe.
    }
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message));
        else resolve(response);
      });
    });
  }

  function badgeForResult(card, series, cacheEntry, prevEntry, currentCount) {
    let badgeCount = currentCount;
    const reconciled = card.reconcileCatalog(cacheEntry, series.highestVolume);
    const prevReconciled = card.reconcileCatalog(prevEntry, series.highestVolume);
    if (card.isConfirmedHasNext(reconciled) && !card.isConfirmedHasNext(prevReconciled)) {
      badgeCount += 1;
    }
    if (card.discountValue(reconciled) > 0 && card.discountValue(prevReconciled) <= 0) {
      badgeCount += 1;
    }
    return badgeCount;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function probeInline(chunk, prevCache, currentBadgeCount, queue) {
    const catalog = globalThis.__KST_CATALOG__;
    const card = globalThis.__KST_CARD__;
    const newCache = {};
    let badgeCount = Number(currentBadgeCount) || 0;
    let isFirst = true;

    for (const series of chunk) {
      if (!isFirst) await delay(REQUEST_DELAY_MS);
      isFirst = false;
      try {
        const result = await card.probeSeries(catalog, series);
        const cacheEntry = { ...result, checkedAt: Date.now() };
        newCache[series.key] = cacheEntry;
        badgeCount = badgeForResult(card, series, cacheEntry, prevCache[series.key], badgeCount);
      } catch (error) {
        console.warn('[KST] background probe skipped', series?.key || series?.title, error);
      }
    }

    await storageSet({
      [CACHE_KEY]: { ...prevCache, ...newCache },
      [BG_PROBE_QUEUE_KEY]: nextQueue(queue, chunk.length),
      [BG_BADGE_COUNT_KEY]: badgeCount,
    });
    return { done: true, badgeCount };
  }

  async function runBackgroundProbe() {
    const data = await storageGet([
      BG_PROBE_ENABLED_KEY,
      STORAGE_KEY,
      COMPLETED_KEY,
      EXCLUDED_KEY,
      CACHE_KEY,
      BG_PROBE_QUEUE_KEY,
      BG_BADGE_COUNT_KEY,
    ]);
    if (!data[BG_PROBE_ENABLED_KEY]) return;

    const completed = data[COMPLETED_KEY] || {};
    const excluded = data[EXCLUDED_KEY] || {};
    const eligible = eligibleSeries(data[STORAGE_KEY], completed, excluded);
    if (eligible.length === 0) {
      console.log('[KST] background probe: no eligible series');
      await storageSet({ [BG_PROBE_QUEUE_KEY]: { cursor: 0, lastCycleAt: Date.now() } });
      await setBadge(data[BG_BADGE_COUNT_KEY]);
      await markBgProbeLastRun();
      return;
    }

    const queue = currentQueue(data[BG_PROBE_QUEUE_KEY] || {}, eligible.length);
    const chunk = eligible.slice(queue.cursor, queue.cursor + CHUNK_SIZE);
    const prevCache = data[CACHE_KEY] || {};
    const currentBadgeCount = Number(data[BG_BADGE_COUNT_KEY]) || 0;
    const mode = shouldUseOffscreen() ? 'offscreen' : 'inline';
    console.log(
      '[KST] background probe started: %d/%d series (cursor %d, chunk %d, mode %s)',
      chunk.length, eligible.length, queue.cursor, CHUNK_SIZE, mode
    );
    const t0 = Date.now();
    let response;

    if (mode === 'offscreen') {
      try {
        await ensureOffscreenDocument();
        response = await sendRuntimeMessage({
          type: 'kst:bgProbeChunk',
          chunk,
          prevCache,
          currentBadgeCount,
          queue,
        });
      } finally {
        await closeOffscreenDocument();
      }
    } else {
      response = await probeInline(chunk, prevCache, currentBadgeCount, queue);
    }

    const badgeCount = Number(response?.badgeCount) || 0;
    await setBadge(badgeCount);
    await markBgProbeLastRun();
    console.log(
      '[KST] background probe done: %dms, badge=%d',
      Date.now() - t0, badgeCount
    );
  }

  if (chrome.runtime?.onInstalled) {
    chrome.runtime.onInstalled.addListener(() => {
      reconcileAlarms().catch((e) => console.warn('[KST] alarm reconcile failed', e));
    });
  }

  if (chrome.runtime?.onStartup) {
    chrome.runtime.onStartup.addListener(() => {
      reconcileAlarms().catch((e) => console.warn('[KST] alarm reconcile failed', e));
    });
  }

  if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (
        areaName === 'local' &&
        (changes[BG_PROBE_ENABLED_KEY] || changes[BG_PROBE_INTERVAL_KEY])
      ) {
        reconcileAlarms().catch((e) => console.warn('[KST] alarm reconcile failed', e));
      }
    });
  }

  if (chrome.alarms?.onAlarm) {
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm?.name !== ALARM_NAME) return;
      runBackgroundProbe().catch((e) => console.warn('[KST] background probe failed', e));
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'kst:reconcileAlarms') {
      reconcileAlarms()
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
      return true;
    }

    if (message?.type === 'kst:bgProbeResult') {
      setBadge(message.badgeCount)
        .then(() => closeOffscreenDocument())
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
      return true;
    }

    return false;
  });
})();
