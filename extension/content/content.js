(function () {
  'use strict';

  const api = window.__KST__;
  const BATCH_SIZE = 100;
  const AJAX_URL = 'https://www.amazon.co.jp/hz/mycd/digital-console/ajax';
  // Amazon の Ajax は1ソート順あたり約1万件で頭打ちになる。安全上限はその少し上に置く。
  const MAX_START_INDEX = 10500;
  // 連続リクエストの間隔。複数ソートパスで負荷が倍増するため throttle / 403 を避ける。
  const REQUEST_DELAY_MS = 120;
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
    const banner = ensureBanner();
    banner.innerHTML = `<strong></strong><span></span>`;
    banner.querySelector('strong').textContent = message;
    banner.querySelector('span').textContent = detail || '';
  }

  // 取得進捗をゲージ付きで表示する。既存のバーがあれば width だけ更新して滑らかに伸ばす。
  function showProgress(message, value, max) {
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
    banner.querySelector('.kst-detail').textContent =
      `${value.toLocaleString()} / ${max ? max.toLocaleString() : '?'} 件（${pct}%）`;
  }

  function hideBannerSoon() {
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
      throw new Error(`Amazon の応答が ${response.status} でした。`);
    }

    const json = await response.json();
    if (json.success === false) {
      throw new Error(json.error || 'Amazon 側で取得に失敗しました。');
    }

    const data = json.GetContentOwnershipData;
    if (!data || !Array.isArray(data.items)) {
      throw new Error('Kindle 所有データの形式を認識できませんでした。');
    }

    return { batch: api.extractOwnershipItems(json), numberOfItems: data.numberOfItems };
  }

  async function collectKindleBooks() {
    // 拡張を再読み込みすると、開いたままのページに残る旧 content script は
    // コンテキストが無効化され chrome.storage が失われる。先に検知して明示する。
    if (!chrome.runtime?.id || !chrome.storage?.local) {
      throw new Error(
        '拡張機能が更新されました。この Kindle 一覧ページを再読み込み（F5）してから、もう一度スキャンしてください。'
      );
    }

    const csrfToken = findCsrfToken();
    if (!csrfToken) {
      throw new Error('csrfToken が見つかりません。Amazon.co.jp にログインし直してから再試行してください。');
    }

    // Amazon の Ajax は1ソート順あたり約1万件で頭打ちになる。取得日 DESC/ASC の
    // 両方向から取得して ASIN でマージすることで、その壁を越えて全件回収する。
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
          showProgress(
            `Kindle蔵書を取得中（${passIndex + 1}/${SORT_PASSES.length}）`,
            byAsin.size,
            target
          );

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

    const normalizedItems = Array.from(byAsin.values());
    const series = api.buildSeriesSummary(normalizedItems);
    const result = {
      scannedAt: Date.now(),
      sourceUrl: location.href,
      totalItems: normalizedItems.length,
      items: normalizedItems,
      series,
    };

    const saved = await saveScanResult(result, {
      value: normalizedItems.length,
      max: normalizedItems.length,
      status: 'done',
      updatedAt: Date.now(),
    });

    if (saved.degraded) {
      // 消えないバナーで縮退を明示する（CSV/JSON 出力は再スキャンまで不可）。
      showBanner(
        '保存容量の上限により縮退保存しました',
        `シリーズ一覧のみ保存（${saved.omitted}冊の明細は未保存・CSV/JSON出力不可）`
      );
    } else {
      showBanner('Kindle蔵書の取得が完了しました', `${normalizedItems.length}冊 / ${series.length}シリーズ候補`);
      hideBannerSoon();
    }
    return result;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'kst:startScan') return false;

    collectKindleBooks()
      .then((result) => sendResponse({ ok: true, result }))
      .catch(async (error) => {
        try {
          await saveProgress(0, 0, 'error');
        } catch (progressError) {
          console.warn('Failed to save Kindle scan error progress', progressError);
        }
        showBanner('Kindle蔵書の取得に失敗しました', error.message);
        sendResponse({ ok: false, error: error.message });
      });

    return true;
  });
})();
