(function () {
  'use strict';

  const api = window.__KST__;
  const catalog = window.__KST_CATALOG__;
  const card = window.__KST_CARD__;
  const i18n = window.__KST_I18N__;
  const CACHE_KEY = 'kstCatalogCache';
  const COMPLETED_KEY = 'kstCompletedSeries'; // 手動の完結フラグ { [seriesKey]: true }
  const PRIORITY_KEY = 'kstPrioritySeries'; // 優先表示フラグ { [seriesKey]: true }
  const EXCLUDED_KEY = 'kstExcludedSeries'; // 除外フラグ { [seriesKey]: true }
  const SEARCH_CONDITIONS_KEY = 'kstOptionsSearchConditions';
  const AUTO_SCAN_ENABLED_KEY = 'kstAutoScanEnabled';
  const AUTO_SCAN_INTERVAL_KEY = 'kstAutoScanIntervalD';
  const BG_PROBE_ENABLED_KEY = 'kstBgProbeEnabled';
  const BG_PROBE_INTERVAL_KEY = 'kstBgProbeIntervalH';
  const THEME_KEY = 'kstTheme';
  const LANGUAGE_KEY = i18n.LANGUAGE_KEY;
  const REQUEST_DELAY_MS = 350; // 一括照会の間隔（throttle/403 回避）
  let bulkAbort = false; // 一括照会のキャンセルフラグ
  let lang = 'ja';
  function t(key) {
    var args = Array.prototype.slice.call(arguments, 1);
    return i18n.translate.apply(null, [lang, key].concat(args));
  }

  const els = {
    summary: document.getElementById('summary'),
    search: document.getElementById('search'),
    sort: document.getElementById('sort'),
    filterMissing: document.getElementById('filterMissing'),
    filterPriority: document.getElementById('filterPriority'),
    filterStatus: document.getElementById('filterStatus'),
    filterHideCompleted: document.getElementById('filterHideCompleted'),
    filterExcluded: document.getElementById('filterExcluded'),
    filterSale: document.getElementById('filterSale'),
    checkVisible: document.getElementById('checkVisible'),
    checkSimple: document.getElementById('checkSimple'),
    clearCache: document.getElementById('clearCache'),
    clearScan: document.getElementById('clearScan'),
    autoScanEnabled: document.getElementById('autoScanEnabled'),
    autoScanInterval: document.getElementById('autoScanInterval'),
    bgProbeEnabled: document.getElementById('bgProbeEnabled'),
    bgProbeInterval: document.getElementById('bgProbeInterval'),
    themeToggle: document.getElementById('themeToggle'),
    langToggle: document.getElementById('langToggle'),
    list: document.getElementById('list'),
    topLink: document.querySelector('.top-link'),
  };

  let series = []; // 表示用ビューモデル（ownedRanges / missing を付与）
  let cache = {}; // seriesKey -> { status, nextVolume, nextTitle, nextUrl, checkedAt }
  let completed = {}; // seriesKey -> true（手動完結フラグ）
  let priority = {}; // seriesKey -> true（優先表示フラグ）
  let excluded = {}; // seriesKey -> true（除外フラグ）
  let baseSummary = ''; // クリア後などに戻す件数表示

  function normalizeTheme(value) {
    return window.__KST_THEME__?.normalizeTheme(value)
      || (['light', 'dark', 'auto'].includes(value) ? value : 'auto');
  }

  function applyThemeToDocument(value) {
    if (window.__KST_THEME__?.applyThemeToDocument) {
      return window.__KST_THEME__.applyThemeToDocument(value);
    }
    const theme = normalizeTheme(value);
    if (theme === 'auto') {
      delete document.documentElement.dataset.theme;
      document.documentElement.style.colorScheme = '';
    } else {
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    }
    return theme;
  }

  function setLocalTheme(value) {
    try {
      localStorage.setItem(THEME_KEY, value);
    } catch (_) {
      // localStorage が使えない環境でも chrome.storage.local を正本にする。
    }
  }

  async function applyTheme(value) {
    const theme = normalizeTheme(value);
    setLocalTheme(theme);
    await chrome.storage.local.set({ [THEME_KEY]: theme });
    applyThemeToDocument(theme);
    els.themeToggle.value = theme;
  }

  async function applyLang(value) {
    lang = i18n.normalizeLanguage(value);
    els.langToggle.value = lang;
    await chrome.storage.local.set({ [LANGUAGE_KEY]: lang });
    i18n.applyI18n(document, lang);
    render();
  }

  function selectValue(select, value, fallback) {
    const exists = Array.from(select.options).some((option) => option.value === value);
    select.value = exists ? value : fallback;
  }

  function currentSearchConditions() {
    return {
      search: els.search.value,
      sort: els.sort.value,
      filterMissing: els.filterMissing.checked,
      filterPriority: els.filterPriority.checked,
      filterStatus: els.filterStatus.value,
      filterHideCompleted: els.filterHideCompleted.checked,
      filterExcluded: els.filterExcluded.checked,
      filterSale: els.filterSale.checked,
    };
  }

  function applySearchConditions(value) {
    if (!value || typeof value !== 'object') return;
    els.search.value = typeof value.search === 'string' ? value.search : '';
    selectValue(els.sort, value.sort, 'discount');
    selectValue(els.filterStatus, value.filterStatus, 'all');
    els.filterMissing.checked = value.filterMissing === true;
    els.filterPriority.checked = value.filterPriority === true;
    els.filterHideCompleted.checked = value.filterHideCompleted === true;
    els.filterExcluded.checked = value.filterExcluded === true;
    els.filterSale.checked = value.filterSale === true;
  }

  function saveSearchConditions() {
    chrome.storage.local.set({ [SEARCH_CONDITIONS_KEY]: currentSearchConditions() });
  }

  function handleSearchConditionsChange() {
    render();
    saveSearchConditions();
  }

  function applyAutomationSettings(data) {
    els.autoScanEnabled.checked = data[AUTO_SCAN_ENABLED_KEY] === true;
    selectValue(els.autoScanInterval, String(data[AUTO_SCAN_INTERVAL_KEY] || 7), '7');
    els.bgProbeEnabled.checked = data[BG_PROBE_ENABLED_KEY] === true;
    selectValue(els.bgProbeInterval, String(data[BG_PROBE_INTERVAL_KEY] || 24), '24');
  }

  function reconcileAlarms() {
    chrome.runtime.sendMessage({ type: 'kst:reconcileAlarms' }, () => {
      if (chrome.runtime.lastError) {
        console.warn('[KST] alarm reconcile message failed', chrome.runtime.lastError.message);
      }
    });
  }

  async function saveAutomationSetting(key, value) {
    await chrome.storage.local.set({ [key]: value });
    reconcileAlarms();
  }

  async function load() {
    const data = await chrome.storage.local.get([
      api.STORAGE_KEY,
      CACHE_KEY,
      COMPLETED_KEY,
      PRIORITY_KEY,
      EXCLUDED_KEY,
    ]);
    const scan = data[api.STORAGE_KEY];
    cache = data[CACHE_KEY] || {};
    completed = data[COMPLETED_KEY] || {};
    priority = data[PRIORITY_KEY] || {};
    excluded = data[EXCLUDED_KEY] || {};

    if (!scan || (!Array.isArray(scan.series) && !Array.isArray(scan.items))) {
      series = [];
      baseSummary = t('unscannerPrompt');
      els.summary.textContent = baseSummary;
      render();
      return;
    }

    series = seriesFromScan(scan).map((s) => ({
      ...s,
      ranges: api.computeOwnedRanges(s.ownedVolumes || []),
      missing: api.computeMissingVolumes(s.ownedVolumes || []),
    }));

    const total = scan.totalItems ?? (scan.items ? scan.items.length : 0);
    baseSummary = t('scanSummaryOptions', total, series.length);
    els.summary.textContent = baseSummary;
    render();
  }

  // 表示・判定はすべて reconcile 済みビューを通す（生 cache を直接参照しない）。
  function catalogFor(s) {
    return card.reconcileCatalog(cache[s.key], s.highestVolume);
  }

  function passesFilter(s) {
    const q = els.search.value.trim();
    if (q && !`${s.title} ${s.author || ''}`.includes(q)) return false;
    if (els.filterMissing.checked && s.missing.length === 0) return false;
    if (els.filterPriority.checked && !priority[s.key]) return false;
    const filterStatus = els.filterStatus.value;
    if (filterStatus !== 'all') {
      if (completed[s.key]) return false;
      const cached = catalogFor(s);
      if (filterStatus === 'has-next' && cached?.status !== 'has-next') return false;
      if (filterStatus === 'no-next' && cached?.status !== 'no-next') return false;
      if (filterStatus === 'unchecked' && cached) return false;
    }
    if (els.filterHideCompleted.checked && completed[s.key]) return false;
    if (els.filterExcluded.checked && excluded[s.key]) return false;
    if (els.filterSale.checked && card.discountValue(catalogFor(s)) <= 0) return false;
    return true;
  }

  function sortSeries(list) {
    const by = els.sort.value;
    return list.slice().sort((a, b) => {
      if (by === 'volume') return (b.highestVolume || 0) - (a.highestVolume || 0);
      if (by === 'title') return a.title.localeCompare(b.title, 'ja');
      if (by === 'discount') {
        const d = card.discountValue(catalogFor(b)) - card.discountValue(catalogFor(a));
        if (d !== 0) return d;
        return a.title.localeCompare(b.title, 'ja');
      }
      if ((b.count || 0) !== (a.count || 0)) return (b.count || 0) - (a.count || 0);
      return a.title.localeCompare(b.title, 'ja');
    });
  }

  function currentList() {
    return sortSeries(series.filter(passesFilter));
  }

  function seriesFromScan(scan) {
    const savedSeries = Array.isArray(scan.series) ? scan.series : [];
    const rebuiltSeries = Array.isArray(scan.items)
      ? api.summarizeNormalizedBooks(scan.items)
      : savedSeries;
    const savedByKey = new Map(savedSeries.map((s) => [s.key, s]));
    return rebuiltSeries.map((s) => {
      const saved = savedByKey.get(s.key);
      return {
        ...s,
        latestOwnedThumbnailUrl: s.latestOwnedThumbnailUrl || saved?.latestOwnedThumbnailUrl || '',
      };
    });
  }

  function render() {
    const filtered = currentList();
    els.list.textContent = '';

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = series.length
        ? t('noFilteredSeries')
        : t('noSeries');
      els.list.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    for (const s of filtered) frag.appendChild(rowEl(s));
    els.list.appendChild(frag);
  }

  function rowEl(s) {
    const row = document.createElement('article');
    row.className = 'series';
    if (completed[s.key]) row.classList.add('completed');
    if (priority[s.key]) row.classList.add('priority');
    if (excluded[s.key]) row.classList.add('excluded');
    const cached = catalogFor(s);
    if (cached?.status === 'has-next') row.classList.add('has-next');
    if (card.discountValue(cached) > 0) row.classList.add('on-sale');
    const offer = card.resolvePrimaryOffer(cached);
    const thumbnailUrl = offer?.thumbnailUrl || cached?.latestThumbnailUrl || s.latestOwnedThumbnailUrl || '';
    if (thumbnailUrl) row.classList.add('has-thumbnail');

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = s.title;
    row.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'actions';

    const priorityBtn = document.createElement('button');
    priorityBtn.type = 'button';
    priorityBtn.className = 'secondary priority-btn';
    priorityBtn.textContent = priority[s.key] ? t('priorityOff') : t('priorityOn');
    priorityBtn.addEventListener('click', () => togglePriority(s));
    actions.appendChild(priorityBtn);

    const checkBtn = document.createElement('button');
    checkBtn.type = 'button';
    checkBtn.className = 'secondary';
    checkBtn.textContent = cached ? t('recheckBtn') : t('checkNextBtn');
    checkBtn.disabled = !!completed[s.key];
    checkBtn.addEventListener('click', () => checkNext(s, checkBtn));
    actions.appendChild(checkBtn);

    const completeBtn = document.createElement('button');
    completeBtn.type = 'button';
    completeBtn.className = 'secondary complete-btn';
    completeBtn.textContent = completed[s.key] ? t('completeOff') : t('completeOn');
    if (!completed[s.key] && cached?.status === 'has-next') {
      completeBtn.disabled = true;
      completeBtn.title = t('cannotCompleteHasNext');
    }
    completeBtn.addEventListener('click', () => toggleCompleted(s));
    actions.appendChild(completeBtn);

    const excludeBtn = document.createElement('button');
    excludeBtn.type = 'button';
    excludeBtn.className = 'secondary exclude-btn';
    excludeBtn.textContent = excluded[s.key] ? t('excludeOff') : t('excludeOn');
    excludeBtn.addEventListener('click', () => toggleExcluded(s));
    actions.appendChild(excludeBtn);

    const searchLink = document.createElement('a');
    searchLink.href = s.searchUrl;
    searchLink.target = '_blank';
    searchLink.rel = 'noreferrer';
    searchLink.textContent = t('searchAmazonOptions');
    actions.appendChild(searchLink);

    row.appendChild(actions);

    if (thumbnailUrl) {
      const img = document.createElement('img');
      img.className = 'thumbnail';
      img.src = thumbnailUrl;
      img.alt = offer?.title || cached?.latestTitle || s.title;
      img.loading = 'lazy';
      row.appendChild(img);
    }

    const meta = document.createElement('div');
    meta.className = 'meta';

    const author = document.createElement('span');
    author.textContent = s.author || t('unknownAuthor');
    meta.appendChild(author);

    const owned = document.createElement('span');
    owned.className = 'badge';
    owned.textContent = s.ranges.length ? t('ownedText', card.formatRanges(s.ranges)) : t('volumeUnknown');
    meta.appendChild(owned);

    if (s.missing.length) {
      const miss = document.createElement('span');
      miss.className = 'badge missing';
      miss.textContent = t('missingText', card.formatRanges(api.computeOwnedRanges(s.missing)));
      meta.appendChild(miss);
    }

    if (priority[s.key]) {
      const priorityBadge = document.createElement('span');
      priorityBadge.className = 'badge priority';
      priorityBadge.textContent = t('priorityBadge');
      meta.appendChild(priorityBadge);
    }

    const statusBlock = document.createElement('span');
    statusBlock.className = 'next-result';
    card.renderStatusBlock(statusBlock, cached, { completed: completed[s.key], lang });
    meta.appendChild(statusBlock);

    row.appendChild(meta);
    return row;
  }

  async function togglePriority(s) {
    if (priority[s.key]) {
      delete priority[s.key];
    } else {
      priority[s.key] = true;
    }
    await chrome.storage.local.set({ [PRIORITY_KEY]: priority });
    render();
  }

  async function toggleExcluded(s) {
    if (excluded[s.key]) {
      delete excluded[s.key];
    } else {
      excluded[s.key] = true;
    }
    await chrome.storage.local.set({ [EXCLUDED_KEY]: excluded });
    render();
  }

  async function toggleCompleted(s) {
    if (!completed[s.key] && catalogFor(s)?.status === 'has-next') return;
    if (completed[s.key]) {
      delete completed[s.key];
    } else {
      completed[s.key] = true;
    }
    await chrome.storage.local.set({ [COMPLETED_KEY]: completed });
    render();
  }

  async function probeSeries(s) {
    return card.probeSeries(catalog, s);
  }

  async function checkNext(s, btn) {
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('checkingIcon');
    }
    const result = await probeSeries(s);
    cache[s.key] = { ...result, checkedAt: Date.now() };
    await chrome.storage.local.set({ [CACHE_KEY]: cache });
    if (btn) {
      btn.disabled = false;
      btn.textContent = t('recheckIcon');
    }
    render();
  }

  function fullTargets() {
    return currentList().filter((s) => !completed[s.key] && !excluded[s.key]);
  }

  function simpleTargets() {
    return currentList().filter(
      (s) => !completed[s.key] && !excluded[s.key] && !card.isConfirmedHasNext(catalogFor(s))
    );
  }

  async function runBulkProbe(targets, options) {
    const label = options.label;
    const triggerButton = options.triggerButton;
    const triggerStart = options.triggerStart;
    const triggerIdle = options.triggerIdle;
    const emptyMessage = options.emptyMessage;
    if (targets.length === 0) {
      els.summary.textContent = emptyMessage;
      return;
    }

    bulkAbort = false;
    triggerButton.textContent = t('abortBtn');
    triggerButton.removeEventListener('click', triggerStart);
    triggerButton.addEventListener('click', abortBulk);
    els.checkVisible.disabled = triggerButton !== els.checkVisible;
    els.checkSimple.disabled = triggerButton !== els.checkSimple;

    let done = 0;
    for (const s of targets) {
      if (bulkAbort) break;
      done += 1;
      els.summary.textContent = t('bulkProgress', label, done, targets.length);
      cache[s.key] = { ...(await probeSeries(s)), checkedAt: Date.now() };
      if (done % 20 === 0) await chrome.storage.local.set({ [CACHE_KEY]: cache });
      if (done % 5 === 0) render();
      if (done < targets.length) {
        await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
      }
    }
    await chrome.storage.local.set({ [CACHE_KEY]: cache });

    triggerButton.removeEventListener('click', abortBulk);
    triggerButton.addEventListener('click', triggerStart);
    triggerButton.textContent = triggerIdle;
    els.checkVisible.disabled = false;
    els.checkSimple.disabled = false;
    render();

    let msg = t('bulkSummaryMsg', series.length, done, label);
    if (bulkAbort) msg += t('bulkAborted');
    els.summary.textContent = msg;
  }

  function startFullBulk() {
    runBulkProbe(fullTargets(), {
      label: t('recheckLabel'),
      triggerButton: els.checkVisible,
      triggerStart: startFullBulk,
      triggerIdle: t('checkAllBtn'),
      emptyMessage: t('noRecheckTargetsOptions'),
    });
  }

  function startSimpleBulk() {
    runBulkProbe(simpleTargets(), {
      label: t('newCheckLabel'),
      triggerButton: els.checkSimple,
      triggerStart: startSimpleBulk,
      triggerIdle: t('newCheckBtn'),
      emptyMessage: t('noNewCheck'),
    });
  }

  function abortBulk() {
    bulkAbort = true;
  }

  function scrollToTop(event) {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function clearCache() {
    if (!confirm(t('confirmClearCache'))) return;
    cache = {};
    await chrome.storage.local.remove(CACHE_KEY);
    render();
    els.summary.textContent = t('cacheCleared', baseSummary);
  }

  async function clearScan() {
    if (!confirm(t('confirmClearScan'))) return;
    await chrome.storage.local.remove([api.STORAGE_KEY, api.PROGRESS_KEY]);
    await load();
    els.summary.textContent = t('scanCleared');
  }

  els.search.addEventListener('input', handleSearchConditionsChange);
  els.sort.addEventListener('change', handleSearchConditionsChange);
  els.filterMissing.addEventListener('change', handleSearchConditionsChange);
  els.filterPriority.addEventListener('change', handleSearchConditionsChange);
  els.filterStatus.addEventListener('change', handleSearchConditionsChange);
  els.filterHideCompleted.addEventListener('change', handleSearchConditionsChange);
  els.filterExcluded.addEventListener('change', handleSearchConditionsChange);
  els.filterSale.addEventListener('change', handleSearchConditionsChange);
  els.checkVisible.addEventListener('click', startFullBulk);
  els.checkSimple.addEventListener('click', startSimpleBulk);
  els.clearCache.addEventListener('click', clearCache);
  els.clearScan.addEventListener('click', clearScan);
  els.autoScanEnabled.addEventListener('change', () =>
    saveAutomationSetting(AUTO_SCAN_ENABLED_KEY, els.autoScanEnabled.checked)
  );
  els.autoScanInterval.addEventListener('change', () =>
    saveAutomationSetting(AUTO_SCAN_INTERVAL_KEY, Number(els.autoScanInterval.value))
  );
  els.bgProbeEnabled.addEventListener('change', () =>
    saveAutomationSetting(BG_PROBE_ENABLED_KEY, els.bgProbeEnabled.checked)
  );
  els.bgProbeInterval.addEventListener('change', () =>
    saveAutomationSetting(BG_PROBE_INTERVAL_KEY, Number(els.bgProbeInterval.value))
  );
  els.themeToggle.addEventListener('change', () => applyTheme(els.themeToggle.value));
  els.langToggle.addEventListener('change', (e) => applyLang(e.target.value));
  if (els.topLink) els.topLink.addEventListener('click', scrollToTop);

  async function init() {
    const data = await chrome.storage.local.get([
      THEME_KEY,
      LANGUAGE_KEY,
      SEARCH_CONDITIONS_KEY,
      AUTO_SCAN_ENABLED_KEY,
      AUTO_SCAN_INTERVAL_KEY,
      BG_PROBE_ENABLED_KEY,
      BG_PROBE_INTERVAL_KEY,
    ]);

    lang = i18n.normalizeLanguage(data[LANGUAGE_KEY]);
    els.langToggle.value = lang;
    i18n.applyI18n(document, lang);

    const theme = normalizeTheme(data[THEME_KEY]);
    els.themeToggle.value = theme;
    setLocalTheme(theme);
    applyThemeToDocument(theme);

    applySearchConditions(data[SEARCH_CONDITIONS_KEY]);
    applyAutomationSettings(data);
    await load();
  }

  init();
})();
