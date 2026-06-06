(function () {
  'use strict';

  const api = globalThis.__KST__ || window.__KST__;
  let currentLang = 'ja';
  function t(key) {
    var args = Array.prototype.slice.call(arguments, 1);
    var kstI18n = typeof window !== 'undefined' && window.__KST_I18N__;
    if (!kstI18n) return key;
    return kstI18n.translate.apply(null, [currentLang, key].concat(args));
  }
  const BATCH_SIZE = 100;
  const AJAX_URL = 'https://www.amazon.co.jp/hz/mycd/digital-console/ajax';
  // Amazon の Ajax は1ソート順あたり約1万件で頭打ちになる。安全上限はその少し上に置く。
  const MAX_START_INDEX = 10500;
  // 連続リクエストの間隔。複数ソートパスで負荷が倍増するため throttle / 403 を避ける。
  const REQUEST_DELAY_MS = 120;
  const AUTO_SCAN_ENABLED_KEY = 'kstAutoScanEnabled';
  const AUTO_SCAN_INTERVAL_KEY = 'kstAutoScanIntervalD';
  const AUTO_SCAN_LAST_ATTEMPT_KEY = 'kstAutoScanLastAttempt';
  // 各ソート順は1万件で頭打ちになる。異なる軸（取得日・タイトル・著者）×昇順/降順で
  // 取得して ASIN マージすると、それぞれ別の「先頭1万件」が見えるため壁を越えられる。
  // 取得日2軸だけなら最大2万件、6パスなら理論上6万件規模までカバーできる。
  // reportedTotal 到達で全パス即終了するため、蔵書が少ないユーザーでは先頭の数パスで止まる
  // （追加パスは大規模ライブラリでのみ作動する）。
  const SORT_PASSES = [
    { sortOrder: 'DESCENDING', sortIndex: 'DATE' },
    { sortOrder: 'ASCENDING', sortIndex: 'DATE' },
    { sortOrder: 'ASCENDING', sortIndex: 'TITLE' },
    { sortOrder: 'DESCENDING', sortIndex: 'TITLE' },
    { sortOrder: 'ASCENDING', sortIndex: 'AUTHOR' },
    { sortOrder: 'DESCENDING', sortIndex: 'AUTHOR' },
  ];
  // 簡易モードの停止しきい値。取得日降順で既知 ASIN がこの件数だけ連続したら、
  // 新着領域を抜けたとみなして取得を止める。先頭付近の並び替え揺れに耐えるため
  // 「最初の既知1件」ではなく連続ランで判定する。
  const SIMPLE_KNOWN_RUN_STOP = 200;
  let silentAutoScan = false;

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function ensureBanner() {
    let banner = document.getElementById('kst-scan-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'kst-scan-banner';
      document.documentElement.appendChild(banner);
    }
    return banner;
  }

  function showBanner(message, detail) {
    if (silentAutoScan) return;
    const banner = ensureBanner();
    banner.innerHTML = `<strong></strong><span></span>`;
    banner.querySelector('strong').textContent = message;
    banner.querySelector('span').textContent = detail || '';
  }

  // 取得進捗をゲージ付きで表示する。既存のバーがあれば width だけ更新して滑らかに伸ばす。
  function showProgress(message, value, max) {
    if (silentAutoScan) return;
    const banner = ensureBanner();
    const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
    let fill = banner.querySelector('.kst-progress-fill');
    if (!fill) {
      banner.innerHTML =
        '<strong class="kst-title"></strong>' +
        '<div class="kst-progress"><div class="kst-progress-fill"></div></div>' +
        '<span class="kst-detail"></span>';
      fill = banner.querySelector('.kst-progress-fill');
    }
    banner.querySelector('.kst-title').textContent = message;
    fill.style.width = `${pct}%`;
    banner.querySelector('.kst-detail').textContent = t('progressDetail', value, max, pct);
  }

  function hideBannerSoon() {
    if (silentAutoScan) return;
    window.setTimeout(() => {
      document.getElementById('kst-scan-banner')?.remove();
    }, 3000);
  }

  function findCsrfToken() {
    const direct = window.csrfToken || window.wrappedJSObject?.csrfToken;
    if (direct) return direct;

    const input = document.querySelector('input[name="csrfToken"], input[name="csrf-token"]');
    if (input?.value) return input.value;

    const meta = document.querySelector('meta[name="csrf-token"], meta[name="csrfToken"]');
    if (meta?.content) return meta.content;

    for (const script of document.scripts) {
      const text = script.textContent || '';
      const match =
        text.match(/csrfToken["']?\s*[:=]\s*["']([^"']+)["']/) ||
        text.match(/["']csrfToken["']\s*:\s*["']([^"']+)["']/);
      if (match) return match[1];
    }

    return '';
  }

  async function saveProgress(value, max, status) {
    await chrome.storage.local.set({
      [api.PROGRESS_KEY]: {
        value,
        max,
        status,
        updatedAt: Date.now(),
      },
    });
  }

  function isQuotaError(error) {
    const message = String(error?.message || error || '');
    return /quota|QUOTA_BYTES|kQuotaBytes/i.test(message);
  }

  async function saveScanResult(result, progress) {
    const payload = {
      [api.STORAGE_KEY]: result,
      [api.PROGRESS_KEY]: progress,
    };

    try {
      await chrome.storage.local.set(payload);
      return { degraded: false };
    } catch (error) {
      if (!isQuotaError(error)) throw error;

      await chrome.storage.local.remove(api.STORAGE_KEY);
      try {
        await chrome.storage.local.set(payload);
        return { degraded: false };
      } catch (retryError) {
        if (!isQuotaError(retryError)) throw retryError;
        // 縮退保存: 明細(items)を捨て、シリーズ一覧だけ保存する。一覧表示は維持され、
        // CSV/JSON 出力だけが使えなくなる（再スキャンで復帰可能）。
        const reduced = {
          scannedAt: result.scannedAt,
          sourceUrl: result.sourceUrl,
          totalItems: result.totalItems,
          items: [],
          itemsOmittedForQuota: result.items.length,
          series: result.series,
        };
        await chrome.storage.local.set({
          [api.STORAGE_KEY]: reduced,
          [api.PROGRESS_KEY]: progress,
        });
        return { degraded: true, omitted: result.items.length };
      }
    }
  }

  async function fetchOwnershipPage(csrfToken, pass, startIndex) {
    const activityInput = JSON.stringify({
      contentType: 'Ebook',
      contentCategoryReference: 'booksAll',
      itemStatusList: ['Active'],
      originTypes: ['Purchase', 'Pottermore'],
      showSharedContent: true,
      fetchCriteria: {
        sortOrder: pass.sortOrder,
        sortIndex: pass.sortIndex,
        startIndex,
        batchSize: BATCH_SIZE,
        totalContentCount: -1,
      },
      surfaceType: 'Desktop',
    });

    const response = await fetch(AJAX_URL, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
      },
      body: new URLSearchParams({
        activity: 'GetContentOwnershipData',
        activityInput,
        csrfToken,
      }),
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(t('amazonErrorStatus', response.status));
    }

    const json = await response.json();
    if (json.success === false) {
      throw new Error(json.error || t('amazonFetchError'));
    }

    const data = json.GetContentOwnershipData;
    if (!data || !Array.isArray(data.items)) {
      throw new Error(t('dataFormatError'));
    }

    return { batch: api.extractOwnershipItems(json), numberOfItems: data.numberOfItems };
  }

  function ensureContext() {
    // 拡張を再読み込みすると、開いたままのページに残る旧 content script は
    // コンテキストが無効化され chrome.storage が失われる。先に検知して明示する。
    if (!chrome.runtime?.id || !chrome.storage?.local) {
      throw new Error(t('extensionUpdated'));
    }
    const csrfToken = findCsrfToken();
    if (!csrfToken) {
      throw new Error(t('csrfNotFound'));
    }
    return csrfToken;
  }

  // フルモード: 全ソート軸（取得日・タイトル・著者×昇降）で全件回収する。
  // Amazon の Ajax は1ソート順あたり約1万件で頭打ちになるため、異なる軸でマージして壁を越える。
  // 返り値は正規化済み書籍の配列（重複は ASIN で排除済み）。
  async function collectAllBooks(csrfToken) {
    const byAsin = new Map();
    let reportedTotal = 0;
    let collectedAll = false;

    for (let passIndex = 0; passIndex < SORT_PASSES.length && !collectedAll; passIndex += 1) {
      const pass = SORT_PASSES[passIndex];
      try {
        for (let startIndex = 0; startIndex < MAX_START_INDEX; startIndex += BATCH_SIZE) {
          const { batch, numberOfItems } = await fetchOwnershipPage(csrfToken, pass, startIndex);
          if (Number.isFinite(numberOfItems)) {
            reportedTotal = Math.max(reportedTotal, numberOfItems);
          }
          if (batch.length === 0) break; // このソート順は取得完了

          for (const book of batch) {
            if (!byAsin.has(book.asin)) byAsin.set(book.asin, book);
          }

          const target = Math.max(reportedTotal, byAsin.size);
          await saveProgress(byAsin.size, target, 'running');
          showProgress(t('fullScanProgress', passIndex + 1, SORT_PASSES.length), byAsin.size, target);

          // サーバ申告の総数に到達 = 全件回収済み。残りは重複なので全パスを打ち切る。
          if (reportedTotal > 0 && byAsin.size >= reportedTotal) {
            collectedAll = true;
            break;
          }

          if (batch.length < BATCH_SIZE) break; // 最終ページ
          await delay(REQUEST_DELAY_MS);
        }
      } catch (error) {
        // 追加ソート軸（TITLE/AUTHOR 等）が API に拒否されても全体を止めない。
        // ただし1件も取得できていない＝最初の取得自体の失敗（ログイン切れ等）は致命的なので投げ直す。
        if (byAsin.size === 0) throw error;
        console.warn('[KST] ソートパスをスキップしました', pass, error?.message || error);
      }
    }
    return Array.from(byAsin.values());
  }

  // 簡易モード: 取得日 降順で先頭から取得し、既知 ASIN が連続して規定数出たら停止する。
  // 新刊（最近の購入）はリストの先頭付近に集まるため、新着分だけを短時間で拾える。
  // 限界: 配信が後から確定して「古い取得日」で現れる本（ゴースト配信）や、返品・削除は
  // 降順の先頭には来ないため拾えない。これらの整合にはフルモードが要る。
  async function collectRecentBooks(csrfToken, knownAsins) {
    const pass = { sortOrder: 'DESCENDING', sortIndex: 'DATE' };
    const newByAsin = new Map();
    let consecutiveKnown = 0;
    let scanned = 0;

    for (let startIndex = 0; startIndex < MAX_START_INDEX; startIndex += BATCH_SIZE) {
      const { batch } = await fetchOwnershipPage(csrfToken, pass, startIndex);
      if (batch.length === 0) break;

      for (const book of batch) {
        scanned += 1;
        if (knownAsins.has(book.asin)) {
          consecutiveKnown += 1;
        } else {
          consecutiveKnown = 0;
          if (!newByAsin.has(book.asin)) newByAsin.set(book.asin, book);
        }
      }

      showProgress(t('simpleScanProgress'), newByAsin.size, newByAsin.size);
      await saveProgress(scanned, scanned, 'running');

      // 既知 ASIN が十分連続した = 新着領域を抜けた。これ以上さかのぼらない。
      if (consecutiveKnown >= SIMPLE_KNOWN_RUN_STOP) break;
      if (batch.length < BATCH_SIZE) break; // 最終ページ
      await delay(REQUEST_DELAY_MS);
    }
    return Array.from(newByAsin.values());
  }

  async function readExistingScan() {
    const data = await chrome.storage.local.get(api.STORAGE_KEY);
    return data[api.STORAGE_KEY] || null;
  }

  function preserveSeriesThumbnails(series, previousSeries, newBooks) {
    const previousByKey = new Map((previousSeries || []).map((s) => [s.key, s]));
    const freshByKey = new Map(api.summarizeNormalizedBooks(newBooks || []).map((s) => [s.key, s]));
    return series.map((s) => {
      const previous = previousByKey.get(s.key);
      const fresh = freshByKey.get(s.key);
      const freshIsCurrent = fresh?.highestVolume === s.highestVolume;
      return {
        ...s,
        latestOwnedThumbnailUrl:
          (freshIsCurrent && fresh.latestOwnedThumbnailUrl) ||
          previous?.latestOwnedThumbnailUrl ||
          s.latestOwnedThumbnailUrl ||
          '',
      };
    });
  }

  // mode: 'full' | 'simple'
  async function collectKindleBooks(mode) {
    const i18n = typeof window !== 'undefined' && window.__KST_I18N__;
    if (i18n) {
      const langData = await chrome.storage.local.get(i18n.LANGUAGE_KEY);
      currentLang = i18n.normalizeLanguage(langData[i18n.LANGUAGE_KEY]);
    }
    const csrfToken = ensureContext();

    let minimalBooks;
    let series;
    let addedNote = '';

    if (mode === 'simple') {
      const existing = await readExistingScan();
      const existingItems = Array.isArray(existing?.items) ? existing.items : [];
      if (existingItems.length === 0) {
        // 差分の基準が無い（初回・旧縮退データ）。簡易は使えないのでフルへ誘導。
        throw new Error(t('simpleScanNeedsBase'));
      }
      const existingMinimal = existingItems.map((b) => api.toMinimalBook(b));
      const knownAsins = new Set(existingMinimal.map((b) => b.asin));
      const newBooks = await collectRecentBooks(csrfToken, knownAsins);
      const merged = api.mergeScan(existingMinimal, newBooks);
      minimalBooks = merged.minimalBooks;
      series = preserveSeriesThumbnails(merged.series, existing.series, newBooks);
      addedNote = t('addedBooks', merged.added);
    } else {
      const normalized = await collectAllBooks(csrfToken);
      minimalBooks = normalized.map((b) => api.toMinimalBook(b));
      series = api.summarizeNormalizedBooks(normalized);
    }

    const result = {
      scannedAt: Date.now(),
      sourceUrl: location.href,
      mode,
      totalItems: minimalBooks.length,
      items: minimalBooks,
      series,
    };

    const saved = await saveScanResult(result, {
      value: minimalBooks.length,
      max: minimalBooks.length,
      status: 'done',
      updatedAt: Date.now(),
    });

    if (saved.degraded) {
      // 最小書誌でも上限を超える規模（理論上ほぼ無いが多層防御）。シリーズ一覧だけ保存。
      showBanner(t('quotaWarning'), t('degradedDetail', saved.omitted));
    } else {
      const detail = addedNote
        ? t('simpleScanDetail', addedNote, minimalBooks.length, series.length)
        : t('basicScanDetail', minimalBooks.length, series.length);
      showBanner(t('scanComplete'), detail);
      hideBannerSoon();
    }
    return result;
  }

  // エクスポート用: 保存はせず、全件をフル書誌（title/authors 付き）で取得して返す。
  // 保存データは最小書誌のため、CSV/JSON の明細出力にはその場での再取得が必要。
  async function collectForExport() {
    const i18n = typeof window !== 'undefined' && window.__KST_I18N__;
    if (i18n) {
      const langData = await chrome.storage.local.get(i18n.LANGUAGE_KEY);
      currentLang = i18n.normalizeLanguage(langData[i18n.LANGUAGE_KEY]);
    }
    const csrfToken = ensureContext();
    const normalized = await collectAllBooks(csrfToken);
    hideBannerSoon();
    return normalized;
  }

  async function maybeAutoScan() {
    const data = await chrome.storage.local.get([
      AUTO_SCAN_ENABLED_KEY,
      AUTO_SCAN_INTERVAL_KEY,
      api.STORAGE_KEY,
      AUTO_SCAN_LAST_ATTEMPT_KEY,
    ]);
    if (!data[AUTO_SCAN_ENABLED_KEY]) return;

    const intervalD = Number(data[AUTO_SCAN_INTERVAL_KEY]) || 7;
    const scan = data[api.STORAGE_KEY] || null;
    const lastAttempt = Number(data[AUTO_SCAN_LAST_ATTEMPT_KEY]) || 0;
    const staleness = Math.max(Number(scan?.scannedAt) || 0, lastAttempt);
    if (Date.now() - staleness < intervalD * 86400000) return;

    await chrome.storage.local.set({ [AUTO_SCAN_LAST_ATTEMPT_KEY]: Date.now() });
    silentAutoScan = true;
    const mode = Array.isArray(scan?.items) && scan.items.length > 0 ? 'simple' : 'full';
    try {
      await collectKindleBooks(mode);
    } finally {
      silentAutoScan = false;
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'kst:startScan') {
      const mode = message.mode === 'simple' ? 'simple' : 'full';
      collectKindleBooks(mode)
        .then((result) => sendResponse({ ok: true, result }))
        .catch(async (error) => {
          try {
            await saveProgress(0, 0, 'error');
          } catch (progressError) {
            console.warn('Failed to save Kindle scan error progress', progressError);
          }
          showBanner(t('scanFailed'), error.message);
          sendResponse({ ok: false, error: error.message });
        });
      return true;
    }

    if (message?.type === 'kst:exportFetch') {
      collectForExport()
        .then((books) => sendResponse({ ok: true, books }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    return false;
  });

  maybeAutoScan().catch((e) => console.warn('[KST] auto-scan error', e));
})();
