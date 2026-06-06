(function () {
  'use strict';

  const api = window.__KST__;
  const catalog = window.__KST_CATALOG__;
  const card = window.__KST_CARD__;
  const i18n = window.__KST_I18N__;
  const CACHE_KEY = 'kstCatalogCache';
  const COMPLETED_KEY = 'kstCompletedSeries';
  const PRIORITY_KEY = 'kstPrioritySeries';
  const EXCLUDED_KEY = 'kstExcludedSeries';
  const BG_BADGE_COUNT_KEY = 'kstBgBadgeCount';
  const THEME_KEY = 'kstTheme';
  const LANGUAGE_KEY = i18n.LANGUAGE_KEY;
  const REQUEST_DELAY_MS = 350;
  const libraryUrl = 'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/';

  let lang = 'ja';
  function t(key) {
    var args = Array.prototype.slice.call(arguments, 1);
    return i18n.translate.apply(null, [lang, key].concat(args));
  }

  const summary = document.getElementById('summary');
  const status = document.getElementById('status');
  const seriesList = document.getElementById('seriesList');
  const popupSort = document.getElementById('popupSort');
  const checkVisibleBtn = document.getElementById('checkVisible');
  const checkSimpleBtn = document.getElementById('checkSimple');
  const langToggle = document.getElementById('langToggle');
  let currentScan = null;

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

  function setStatus(message) {
    status.textContent = message || '';
  }

  function formatScannedAt(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${String(
      date.getHours()
    ).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function downloadText(filename, mimeType, text) {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function getLastScan() {
    const data = await chrome.storage.local.get([
      api.STORAGE_KEY,
      CACHE_KEY,
      COMPLETED_KEY,
      PRIORITY_KEY,
      EXCLUDED_KEY,
    ]);
    const scan = data[api.STORAGE_KEY] || null;
    if (scan && Array.isArray(scan.series)) {
      const cache = data[CACHE_KEY] || {};
      const completed = data[COMPLETED_KEY] || {};
      const priority = data[PRIORITY_KEY] || {};
      const excluded = data[EXCLUDED_KEY] || {};
      scan.series = scan.series
        .filter((s) => !completed[s.key])
        .filter((s) => !excluded[s.key])
        // 保存済みタイトルが二重エンコード（&amp;amp; 等）のまま残るケースを表示時に復号する。
        .map((s) => ({
          ...s,
          title: api.decodeHtmlEntities(s.title),
          catalog: card.reconcileCatalog(cache[s.key] || null, s.highestVolume),
          priority: !!priority[s.key],
        }));
    }
    return scan;
  }

  function sortedSeries(list) {
    const by = popupSort.value;
    return list.slice().sort((a, b) => {
      if (by === 'discount') {
        const d = card.discountValue(b.catalog) - card.discountValue(a.catalog);
        if (d !== 0) return d;
      }
      const p = Number(b.priority) - Number(a.priority);
      if (p !== 0) return p;
      return a.title.localeCompare(b.title, 'ja');
    });
  }

  function render(scan) {
    currentScan = scan;
    if (!scan) {
      summary.textContent = t('unscanned');
      seriesList.innerHTML =
        '<div class="empty">' + t('openLibraryPrompt') + '</div>';
      checkVisibleBtn.disabled = true;
      checkSimpleBtn.disabled = true;
      return;
    }

    const groups = sortedSeries(scan.series || []);
    const totalItems = scan.totalItems ?? scan.items.length;
    summary.textContent = t('scanSummaryPopup', totalItems, groups.length);
    seriesList.textContent = '';
    checkVisibleBtn.disabled = !groups.some((group) => Number.isFinite(group.highestVolume));
    checkSimpleBtn.disabled = checkVisibleBtn.disabled;

    if (!groups.length) {
      seriesList.innerHTML =
        '<div class="empty">' + t('noSeriesFound') + '</div>';
      checkVisibleBtn.disabled = true;
      checkSimpleBtn.disabled = true;
      return;
    }

    for (const group of groups.slice(0, 80)) {
      const item = document.createElement('article');
      item.className = 'series-item';
      if (group.priority) item.classList.add('priority');
      const ownedRanges = api.computeOwnedRanges(group.ownedVolumes || []);
      const ownedText = card.formatRanges(ownedRanges);
      const offer = card.resolvePrimaryOffer(group.catalog);
      const thumbnailUrl = offer?.thumbnailUrl || group.catalog?.latestThumbnailUrl || group.latestOwnedThumbnailUrl || '';
      item.innerHTML = `
        <div class="series-title">
          <strong></strong>
          <div class="title-badges">
            <span class="badge priority-badge" hidden></span>
            <span class="badge"></span>
          </div>
        </div>
        <div class="series-body">
          <img class="thumbnail" hidden alt="" loading="lazy" />
          <div>
            <div class="series-meta"></div>
            <div class="catalog-status"></div>
          </div>
        </div>
        <div class="series-actions">
          <button class="check-next" type="button"></button>
          <a target="_blank" rel="noreferrer"></a>
        </div>
      `;
      item.querySelector('strong').textContent = group.title;
      item.querySelector('.priority-badge').hidden = !group.priority;
      item.querySelector('.priority-badge').textContent = t('priorityBadge');
      item.querySelector('.title-badges .badge:last-child').textContent = t('bookCount', group.count);
      const image = item.querySelector('.thumbnail');
      if (thumbnailUrl) {
        image.src = thumbnailUrl;
        image.alt = offer?.title || group.catalog?.latestTitle || t('latestAlt', group.title);
        image.hidden = false;
      }
      const meta = item.querySelector('.series-meta');
      meta.textContent = '';
      const author = document.createElement('span');
      author.textContent = group.author || t('unknownAuthor');
      meta.appendChild(author);
      meta.appendChild(document.createTextNode(' / '));
      const owned = document.createElement('span');
      owned.className = 'badge';
      owned.textContent = ownedText ? t('ownedText', ownedText) : t('volumeUnknown');
      meta.appendChild(owned);
      card.renderStatusBlock(item.querySelector('.catalog-status'), group.catalog, { completed: false, lang });
      const checkBtn = item.querySelector('.check-next');
      checkBtn.textContent = group.catalog ? t('recheck') : t('checkNext');
      checkBtn.disabled = !Number.isFinite(group.highestVolume);
      checkBtn.title = Number.isFinite(group.highestVolume)
        ? t('checkNextTitle')
        : t('checkNextDisabledTitle');
      checkBtn.addEventListener('click', () => checkNext(group, checkBtn));
      item.querySelector('a').href = group.searchUrl;
      item.querySelector('a').textContent = t('searchAmazon');
      seriesList.appendChild(item);
    }

    if (groups.length > 80) {
      const rest = document.createElement('div');
      rest.className = 'empty';
      rest.textContent = t('moreItems', groups.length - 80);
      seriesList.appendChild(rest);
    }

    setStatus(t('lastScan', formatScannedAt(scan.scannedAt)));
  }

  function displayedGroups(scan) {
    return sortedSeries(scan?.series || []).slice(0, 80);
  }

  async function probeSeries(group) {
    return card.probeSeries(catalog, group);
  }

  async function checkNext(group, button) {
    button.disabled = true;
    button.textContent = t('checking');
    setStatus(t('checkingSeriesStatus', group.title));

    const result = await probeSeries(group);
    const data = await chrome.storage.local.get(CACHE_KEY);
    const cache = data[CACHE_KEY] || {};
    cache[group.key] = { ...result, checkedAt: Date.now() };
    await chrome.storage.local.set({ [CACHE_KEY]: cache });

    group.catalog = card.reconcileCatalog(cache[group.key], group.highestVolume);
    render(currentScan);
    setStatus(t('checkSaved'));
  }

  function fullTargets() {
    return displayedGroups(currentScan).filter((group) => Number.isFinite(group.highestVolume));
  }

  function simpleTargets() {
    return displayedGroups(currentScan).filter(
      (group) => Number.isFinite(group.highestVolume) && !card.isConfirmedHasNext(group.catalog)
    );
  }

  async function runBulkProbe(targets, options) {
    const label = options.label;
    const emptyMessage = options.emptyMessage;
    const triggerButton = options.triggerButton;
    if (targets.length === 0) {
      setStatus(emptyMessage);
      return;
    }

    const originalText = triggerButton.textContent;
    checkVisibleBtn.disabled = true;
    checkSimpleBtn.disabled = true;
    const rowButtons = Array.from(document.querySelectorAll('.check-next'));
    rowButtons.forEach((button) => {
      button.disabled = true;
    });

    const data = await chrome.storage.local.get(CACHE_KEY);
    const cache = data[CACHE_KEY] || {};

    let done = 0;
    for (const group of targets) {
      done += 1;
      triggerButton.textContent = t('bulkProgress', label, done, targets.length);
      setStatus(t('checkingSeriesStatus', group.title));
      cache[group.key] = { ...(await probeSeries(group)), checkedAt: Date.now() };
      group.catalog = card.reconcileCatalog(cache[group.key], group.highestVolume);
      if (done % 10 === 0) await chrome.storage.local.set({ [CACHE_KEY]: cache });
      if (done < targets.length) {
        await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
      }
    }

    await chrome.storage.local.set({ [CACHE_KEY]: cache });
    triggerButton.textContent = originalText;
    checkVisibleBtn.disabled = false;
    checkSimpleBtn.disabled = false;
    render(currentScan);
    setStatus(t('bulkDone', done, label));
  }

  async function refresh() {
    const scan = await getLastScan();
    render(scan);
    const hasItems = Array.isArray(scan?.items) && scan.items.length > 0;
    const simpleBtn = document.getElementById('scanSimple');
    simpleBtn.disabled = !hasItems;
    simpleBtn.title = hasItems
      ? t('simpleScanTitle')
      : t('simpleScanDisabledTitle');
  }

  async function getKindleTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith('https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll')) {
      setStatus(t('openLibraryFirst'));
      return null;
    }
    return tab;
  }

  function sendToTab(tabId, message) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: t('reloadPage') });
          return;
        }
        resolve(response || { ok: false, error: t('noResponse') });
      });
    });
  }

  async function runScan(mode) {
    const tab = await getKindleTab();
    if (!tab) return;
    setStatus(mode === 'simple' ? t('checkingNew') : t('startingFullScan'));
    const response = await sendToTab(tab.id, { type: 'kst:startScan', mode });
    if (!response.ok) {
      setStatus(response.error || t('scanFailed'));
      return;
    }
    setStatus(mode === 'simple' ? t('simpleScanDone') : t('fullScanDone'));
    await refresh();
  }

  async function exportBooks(kind) {
    const tab = await getKindleTab();
    if (!tab) return;
    setStatus(t('exportFetching'));
    const response = await sendToTab(tab.id, { type: 'kst:exportFetch' });
    if (!response.ok || !Array.isArray(response.books) || response.books.length === 0) {
      setStatus(response.error || t('exportFailed'));
      return;
    }
    if (kind === 'csv') {
      downloadText('kindle-series-books.csv', 'text/csv;charset=utf-8', `﻿${api.toCsv(response.books)}`);
    } else {
      const payload = {
        scannedAt: Date.now(),
        items: response.books,
        series: api.buildSeriesSummary(response.books),
      };
      downloadText('kindle-series-books.json', 'application/json;charset=utf-8', JSON.stringify(payload, null, 2));
    }
    setStatus(t('exportDone', response.books.length));
  }

  async function applyLang(value) {
    lang = i18n.normalizeLanguage(value);
    langToggle.value = lang;
    await chrome.storage.local.set({ [LANGUAGE_KEY]: lang });
    i18n.applyI18n(document, lang);
    render(currentScan);
  }

  document.getElementById('openLibrary').addEventListener('click', () => {
    chrome.tabs.create({ url: libraryUrl });
  });

  document.getElementById('openFullPage').addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
    }
  });

  document.getElementById('scanFull').addEventListener('click', () => runScan('full'));
  document.getElementById('scanSimple').addEventListener('click', () => runScan('simple'));
  popupSort.addEventListener('change', () => render(currentScan));
  langToggle.addEventListener('change', (e) => applyLang(e.target.value));
  checkVisibleBtn.addEventListener('click', () =>
    runBulkProbe(fullTargets(), {
      label: t('recheckLabel'),
      emptyMessage: t('noRecheckTargetsPopup'),
      triggerButton: checkVisibleBtn,
    })
  );
  checkSimpleBtn.addEventListener('click', () =>
    runBulkProbe(simpleTargets(), {
      label: t('newCheckLabel'),
      emptyMessage: t('noNewCheck'),
      triggerButton: checkSimpleBtn,
    })
  );
  document.getElementById('exportCsv').addEventListener('click', () => exportBooks('csv'));
  document.getElementById('exportJson').addEventListener('click', () => exportBooks('json'));

  async function init() {
    if (chrome.action?.setBadgeText) chrome.action.setBadgeText({ text: '' });
    chrome.storage.local.set({ [BG_BADGE_COUNT_KEY]: 0 });

    const data = await chrome.storage.local.get([THEME_KEY, LANGUAGE_KEY]);
    lang = i18n.normalizeLanguage(data[LANGUAGE_KEY]);
    langToggle.value = lang;
    i18n.applyI18n(document, lang);

    const theme = normalizeTheme(data[THEME_KEY]);
    setLocalTheme(theme);
    applyThemeToDocument(theme);

    await refresh();
  }

  init();
})();
