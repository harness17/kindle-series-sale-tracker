(function () {
  'use strict';

  const api = window.__KST__;
  const catalog = window.__KST_CATALOG__;
  const CACHE_KEY = 'kstCatalogCache';
  const COMPLETED_KEY = 'kstCompletedSeries'; // 手動の完結フラグ { [seriesKey]: true }
  const PRIORITY_KEY = 'kstPrioritySeries'; // 優先表示フラグ { [seriesKey]: true }
  const REQUEST_DELAY_MS = 350; // 一括照会の間隔（throttle/403 回避）
  let bulkAbort = false; // 一括照会のキャンセルフラグ

  const els = {
    summary: document.getElementById('summary'),
    search: document.getElementById('search'),
    sort: document.getElementById('sort'),
    filterMissing: document.getElementById('filterMissing'),
    filterPriority: document.getElementById('filterPriority'),
    filterStatus: document.getElementById('filterStatus'),
    filterHideCompleted: document.getElementById('filterHideCompleted'),
    checkVisible: document.getElementById('checkVisible'),
    clearCache: document.getElementById('clearCache'),
    clearScan: document.getElementById('clearScan'),
    list: document.getElementById('list'),
    topLink: document.querySelector('.top-link'),
  };

  let series = []; // 表示用ビューモデル（ownedRanges / missing を付与）
  let cache = {}; // seriesKey -> { status, nextVolume, nextTitle, nextUrl, checkedAt }
  let completed = {}; // seriesKey -> true（手動完結フラグ）
  let priority = {}; // seriesKey -> true（優先表示フラグ）
  let baseSummary = ''; // クリア後などに戻す件数表示

  function formatRanges(ranges) {
    return ranges.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ');
  }

  function iconLabel(icon, text) {
    return `${icon} ${text}`;
  }

  async function load() {
    const data = await chrome.storage.local.get([api.STORAGE_KEY, CACHE_KEY, COMPLETED_KEY, PRIORITY_KEY]);
    const scan = data[api.STORAGE_KEY];
    cache = data[CACHE_KEY] || {};
    completed = data[COMPLETED_KEY] || {};
    priority = data[PRIORITY_KEY] || {};

    if (!scan || (!Array.isArray(scan.series) && !Array.isArray(scan.items))) {
      series = [];
      baseSummary = '未スキャンです。Amazon の Kindle 一覧ページでスキャンしてください。';
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
    baseSummary = `${total}冊 / ${series.length}シリーズ`;
    els.summary.textContent = baseSummary;
    render();
  }

  function passesFilter(s) {
    const q = els.search.value.trim();
    if (q && !`${s.title} ${s.author || ''}`.includes(q)) return false;
    if (els.filterMissing.checked && s.missing.length === 0) return false;
    if (els.filterPriority.checked && !priority[s.key]) return false;
    // 続刊状態フィルタ。手動完結は続刊照会の自動判定とは別概念なので、
    // あり/なし/未照会のいずれにも該当させず除外する（すべて選択時のみ表示）。
    const status = els.filterStatus.value;
    if (status !== 'all') {
      if (completed[s.key]) return false;
      const cached = cache[s.key];
      if (status === 'has-next' && cached?.status !== 'has-next') return false;
      if (status === 'no-next' && cached?.status !== 'no-next') return false;
      if (status === 'unchecked' && cached) return false;
    }
    if (els.filterHideCompleted.checked && completed[s.key]) return false;
    return true;
  }

  function sortSeries(list) {
    const by = els.sort.value;
    return list.slice().sort((a, b) => {
      if (by === 'volume') return (b.highestVolume || 0) - (a.highestVolume || 0);
      if (by === 'title') return a.title.localeCompare(b.title, 'ja');
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
        ? '条件に一致するシリーズがありません。'
        : 'シリーズがありません。';
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
    const cached = cache[s.key];
    const thumbnailUrl = cached?.latestThumbnailUrl || s.latestOwnedThumbnailUrl || '';
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
    priorityBtn.textContent = priority[s.key] ? iconLabel('☆', '優先解除') : iconLabel('★', '優先表示');
    priorityBtn.addEventListener('click', () => togglePriority(s));
    actions.appendChild(priorityBtn);

    const checkBtn = document.createElement('button');
    checkBtn.type = 'button';
    checkBtn.className = 'secondary';
    checkBtn.textContent = cache[s.key] ? iconLabel('↻', '再確認') : iconLabel('↻', '次巻を確認');
    checkBtn.disabled = !!completed[s.key]; // 完結なら照会不要
    checkBtn.addEventListener('click', () => checkNext(s, row, checkBtn));
    actions.appendChild(checkBtn);

    const completeBtn = document.createElement('button');
    completeBtn.type = 'button';
    completeBtn.className = 'secondary complete-btn';
    completeBtn.textContent = completed[s.key] ? iconLabel('○', '完結解除') : iconLabel('✓', '完結にする');
    // 続刊あり確定のシリーズは完結にできない（完結解除は常に許可）。
    if (!completed[s.key] && cache[s.key]?.status === 'has-next') {
      completeBtn.disabled = true;
      completeBtn.title = '続刊があるため完結にできません';
    }
    completeBtn.addEventListener('click', () => toggleCompleted(s));
    actions.appendChild(completeBtn);

    const searchLink = document.createElement('a');
    searchLink.href = s.searchUrl;
    searchLink.target = '_blank';
    searchLink.rel = 'noreferrer';
    searchLink.textContent = iconLabel('↗', 'Amazonで探す');
    actions.appendChild(searchLink);

    row.appendChild(actions);

    if (thumbnailUrl) {
      const img = document.createElement('img');
      img.className = 'thumbnail';
      img.src = thumbnailUrl;
      img.alt = cached?.latestTitle || `${s.title} 最新刊`;
      img.loading = 'lazy';
      row.appendChild(img);
    }

    const meta = document.createElement('div');
    meta.className = 'meta';

    const author = document.createElement('span');
    author.textContent = s.author || '著者不明';
    meta.appendChild(author);

    const owned = document.createElement('span');
    owned.className = 'badge';
    owned.textContent = s.ranges.length ? `所有 ${formatRanges(s.ranges)}` : '巻数未推定';
    meta.appendChild(owned);

    if (s.missing.length) {
      const miss = document.createElement('span');
      miss.className = 'badge missing';
      // 欠番も連番はレンジ表示にする（102,103,…,109 → 102-109）。
      miss.textContent = `欠番 ${formatRanges(api.computeOwnedRanges(s.missing))}`;
      meta.appendChild(miss);
    }

    if (priority[s.key]) {
      const priorityBadge = document.createElement('span');
      priorityBadge.className = 'badge priority';
      priorityBadge.textContent = '優先';
      meta.appendChild(priorityBadge);
    }

    if (completed[s.key]) {
      // 手動完結は最優先表示（続刊照会の自動判定とは区別）。
      const done = document.createElement('span');
      done.className = 'badge completed';
      done.textContent = '完結';
      meta.appendChild(done);
    } else {
      const nextResult = document.createElement('span');
      nextResult.className = 'next-result';
      renderNextResult(nextResult, cached);
      meta.appendChild(nextResult);
    }

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

  async function toggleCompleted(s) {
    // 続刊あり確定のシリーズは完結にできない（解除は許可）。
    if (!completed[s.key] && cache[s.key]?.status === 'has-next') return;
    if (completed[s.key]) {
      delete completed[s.key];
    } else {
      completed[s.key] = true;
    }
    await chrome.storage.local.set({ [COMPLETED_KEY]: completed });
    render();
  }

  function renderNextResult(el, cached) {
    el.textContent = '';
    if (!cached) return;

    if (cached.latestVolume && cached.latestReleaseDate) {
      const latest = document.createElement('span');
      latest.className = 'badge latest-date';
      latest.textContent = `最新刊: ${cached.latestVolume}巻 ${cached.latestReleaseDate}`;
      el.appendChild(latest);
      el.appendChild(document.createTextNode(' '));
    }

    if (cached.latestPriceText) {
      const price = document.createElement('span');
      price.className = cached.latestDiscountRate ? 'badge sale' : 'badge price';
      const discount = cached.latestDiscountRate ? ` ${cached.latestDiscountRate}%OFF` : '';
      price.textContent = `価格: ${cached.latestPriceText}${discount}`;
      el.appendChild(price);
      el.appendChild(document.createTextNode(' '));
    }

    if (cached.status === 'has-next') {
      const b = document.createElement('span');
      b.className = 'badge next';
      b.textContent = `続刊あり: ${cached.nextVolume}巻`;
      el.appendChild(b);
      if (cached.nextUrl) {
        const a = document.createElement('a');
        a.href = cached.nextUrl;
        a.target = '_blank';
        a.rel = 'noreferrer';
        a.textContent = cached.nextTitle || '購入ページ';
        el.appendChild(document.createTextNode(' '));
        el.appendChild(a);
      }
    } else if (cached.status === 'no-next') {
      el.textContent = '続刊なし（自動判定）';
    } else {
      el.textContent = '判定不能';
    }
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

  async function probeSeriesWithUrl(s, searchUrl, seriesKey) {
    const res = await fetch(searchUrl, { credentials: 'include' });
    if (!res.ok) return { status: 'unknown' };
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const results = catalog.parseSearchResultsFromDoc(doc);
    return catalog.detectNextVolume(results, {
      seriesTitle: s.title,
      seriesKey,
      highestVolume: s.highestVolume,
      ownedImprint: s.imprint,
    });
  }

  async function probeSeries(s) {
    if (!Number.isFinite(s.highestVolume)) return { status: 'unknown' };
    try {
      const result = await probeSeriesWithUrl(s, s.searchUrl, s.seriesKey);
      if (result.status === 'has-next') return result;

      const closedDashKey = withClosingDashSeriesKey(s.seriesKey || s.title);
      if (!closedDashKey) return result;

      const fallbackUrl = seriesSearchUrl(closedDashKey, s.author);
      if (fallbackUrl === s.searchUrl) return result;

      const fallback = await probeSeriesWithUrl(s, fallbackUrl, closedDashKey);
      return fallback.status === 'has-next' ? fallback : result;
    } catch (error) {
      return { status: 'unknown' };
    }
  }

  async function checkNext(s, row, btn) {
    if (btn) {
      btn.disabled = true;
      btn.textContent = iconLabel('↻', '照会中…');
    }
    const result = await probeSeries(s);
    cache[s.key] = { ...result, checkedAt: Date.now() };
    await chrome.storage.local.set({ [CACHE_KEY]: cache });

    const el = row.querySelector('.next-result');
    if (el) renderNextResult(el, cache[s.key]);
    // 照会で続刊あり確定なら完結ボタンを無効化（未完結のときのみ）。
    const completeBtn = row.querySelector('.complete-btn');
    if (completeBtn && !completed[s.key]) {
      const hasNext = cache[s.key]?.status === 'has-next';
      completeBtn.disabled = hasNext;
      completeBtn.title = hasNext ? '続刊があるため完結にできません' : '';
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = iconLabel('↻', '再確認');
    }
    // 最新刊日付・サムネイルや続刊状態フィルタを反映するため再描画する。
    render();
  }

  async function checkVisible() {
    const targets = currentList()
      .filter((s) => !cache[s.key] && !completed[s.key]);
    if (targets.length === 0) return;

    bulkAbort = false;
    els.checkVisible.textContent = iconLabel('×', '中止');
    els.checkVisible.removeEventListener('click', checkVisible);
    els.checkVisible.addEventListener('click', abortBulk);

    let done = 0;
    for (const s of targets) {
      if (bulkAbort) break;
      done += 1;
      els.summary.textContent = `照会中… ${done}/${targets.length}`;
      cache[s.key] = { ...(await probeSeries(s)), checkedAt: Date.now() };
      if (done % 20 === 0) await chrome.storage.local.set({ [CACHE_KEY]: cache });
      await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
    }
    await chrome.storage.local.set({ [CACHE_KEY]: cache });

    els.checkVisible.removeEventListener('click', abortBulk);
    els.checkVisible.addEventListener('click', checkVisible);
    els.checkVisible.textContent = iconLabel('↻', '表示中を一括照会');
    render();

    const remaining = currentList().filter((s) => !cache[s.key] && !completed[s.key]).length;
    let msg = `${series.length}シリーズ（${done}件照会）`;
    if (bulkAbort) msg += ' ／ 中止しました';
    if (remaining > 0) msg += ` ／ 残り${remaining}件`;
    els.summary.textContent = msg;
  }

  function abortBulk() {
    bulkAbort = true;
  }

  function scrollToTop(event) {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function clearCache() {
    cache = {};
    await chrome.storage.local.remove(CACHE_KEY);
    render();
    els.summary.textContent = `照会キャッシュをクリアしました ／ ${baseSummary}`;
  }

  async function clearScan() {
    await chrome.storage.local.remove([api.STORAGE_KEY, api.PROGRESS_KEY]);
    await load();
    els.summary.textContent = `スキャン結果をクリアしました。再スキャンしてください。`;
  }

  els.search.addEventListener('input', render);
  els.sort.addEventListener('change', render);
  els.filterMissing.addEventListener('change', render);
  els.filterPriority.addEventListener('change', render);
  els.filterStatus.addEventListener('change', render);
  els.filterHideCompleted.addEventListener('change', render);
  els.checkVisible.addEventListener('click', checkVisible);
  els.clearCache.addEventListener('click', clearCache);
  els.clearScan.addEventListener('click', clearScan);
  if (els.topLink) els.topLink.addEventListener('click', scrollToTop);

  load();
})();
