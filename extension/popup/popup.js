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
        '<div class="empty">Kindle一覧を開いてから、このページをスキャンしてください。</div>';
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

  async function refresh() {
    render(await getLastScan());
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

  document.getElementById('scanPage').addEventListener('click', async () => {
    setStatus('スキャンを開始します...');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith('https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll')) {
      setStatus('Kindle一覧ページを開いてから実行してください。');
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: 'kst:startScan' }, async (response) => {
      if (chrome.runtime.lastError) {
        setStatus('ページを再読み込みしてから再試行してください。');
        return;
      }
      if (!response?.ok) {
        setStatus(response?.error || 'スキャンに失敗しました。');
        return;
      }
      setStatus('スキャンが完了しました。');
      await refresh();
    });
  });

  document.getElementById('exportCsv').addEventListener('click', async () => {
    const scan = await getLastScan();
    if (!scan) {
      setStatus('先にスキャンしてください。');
      return;
    }
    if (!scan.items?.length) {
      setStatus('\u4FDD\u5B58\u5BB9\u91CF\u306E\u90FD\u5408\u3067\u660E\u7D30\u304C\u7701\u7565\u3055\u308C\u3066\u3044\u307E\u3059\u3002\u518D\u30B9\u30AD\u30E3\u30F3\u3059\u308B\u3068\u51FA\u529B\u3067\u304D\u307E\u3059\u3002');
      return;
    }
    downloadText('kindle-series-books.csv', 'text/csv;charset=utf-8', `\uFEFF${api.toCsv(scan.items)}`);
  });

  document.getElementById('exportJson').addEventListener('click', async () => {
    const scan = await getLastScan();
    if (!scan) {
      setStatus('先にスキャンしてください。');
      return;
    }
    downloadText('kindle-series-books.json', 'application/json;charset=utf-8', JSON.stringify(scan, null, 2));
  });

  refresh();
})();
