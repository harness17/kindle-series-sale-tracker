(function () {
  'use strict';

  const api = window.__KST__;
  const catalog = window.__KST_CATALOG__;
  const card = window.__KST_CARD__;
  const CACHE_KEY = 'kstCatalogCache';
  const COMPLETED_KEY = 'kstCompletedSeries'; // 手動の完結フラグ { [seriesKey]: true }
  const PRIORITY_KEY = 'kstPrioritySeries'; // 優先表示フラグ { [seriesKey]: true }
  const EXCLUDED_KEY = 'kstExcludedSeries'; // 除外フラグ { [seriesKey]: true }
  const THEME_KEY = 'kstTheme';
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
    filterExcluded: document.getElementById('filterExcluded'),
    filterSale: document.getElementById('filterSale'),
    checkVisible: document.getElementById('checkVisible'),
    checkSimple: document.getElementById('checkSimple'),
    clearCache: document.getElementById('clearCache'),
    clearScan: document.getElementById('clearScan'),
    themeToggle: document.getElementById('themeToggle'),
    list: document.getElementById('list'),
    topLink: document.querySelector('.top-link'),
  };

  let series = []; // 表示用ビューモデル（ownedRanges / missing を付与）
  let cache = {}; // seriesKey -> { status, nextVolume, nextTitle, nextUrl, checkedAt }
  let completed = {}; // seriesKey -> true（手動完結フラグ）
  let priority = {}; // seriesKey -> true（優先表示フラグ）
  let excluded = {}; // seriesKey -> true（除外フラグ）
  let baseSummary = ''; // クリア後などに戻す件数表示

  function iconLabel(icon, text) {
    return `${icon} ${text}`;
  }

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
    els.themeToggle.value = theme;
    setLocalTheme(theme);
    applyThemeToDocument(theme);
  }

  async function applyTheme(value) {
    const theme = normalizeTheme(value);
    setLocalTheme(theme);
    await chrome.storage.local.set({ [THEME_KEY]: theme });
    applyThemeToDocument(theme);
    els.themeToggle.value = theme;
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

  // 表示・判定はすべて reconcile 済みビューを通す（生 cache を直接参照しない）。
  function catalogFor(s) {
    return card.reconcileCatalog(cache[s.key], s.highestVolume);
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
      const cached = catalogFor(s);
      if (status === 'has-next' && cached?.status !== 'has-next') return false;
      if (status === 'no-next' && cached?.status !== 'no-next') return false;
      if (status === 'unchecked' && cached) return false;
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
    priorityBtn.textContent = priority[s.key] ? iconLabel('☆', '優先解除') : iconLabel('★', '優先表示');
    priorityBtn.addEventListener('click', () => togglePriority(s));
    actions.appendChild(priorityBtn);

    const excludeBtn = document.createElement('button');
    excludeBtn.type = 'button';
    excludeBtn.className = 'secondary exclude-btn';
    excludeBtn.textContent = excluded[s.key] ? '除外解除' : '除外';
    excludeBtn.addEventListener('click', () => toggleExcluded(s));
    actions.appendChild(excludeBtn);

    const checkBtn = document.createElement('button');
    checkBtn.type = 'button';
    checkBtn.className = 'secondary';
    checkBtn.textContent = cached ? iconLabel('↻', '再確認') : iconLabel('↻', '次巻を確認');
    checkBtn.disabled = !!completed[s.key]; // 完結なら照会不要
    checkBtn.addEventListener('click', () => checkNext(s, checkBtn));
    actions.appendChild(checkBtn);

    const completeBtn = document.createElement('button');
    completeBtn.type = 'button';
    completeBtn.className = 'secondary complete-btn';
    completeBtn.textContent = completed[s.key] ? iconLabel('○', '完結解除') : iconLabel('✓', '完結にする');
    // 続刊あり確定のシリーズは完結にできない（完結解除は常に許可）。
    if (!completed[s.key] && cached?.status === 'has-next') {
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
      img.alt = offer?.title || cached?.latestTitle || `${s.title} 最新刊`;
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
    owned.textContent = s.ranges.length ? `所有 ${card.formatRanges(s.ranges)}` : '巻数未推定';
    meta.appendChild(owned);

    if (s.missing.length) {
      const miss = document.createElement('span');
      miss.className = 'badge missing';
      // 欠番も連番はレンジ表示にする（102,103,…,109 → 102-109）。
      miss.textContent = `欠番 ${card.formatRanges(api.computeOwnedRanges(s.missing))}`;
      meta.appendChild(miss);
    }

    if (priority[s.key]) {
      const priorityBadge = document.createElement('span');
      priorityBadge.className = 'badge priority';
      priorityBadge.textContent = '優先';
      meta.appendChild(priorityBadge);
    }

    const statusBlock = document.createElement('span');
    statusBlock.className = 'next-result';
    card.renderStatusBlock(statusBlock, cached, { completed: completed[s.key] });
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
    // 続刊あり確定のシリーズは完結にできない（解除は許可）。
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
      btn.textContent = iconLabel('↻', '照会中…');
    }
    const result = await probeSeries(s);
    cache[s.key] = { ...result, checkedAt: Date.now() };
    await chrome.storage.local.set({ [CACHE_KEY]: cache });
    if (btn) {
      btn.disabled = false;
      btn.textContent = iconLabel('↻', '再確認');
    }
    // 最新刊日付・サムネイルや続刊状態フィルタを反映するため再描画する。
    render();
  }

  function fullTargets() {
    return currentList().filter((s) => !completed[s.key] && !excluded[s.key]);
  }

  function simpleTargets() {
    // 確定 has-next（未所持の次巻あり）だけ除外。stale（要再確認）・降格 no-next・未照会は含める。
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
    triggerButton.textContent = iconLabel('×', '中止');
    triggerButton.removeEventListener('click', triggerStart);
    triggerButton.addEventListener('click', abortBulk);
    els.checkVisible.disabled = triggerButton !== els.checkVisible;
    els.checkSimple.disabled = triggerButton !== els.checkSimple;

    let done = 0;
    for (const s of targets) {
      if (bulkAbort) break;
      done += 1;
      els.summary.textContent = `${label}中… ${done}/${targets.length}`;
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

    let msg = `${series.length}シリーズ（${done}件${label}）`;
    if (bulkAbort) msg += ' ／ 中止しました';
    els.summary.textContent = msg;
  }

  function startFullBulk() {
    runBulkProbe(fullTargets(), {
      label: '再確認',
      triggerButton: els.checkVisible,
      triggerStart: startFullBulk,
      triggerIdle: iconLabel('↻', '一括続刊再確認'),
      emptyMessage: '再確認対象なし',
    });
  }

  function startSimpleBulk() {
    runBulkProbe(simpleTargets(), {
      label: '新刊チェック',
      triggerButton: els.checkSimple,
      triggerStart: startSimpleBulk,
      triggerIdle: iconLabel('＋', '新刊チェック（簡易）'),
      emptyMessage: '新刊チェック対象なし',
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
  els.filterExcluded.addEventListener('change', render);
  els.filterSale.addEventListener('change', render);
  els.checkVisible.addEventListener('click', startFullBulk);
  els.checkSimple.addEventListener('click', startSimpleBulk);
  els.clearCache.addEventListener('click', clearCache);
  els.clearScan.addEventListener('click', clearScan);
  els.themeToggle.addEventListener('change', () => applyTheme(els.themeToggle.value));
  if (els.topLink) els.topLink.addEventListener('click', scrollToTop);

  initTheme();
  load();
})();
