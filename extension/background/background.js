(function () {
  'use strict';

  const STORAGE_KEY = globalThis.__KST__?.STORAGE_KEY || 'kstLastScan';
  const CACHE_KEY = 'kstCatalogCache';
  const CATALOG_PRICE_VERSION_KEY = 'kstCatalogPriceVersion';
  const CATALOG_PRICE_VERSION = 7;
  const COMPLETED_KEY = 'kstCompletedSeries';
  const EXCLUDED_KEY = 'kstExcludedSeries';
  const BG_PROBE_ENABLED_KEY = 'kstBgProbeEnabled';
  const BG_PROBE_INTERVAL_KEY = 'kstBgProbeIntervalH';
  const BG_PROBE_QUEUE_KEY = 'kstBgProbeQueue';
  const BG_PROBE_LAST_RUN_KEY = 'kstBgProbeLastRunAt';
  const BG_PROBE_RUN_STATE_KEY = 'kstBgProbeRunState';
  const BG_PROBE_ENABLED_AT_KEY = 'kstBgProbeEnabledAt';
  const BG_BADGE_COUNT_KEY = 'kstBgBadgeCount';
  const ALARM_NAME = 'kstBgProbe';
  const CHUNK_SIZE = 8;
  const DEFAULT_INTERVAL_H = 24;
  const REQUEST_DELAY_MS = 350;

  const sidePanelApi = chrome['sidePanel'];
  if (sidePanelApi && typeof sidePanelApi.setPanelBehavior === 'function') {
    sidePanelApi
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((e) => console.error(e));
  }

  function storageGet(keys) {
    return chrome.storage.local.get(keys);
  }

  function storageSet(payload) {
    return chrome.storage.local.set(payload);
  }

  async function ensureCatalogPriceVersion() {
    const data = await storageGet(CATALOG_PRICE_VERSION_KEY);
    if (data[CATALOG_PRICE_VERSION_KEY] === CATALOG_PRICE_VERSION) return;
    await chrome.storage.local.remove(CACHE_KEY);
    await storageSet({ [CATALOG_PRICE_VERSION_KEY]: CATALOG_PRICE_VERSION });
  }

  function markBgProbeCompleted(runState) {
    const finishedAt = Date.now();
    return storageSet({
      [BG_PROBE_LAST_RUN_KEY]: finishedAt,
      [BG_PROBE_RUN_STATE_KEY]: {
        ...runState,
        status: 'completed',
        finishedAt,
      },
    });
  }

  function normalizeIntervalH(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_INTERVAL_H;
  }

  function getAlarm(name) {
    if (!chrome.alarms?.get) return Promise.resolve(null);
    return new Promise((resolve) => {
      try {
        chrome.alarms.get(name, (alarm) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(alarm || null);
        });
      } catch (_) {
        resolve(null);
      }
    });
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
      const periodInMinutes = intervalH * 60;
      const alarm = await getAlarm(ALARM_NAME);
      if (alarm?.periodInMinutes === periodInMinutes) return;
      await chrome.alarms.create(ALARM_NAME, { periodInMinutes });
    } else {
      await chrome.alarms.clear(ALARM_NAME);
    }
  }

  async function ensureBgProbeEnabledAt() {
    const data = await storageGet([BG_PROBE_ENABLED_KEY, BG_PROBE_ENABLED_AT_KEY]);
    if (data[BG_PROBE_ENABLED_KEY] !== true || Number(data[BG_PROBE_ENABLED_AT_KEY]) > 0) {
      return;
    }
    await storageSet({ [BG_PROBE_ENABLED_AT_KEY]: Date.now() });
  }

  async function maybeRunDueBgProbe() {
    const data = await storageGet([
      BG_PROBE_ENABLED_KEY,
      BG_PROBE_LAST_RUN_KEY,
      BG_PROBE_ENABLED_AT_KEY,
      BG_PROBE_INTERVAL_KEY,
    ]);
    if (data[BG_PROBE_ENABLED_KEY] !== true) return;
    const base = Number(data[BG_PROBE_LAST_RUN_KEY]) || Number(data[BG_PROBE_ENABLED_AT_KEY]) || 0;
    if (base <= 0) return;
    const intervalMs = normalizeIntervalH(data[BG_PROBE_INTERVAL_KEY]) * 60 * 60000;
    if (Date.now() >= base + intervalMs) await runBackgroundProbe();
  }

  async function handleWake() {
    await ensureCatalogPriceVersion();
    await reconcileAlarms();
    await ensureBgProbeEnabledAt();
    await maybeRunDueBgProbe();
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

  const offscreenApi = chrome['offscreen'];

  function shouldUseOffscreen() {
    return offscreenApi != null && typeof offscreenApi.createDocument === 'function';
  }

  async function ensureOffscreenDocument() {
    const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');
    if (typeof offscreenApi.hasDocument === 'function') {
      const hasDocument = await offscreenApi.hasDocument();
      if (hasDocument) return;
    }
    try {
      await offscreenApi.createDocument({
        url: offscreenUrl,
        reasons: ['DOM_PARSER'],
        justification: 'Parse Amazon search result HTML for background Kindle series checks.',
      });
    } catch (error) {
      if (!/Only a single offscreen document/i.test(String(error?.message || error))) throw error;
    }
  }

  async function closeOffscreenDocument() {
    if (typeof offscreenApi?.closeDocument !== 'function') return;
    try {
      await offscreenApi.closeDocument();
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
    let failedCount = 0;
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
        failedCount += 1;
        console.warn('[KST] background probe skipped', series?.key || series?.title, error);
      }
    }

    const updatedQueue = nextQueue(queue, chunk.length);
    await storageSet({
      [CACHE_KEY]: { ...prevCache, ...newCache },
      [BG_PROBE_QUEUE_KEY]: updatedQueue,
      [BG_BADGE_COUNT_KEY]: badgeCount,
    });
    return {
      done: true,
      badgeCount,
      cacheEntries: newCache,
      failedCount,
      queue: updatedQueue,
    };
  }

  async function runBackgroundProbeOnce() {
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
      await markBgProbeCompleted({
        startedAt: Date.now(),
        total: 0,
        processed: 0,
        succeeded: 0,
        failed: 0,
      });
      return;
    }

    let queue = currentQueue(data[BG_PROBE_QUEUE_KEY] || {}, eligible.length);
    let prevCache = data[CACHE_KEY] || {};
    let badgeCount = Number(data[BG_BADGE_COUNT_KEY]) || 0;
    const startedAt = Date.now();
    let processed = queue.cursor;
    let succeeded = queue.cursor;
    let failed = 0;
    let runState = {
      status: 'running',
      startedAt,
      total: eligible.length,
      processed,
      succeeded,
      failed,
    };
    await storageSet({ [BG_PROBE_RUN_STATE_KEY]: runState });
    const mode = shouldUseOffscreen() ? 'offscreen' : 'inline';
    console.log(
      '[KST] background probe cycle started: %d series (cursor %d, chunk %d, mode %s)',
      eligible.length, queue.cursor, CHUNK_SIZE, mode
    );
    const t0 = Date.now();

    try {
      if (mode === 'offscreen') await ensureOffscreenDocument();

      let processedThisRun = 0;
      do {
        const chunk = eligible.slice(queue.cursor, queue.cursor + CHUNK_SIZE);
        const response =
          mode === 'offscreen'
            ? await sendRuntimeMessage({
                type: 'kst:bgProbeChunk',
                chunk,
                prevCache,
                currentBadgeCount: badgeCount,
                queue,
              })
            : await probeInline(chunk, prevCache, badgeCount, queue);

        if (response?.done !== true) {
          throw new Error(response?.error || 'Background catalog probe chunk failed');
        }

        prevCache = { ...prevCache, ...(response.cacheEntries || {}) };
        badgeCount = Number(response.badgeCount) || 0;
        const chunkSucceeded = Object.keys(response.cacheEntries || {}).length;
        const chunkFailed = Number(response.failedCount) || 0;
        processed += chunk.length;
        succeeded += chunkSucceeded;
        failed += chunkFailed;
        queue = {
          ...(response.queue || nextQueue(queue, chunk.length)),
          eligibleLength: eligible.length,
        };
        processedThisRun += chunk.length;
        runState = {
          ...runState,
          processed: Math.min(processed, eligible.length),
          succeeded: Math.min(succeeded, eligible.length),
          failed,
        };
        await storageSet({ [BG_PROBE_RUN_STATE_KEY]: runState });

        if (queue.cursor !== 0 && processedThisRun < eligible.length) {
          await delay(REQUEST_DELAY_MS);
        }
      } while (queue.cursor !== 0 && processedThisRun < eligible.length);
    } catch (error) {
      await storageSet({
        [BG_PROBE_RUN_STATE_KEY]: {
          ...runState,
          status: 'failed',
          finishedAt: Date.now(),
        },
      });
      throw error;
    } finally {
      if (mode === 'offscreen') await closeOffscreenDocument();
    }

    await markBgProbeCompleted(runState);
    await setBadge(badgeCount);
    console.log(
      '[KST] background probe cycle done: %dms, badge=%d',
      Date.now() - t0, badgeCount
    );
  }

  let activeBgProbe = null;

  function runBackgroundProbe() {
    if (activeBgProbe) return activeBgProbe;
    activeBgProbe = runBackgroundProbeOnce().finally(() => {
      activeBgProbe = null;
    });
    return activeBgProbe;
  }

  if (chrome.runtime?.onInstalled) {
    chrome.runtime.onInstalled.addListener(() => {
      handleWake().catch((e) => console.warn('[KST] background wake failed', e));
    });
  }

  ensureCatalogPriceVersion().catch((e) =>
    console.warn('[KST] catalog price cache migration failed', e)
  );

  if (chrome.runtime?.onStartup) {
    chrome.runtime.onStartup.addListener(() => {
      handleWake().catch((e) => console.warn('[KST] background wake failed', e));
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
