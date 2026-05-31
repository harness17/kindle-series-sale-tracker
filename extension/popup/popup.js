(function () {
  'use strict';

  const api = window.__KST__;
  const catalog = window.__KST_CATALOG__;
  const CACHE_KEY = 'kstCatalogCache';
  const COMPLETED_KEY = 'kstCompletedSeries';
  const PRIORITY_KEY = 'kstPrioritySeries';
  const REQUEST_DELAY_MS = 350;
  const libraryUrl = 'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/';

  const summary = document.getElementById('summary');
  const status = document.getElementById('status');
  const seriesList = document.getElementById('seriesList');
  const checkVisibleBtn = document.getElementById('checkVisible');
  let currentScan = null;

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

  function formatRanges(ranges) {
    return ranges.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ');
  }

  function seriesSearchUrl(seriesKey, author) {
    const query = encodeURIComponent(`${seriesKey} ${author ? `${author} ` : ''}Kindle`);
    return `https://www.amazon.co.jp/s?k=${query}&i=digital-text`;
  }

  function withClosingDashSeriesKey(seriesKey) {
    const value = String(seriesKey || '').trim();
    if (!value || /[-‐－―—]$/.test(value)) return '';
    return /\s[-‐－―—]\S/.test(value) ? `${value}-` : '';
  }

  function renderCatalogStatus(el, cached) {
    el.textContent = '';
    if (!cached) {
      el.textContent = '未照会';
      return;
    }

    if (cached.latestVolume && cached.latestReleaseDate) {
      const latest = document.createElement('span');
      latest.textContent = `最新刊: ${cached.latestVolume}巻 ${cached.latestReleaseDate}`;
      el.appendChild(latest);
      el.appendChild(document.createTextNode(' / '));
    }

    if (cached.latestPriceText) {
      const discount = cached.latestDiscountRate ? ` ${cached.latestDiscountRate}%OFF` : '';
      const price = document.createElement('span');
      price.className = cached.latestDiscountRate ? 'sale-text' : '';
      price.textContent = `価格: ${cached.latestPriceText}${discount}`;
      el.appendChild(price);
      el.appendChild(document.createTextNode(' / '));
    }

    if (cached.status === 'has-next') {
      el.appendChild(document.createTextNode(`続刊あり: ${cached.nextVolume}巻`));
      if (cached.nextUrl) {
        const link = document.createElement('a');
        link.href = cached.nextUrl;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.textContent = cached.nextTitle || '購入ページ';
        el.appendChild(document.createTextNode(' '));
        el.appendChild(link);
      }
    } else if (cached.status === 'no-next') {
      el.appendChild(document.createTextNode('続刊なし（自動判定）'));
    } else {
      el.appendChild(document.createTextNode('判定不能'));
    }
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
        .map((s) => ({ ...s, catalog: cache[s.key] || null, priority: !!priority[s.key] }))
        .sort((a, b) => Number(b.priority) - Number(a.priority));
    }
    return scan;
  }

  function render(scan) {
    currentScan = scan;
    if (!scan) {
      summary.textContent = '未スキャン';
      seriesList.innerHTML =
        '<div class="empty">Kindle一覧を開いてから「全件取得」してください。</div>';
      checkVisibleBtn.disabled = true;
      return;
    }

    const totalItems = scan.totalItems ?? scan.items.length;
    summary.textContent = `${totalItems}冊 / ${scan.series.length}候補`;
    seriesList.textContent = '';
    checkVisibleBtn.disabled = !scan.series.some((group) => Number.isFinite(group.highestVolume));

    if (!scan.series.length) {
      seriesList.innerHTML =
        '<div class="empty">シリーズ候補が見つかりませんでした。タイトル表記が特殊な場合は今後の検出ルール追加対象です。</div>';
      checkVisibleBtn.disabled = true;
      return;
    }

    for (const group of scan.series.slice(0, 80)) {
      const item = document.createElement('article');
      item.className = 'series-item';
      if (group.priority) item.classList.add('priority');
      const ownedRanges = api.computeOwnedRanges(group.ownedVolumes || []);
      const ownedText = formatRanges(ownedRanges);
      const thumbnailUrl = group.catalog?.latestThumbnailUrl || group.latestOwnedThumbnailUrl || '';
      const volumeText = group.highestVolume && ownedText
        ? `所有: ${ownedText} / 次候補: ${group.nextVolume}巻`
        : '巻数未推定';
      item.innerHTML = `
        <div class="series-title">
          <strong></strong>
          <div class="title-badges">
            <span class="badge priority-badge" hidden>優先</span>
            <span class="badge">${group.count}冊</span>
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
      const image = item.querySelector('.thumbnail');
      if (thumbnailUrl) {
        image.src = thumbnailUrl;
        image.alt = group.catalog?.latestTitle || `${group.title} 最新刊`;
        image.hidden = false;
      }
      item.querySelector('.series-meta').textContent = `${group.author || '著者不明'} / ${volumeText}`;
      renderCatalogStatus(item.querySelector('.catalog-status'), group.catalog);
      const checkBtn = item.querySelector('.check-next');
      checkBtn.textContent = group.catalog ? '再確認' : '続刊・価格確認';
      checkBtn.disabled = !Number.isFinite(group.highestVolume);
      checkBtn.title = Number.isFinite(group.highestVolume)
        ? 'Amazon検索結果から続刊と価格を照会します'
        : '巻数未推定のため照会できません';
      checkBtn.addEventListener('click', () => checkNext(group, item, checkBtn));
      item.querySelector('a').href = group.searchUrl;
      seriesList.appendChild(item);
    }

    if (scan.series.length > 80) {
      const rest = document.createElement('div');
      rest.className = 'empty';
      rest.textContent = `ほか ${scan.series.length - 80} 件。全シリーズ・欠番・続刊確認は「専用ページ」で。`;
      seriesList.appendChild(rest);
    }

    setStatus(`最終スキャン: ${formatScannedAt(scan.scannedAt)}`);
  }

  function displayedGroups(scan) {
    return (scan?.series || []).slice(0, 80);
  }

  async function probeSeriesWithUrl(group, searchUrl, seriesKey) {
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

  async function probeSeries(group) {
    if (!Number.isFinite(group.highestVolume)) return { status: 'unknown' };
    try {
      const result = await probeSeriesWithUrl(group, group.searchUrl, group.seriesKey);
      if (result.status === 'has-next') return result;

      const closedDashKey = withClosingDashSeriesKey(group.seriesKey || group.title);
      if (!closedDashKey) return result;

      const fallbackUrl = seriesSearchUrl(closedDashKey, group.author);
      if (fallbackUrl === group.searchUrl) return result;

      const fallback = await probeSeriesWithUrl(group, fallbackUrl, closedDashKey);
      return fallback.status === 'has-next' ? fallback : result;
    } catch (error) {
      return { status: 'unknown' };
    }
  }

  async function checkNext(group, item, button) {
    button.disabled = true;
    button.textContent = '照会中…';
    setStatus(`${group.title} の続刊と価格を確認しています…`);

    const result = await probeSeries(group);
    const data = await chrome.storage.local.get(CACHE_KEY);
    const cache = data[CACHE_KEY] || {};
    cache[group.key] = { ...result, checkedAt: Date.now() };
    await chrome.storage.local.set({ [CACHE_KEY]: cache });

    group.catalog = cache[group.key];
    renderCatalogStatus(item.querySelector('.catalog-status'), group.catalog);
    const image = item.querySelector('.thumbnail');
    const thumbnailUrl = group.catalog.latestThumbnailUrl || group.latestOwnedThumbnailUrl || '';
    if (thumbnailUrl) {
      image.src = thumbnailUrl;
      image.alt = group.catalog.latestTitle || `${group.title} 最新刊`;
      image.hidden = false;
    }

    button.disabled = false;
    button.textContent = '再確認';
    setStatus('続刊・価格の照会結果を保存しました。');
  }

  async function checkVisible() {
    const targets = displayedGroups(currentScan).filter((group) => Number.isFinite(group.highestVolume));
    if (targets.length === 0) {
      setStatus('再確認できるシリーズがありません。');
      return;
    }

    const originalText = checkVisibleBtn.textContent;
    checkVisibleBtn.disabled = true;
    const rowButtons = Array.from(document.querySelectorAll('.check-next'));
    rowButtons.forEach((button) => {
      button.disabled = true;
    });

    const data = await chrome.storage.local.get(CACHE_KEY);
    const cache = data[CACHE_KEY] || {};

    let done = 0;
    for (const group of targets) {
      done += 1;
      checkVisibleBtn.textContent = `再確認中… ${done}/${targets.length}`;
      setStatus(`${group.title} の続刊と価格を確認しています…`);
      cache[group.key] = { ...(await probeSeries(group)), checkedAt: Date.now() };
      group.catalog = cache[group.key];
      if (done % 10 === 0) await chrome.storage.local.set({ [CACHE_KEY]: cache });
      if (done < targets.length) {
        await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
      }
    }

    await chrome.storage.local.set({ [CACHE_KEY]: cache });
    checkVisibleBtn.textContent = originalText;
    checkVisibleBtn.disabled = false;
    render(currentScan);
    setStatus(`表示中 ${targets.length} 件の続刊・価格を再確認しました。`);
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
  checkVisibleBtn.addEventListener('click', checkVisible);
  document.getElementById('exportCsv').addEventListener('click', () => exportBooks('csv'));
  document.getElementById('exportJson').addEventListener('click', () => exportBooks('json'));

  refresh();
})();
