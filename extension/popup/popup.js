(function () {
  'use strict';

  const api = window.__KST__;
  const catalog = window.__KST_CATALOG__;
  const card = window.__KST_CARD__;
  const CACHE_KEY = 'kstCatalogCache';
  const COMPLETED_KEY = 'kstCompletedSeries';
  const PRIORITY_KEY = 'kstPrioritySeries';
  const THEME_KEY = 'kstTheme';
  const REQUEST_DELAY_MS = 350;
  const libraryUrl = 'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/';

  const summary = document.getElementById('summary');
  const status = document.getElementById('status');
  const seriesList = document.getElementById('seriesList');
  const popupSort = document.getElementById('popupSort');
  const checkVisibleBtn = document.getElementById('checkVisible');
  const checkSimpleBtn = document.getElementById('checkSimple');
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

  async function initTheme() {
    const data = await chrome.storage.local.get([THEME_KEY]);
    const theme = normalizeTheme(data[THEME_KEY]);
    setLocalTheme(theme);
    applyThemeToDocument(theme);
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
    const data = await chrome.storage.local.get([api.STORAGE_KEY, CACHE_KEY, COMPLETED_KEY, PRIORITY_KEY]);
    const scan = data[api.STORAGE_KEY] || null;
    if (scan && Array.isArray(scan.series)) {
      const cache = data[CACHE_KEY] || {};
      const completed = data[COMPLETED_KEY] || {};
      const priority = data[PRIORITY_KEY] || {};
      scan.series = scan.series
        .filter((s) => !completed[s.key])
        // 保存済みタイトルが二重エンコード（&amp;amp; 等）のまま残るケースを表示時に復号する。
        .map((s) => ({
          ...s,
          title: api.decodeHtmlEntities(s.title),
          catalog: cache[s.key] || null,
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
      summary.textContent = '未スキャン';
      seriesList.innerHTML =
        '<div class="empty">Kindle一覧を開いてから「全件取得」してください。</div>';
      checkVisibleBtn.disabled = true;
      checkSimpleBtn.disabled = true;
      return;
    }

    const groups = sortedSeries(scan.series || []);
    const totalItems = scan.totalItems ?? scan.items.length;
    summary.textContent = `${totalItems}冊 / ${groups.length}候補`;
    seriesList.textContent = '';
    checkVisibleBtn.disabled = !groups.some((group) => Number.isFinite(group.highestVolume));
    checkSimpleBtn.disabled = checkVisibleBtn.disabled;

    if (!groups.length) {
      seriesList.innerHTML =
        '<div class="empty">シリーズ候補が見つかりませんでした。タイトル表記が特殊な場合は今後の検出ルール追加対象です。</div>';
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
            <span class="badge priority-badge" hidden>優先</span>
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
          <a target="_blank" rel="noreferrer">Amazonで続刊を探す</a>
        </div>
      `;
      item.querySelector('strong').textContent = group.title;
      item.querySelector('.priority-badge').hidden = !group.priority;
      item.querySelector('.title-badges .badge:last-child').textContent = `${group.count}冊`;
      const image = item.querySelector('.thumbnail');
      if (thumbnailUrl) {
        image.src = thumbnailUrl;
        image.alt = offer?.title || group.catalog?.latestTitle || `${group.title} 最新刊`;
        image.hidden = false;
      }
      const meta = item.querySelector('.series-meta');
      meta.textContent = '';
      const author = document.createElement('span');
      author.textContent = group.author || '著者不明';
      meta.appendChild(author);
      meta.appendChild(document.createTextNode(' / '));
      const owned = document.createElement('span');
      owned.className = 'badge';
      owned.textContent = ownedText ? `所有 ${ownedText}` : '巻数未推定';
      meta.appendChild(owned);
      card.renderStatusBlock(item.querySelector('.catalog-status'), group.catalog, { completed: false });
      const checkBtn = item.querySelector('.check-next');
      checkBtn.textContent = group.catalog ? '再確認' : '続刊・価格確認';
      checkBtn.disabled = !Number.isFinite(group.highestVolume);
      checkBtn.title = Number.isFinite(group.highestVolume)
        ? 'Amazon検索結果から続刊と価格を照会します'
        : '巻数未推定のため照会できません';
      checkBtn.addEventListener('click', () => checkNext(group, checkBtn));
      item.querySelector('a').href = group.searchUrl;
      seriesList.appendChild(item);
    }

    if (groups.length > 80) {
      const rest = document.createElement('div');
      rest.className = 'empty';
      rest.textContent = `ほか ${groups.length - 80} 件。全シリーズ・欠番・続刊確認は「専用ページ」で。`;
      seriesList.appendChild(rest);
    }

    setStatus(`最終スキャン: ${formatScannedAt(scan.scannedAt)}`);
  }

  function displayedGroups(scan) {
    return sortedSeries(scan?.series || []).slice(0, 80);
  }

  async function probeSeries(group) {
    return card.probeSeries(catalog, group);
  }

  async function checkNext(group, button) {
    button.disabled = true;
    button.textContent = '照会中…';
    setStatus(`${group.title} の続刊と価格を確認しています…`);

    const result = await probeSeries(group);
    const data = await chrome.storage.local.get(CACHE_KEY);
    const cache = data[CACHE_KEY] || {};
    cache[group.key] = { ...result, checkedAt: Date.now() };
    await chrome.storage.local.set({ [CACHE_KEY]: cache });

    group.catalog = cache[group.key];
    render(currentScan);
    setStatus('続刊・価格の照会結果を保存しました。');
  }

  function fullTargets() {
    return displayedGroups(currentScan).filter((group) => Number.isFinite(group.highestVolume));
  }

  function simpleTargets() {
    return displayedGroups(currentScan).filter(
      (group) => Number.isFinite(group.highestVolume) && group.catalog?.status !== 'has-next'
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
      triggerButton.textContent = `${label}中… ${done}/${targets.length}`;
      setStatus(`${group.title} の続刊と価格を確認しています…`);
      cache[group.key] = { ...(await probeSeries(group)), checkedAt: Date.now() };
      group.catalog = cache[group.key];
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
    setStatus(`表示中 ${done} 件の${label}が完了しました。`);
  }

  // 簡易更新は前回スキャンのデータが基準になるため、未スキャン時は無効化する。
  async function refresh() {
    const scan = await getLastScan();
    render(scan);
    const hasItems = Array.isArray(scan?.items) && scan.items.length > 0;
    const simpleBtn = document.getElementById('scanSimple');
    simpleBtn.disabled = !hasItems;
    simpleBtn.title = hasItems
      ? '前回以降の新着だけを高速に取り込みます'
      : '先に「全件取得」を実行してください';
  }

  // アクティブタブが Kindle 一覧ページなら tab を返す。違えばステータス表示して null。
  async function getKindleTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith('https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll')) {
      setStatus('Kindle一覧ページを開いてから実行してください。');
      return null;
    }
    return tab;
  }

  function sendToTab(tabId, message) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: 'ページを再読み込み（F5）してから再試行してください。' });
          return;
        }
        resolve(response || { ok: false, error: '応答がありませんでした。' });
      });
    });
  }

  async function runScan(mode) {
    const tab = await getKindleTab();
    if (!tab) return;
    setStatus(mode === 'simple' ? '新着を確認しています…' : '全件取得を開始します…');
    const response = await sendToTab(tab.id, { type: 'kst:startScan', mode });
    if (!response.ok) {
      setStatus(response.error || 'スキャンに失敗しました。');
      return;
    }
    setStatus(mode === 'simple' ? '簡易更新が完了しました。' : '全件取得が完了しました。');
    await refresh();
  }

  // 保存データは最小書誌（title/authors なし）のため、明細エクスポートは
  // その場で全件をフル書誌として再取得してから出力する。
  async function exportBooks(kind) {
    const tab = await getKindleTab();
    if (!tab) return;
    setStatus('エクスポート用に全件を再取得しています…');
    const response = await sendToTab(tab.id, { type: 'kst:exportFetch' });
    if (!response.ok || !Array.isArray(response.books) || response.books.length === 0) {
      setStatus(response.error || '再取得に失敗しました。');
      return;
    }
    if (kind === 'csv') {
      downloadText('kindle-series-books.csv', 'text/csv;charset=utf-8', `﻿${api.toCsv(response.books)}`);
    } else {
      // items と series を同じ再取得結果から作り、JSON 内部の整合を保つ
      // （保存済み series は古い／未スキャン時は空になり得るため流用しない）。
      const payload = {
        scannedAt: Date.now(),
        items: response.books,
        series: api.buildSeriesSummary(response.books),
      };
      downloadText('kindle-series-books.json', 'application/json;charset=utf-8', JSON.stringify(payload, null, 2));
    }
    setStatus(`エクスポート完了（${response.books.length}冊）。`);
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
  checkVisibleBtn.addEventListener('click', () =>
    runBulkProbe(fullTargets(), {
      label: '再確認',
      emptyMessage: '再確認できるシリーズがありません。',
      triggerButton: checkVisibleBtn,
    })
  );
  checkSimpleBtn.addEventListener('click', () =>
    runBulkProbe(simpleTargets(), {
      label: '新刊チェック',
      emptyMessage: '新刊チェック対象なし',
      triggerButton: checkSimpleBtn,
    })
  );
  document.getElementById('exportCsv').addEventListener('click', () => exportBooks('csv'));
  document.getElementById('exportJson').addEventListener('click', () => exportBooks('json'));

  initTheme();
  refresh();
})();
