(function () {
  'use strict';

  const api = window.__KST__;
  const libraryUrl = 'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/';

  const summary = document.getElementById('summary');
  const status = document.getElementById('status');
  const seriesList = document.getElementById('seriesList');

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
    const data = await chrome.storage.local.get(api.STORAGE_KEY);
    return data[api.STORAGE_KEY] || null;
  }

  function render(scan) {
    if (!scan) {
      summary.textContent = '未スキャン';
      seriesList.innerHTML =
        '<div class="empty">Kindle一覧を開いてから「全件取得」してください。</div>';
      return;
    }

    const totalItems = scan.totalItems ?? scan.items.length;
    summary.textContent = `${totalItems}冊 / ${scan.series.length}候補`;
    seriesList.textContent = '';

    if (!scan.series.length) {
      seriesList.innerHTML =
        '<div class="empty">シリーズ候補が見つかりませんでした。タイトル表記が特殊な場合は今後の検出ルール追加対象です。</div>';
      return;
    }

    for (const group of scan.series.slice(0, 80)) {
      const item = document.createElement('article');
      item.className = 'series-item';
      const volumeText = group.highestVolume
        ? `所有: ${group.ownedVolumes.join(', ')} / 次候補: ${group.nextVolume}巻`
        : '巻数未推定';
      item.innerHTML = `
        <div class="series-title">
          <strong></strong>
          <span class="badge">${group.count}冊</span>
        </div>
        <div class="series-meta"></div>
        <div class="series-actions">
          <a target="_blank" rel="noreferrer">Amazonで続刊を探す</a>
        </div>
      `;
      item.querySelector('strong').textContent = group.title;
      item.querySelector('.series-meta').textContent = `${group.author || '著者不明'} / ${volumeText}`;
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
  document.getElementById('exportCsv').addEventListener('click', () => exportBooks('csv'));
  document.getElementById('exportJson').addEventListener('click', () => exportBooks('json'));

  refresh();
})();
