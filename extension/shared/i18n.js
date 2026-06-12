(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const api = factory();
    root.__KST_I18N__ = api;
    if (typeof window !== 'undefined') window.__KST_I18N__ = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LANGUAGE_KEY = 'kstLanguage';

  const TEXT = {
    ja: {
      // --- Shared (popup + options) ---
      unknownAuthor: '著者不明',
      volumeUnknown: '巻数未推定',
      ownedText: function (text) { return '所有 ' + text; },
      recheck: '再確認',
      checking: '照会中…',
      checkingSeriesStatus: function (title) { return title + ' の続刊と価格を確認しています…'; },
      noNewCheck: '新刊チェック対象なし',
      priorityBadge: '優先',
      recheckLabel: '再確認',
      newCheckLabel: '新刊チェック',
      bulkProgress: function (label, done, total) { return label + '中… ' + done + '/' + total; },

      // --- Popup ---
      unscanned: '未スキャン',
      openLibraryPrompt: 'Kindle一覧を開いてから「全件取得」してください。',
      scanSummaryPopup: function (n, m) { return n + '冊 / ' + m + '候補'; },
      noSeriesFound: 'シリーズ候補が見つかりませんでした。タイトル表記が特殊な場合は今後の検出ルール追加対象です。',
      bookCount: function (n) { return n + '冊'; },
      latestAlt: function (title) { return title + ' 最新刊'; },
      checkNext: '続刊・価格確認',
      checkNextTitle: 'Amazon検索結果から続刊と価格を照会します',
      checkNextDisabledTitle: '巻数未推定のため照会できません',
      searchAmazon: 'Amazonで続刊を探す',
      moreItems: function (n) { return 'ほか ' + n + ' 件。全シリーズ・欠番・続刊確認は「専用ページ」で。'; },
      lastScan: function (date) { return '最終スキャン: ' + date; },
      checkSaved: '続刊・価格の照会結果を保存しました。',
      noRecheckTargetsPopup: '再確認できるシリーズがありません。',
      bulkDone: function (done, label) { return '表示中 ' + done + ' 件の' + label + 'が完了しました。'; },
      openLibraryFirst: 'Kindle一覧ページを開いてから実行してください。',
      reloadPage: 'ページを再読み込み（F5）してから再試行してください。',
      noResponse: '応答がありませんでした。',
      checkingNew: '新着を確認しています…',
      startingFullScan: '全件取得を開始します…',
      simpleScanDone: '簡易更新が完了しました。',
      fullScanDone: '全件取得が完了しました。',
      exportFetching: 'エクスポート用に全件を再取得しています…',
      exportFailed: '再取得に失敗しました。',
      exportDone: function (n) { return 'エクスポート完了（' + n + '冊）。'; },
      simpleScanTitle: '前回以降の新着だけを高速に取り込みます',
      simpleScanDisabledTitle: '先に「全件取得」を実行してください',

      // Popup HTML static
      seriesCandidates: 'シリーズ候補',
      scanFull: '全件取得',
      scanSimple: '簡易更新',
      openLibrary: 'Kindle一覧',
      openFullPage: '専用ページ',
      sortPriority: '優先度順',
      sortDiscount: '割引率順',
      checkVisible: '一括再確認',
      checkSimpleBtn: '新刊チェック',
      langLabel: '言語',

      // --- Options ---
      unscannerPrompt: '未スキャンです。Amazon の Kindle 一覧ページでスキャンしてください。',
      scanSummaryOptions: function (n, m) { return n + '冊 / ' + m + 'シリーズ'; },
      noFilteredSeries: '条件に一致するシリーズがありません。',
      noSeries: 'シリーズがありません。',
      priorityOff: '☆ 優先解除',
      priorityOn: '★ 優先表示',
      recheckBtn: '↻ 再確認',
      checkNextBtn: '↻ 次巻を確認',
      completeOff: '○ 完結解除',
      completeOn: '✓ 完結にする',
      cannotCompleteHasNext: '続刊があるため完結にできません',
      excludeOff: '除外解除',
      excludeOn: '除外',
      searchAmazonOptions: '↗ Amazonで探す',
      missingText: function (text) { return '欠番 ' + text; },
      checkingIcon: '↻ 照会中…',
      recheckIcon: '↻ 再確認',
      abortBtn: '× 中止',
      bulkSummaryMsg: function (series, done, label) { return series + 'シリーズ（' + done + '件' + label + '）'; },
      bulkAborted: ' ／ 中止しました',
      checkAllBtn: '↻ 一括続刊再確認',
      newCheckBtn: '＋ 新刊チェック（簡易）',
      noRecheckTargetsOptions: '再確認対象なし',
      cacheCleared: function (base) { return '照会キャッシュをクリアしました ／ ' + base; },
      scanCleared: 'スキャン結果をクリアしました。再スキャンしてください。',

      // Options HTML static
      pageTitle: 'Kindle シリーズ続刊トラッカー',
      themeLabel: 'テーマ',
      themeAuto: 'OSに合わせる',
      themeLight: 'ライト',
      themeDark: 'ダーク',
      searchPlaceholder: 'シリーズ名・著者で絞り込み',
      sortLabel: '並び替え',
      sortCount: '所有冊数（多い順）',
      sortVolume: '最高巻（大きい順）',
      sortDiscount2: '割引率（高い順）',
      sortTitle: 'タイトル（あいうえお順）',
      filterMissing: '欠番あり',
      filterPriority: '優先のみ',
      filterStatusLabel: '続刊',
      filterStatusAll: 'すべて',
      filterStatusHasNext: '続刊あり',
      filterStatusNoNext: '続刊なし',
      filterStatusUnchecked: '未照会',
      filterHideCompleted: '完結を隠す',
      filterExcluded: '除外を隠す',
      filterSale: 'セール中',
      clearCache: '× 照会キャッシュをクリア',
      clearScan: '× スキャン結果をクリア',
      clearNote: '※完結・優先フラグは保持されます',
      confirmClearCache: '照会キャッシュを削除しますか？\n続刊・セール情報がリセットされ、再照会が必要になります。',
      confirmClearScan: 'スキャン結果を削除しますか？\nシリーズ一覧がクリアされます。再スキャンが必要です。\n（完結・優先・除外フラグは保持されます）',
      dangerHeading: 'データ削除',
      automationHeading: '自動化',
      autoScanLabel: 'Kindle一覧ページ訪問時に自動スキャン',
      autoScanIntervalLabel: 'スキャン間隔',
      bgProbeLabel: 'バックグラウンドで続刊・セールを確認',
      bgProbeIntervalLabel: '照会間隔',
      statusHeading: '実行状況',
      autoScanStatusLabel: '自動スキャン',
      bgProbeStatusLabel: '続刊・セール確認',
      statusEnabled: 'ON',
      statusDisabled: 'OFF',
      statusNeverRun: 'なし',
      statusProvisional: '（予定）',
      statusLastRun: function (date) { return '前回 ' + date; },
      statusLastNone: '前回 なし',
      statusNextRun: function (date) { return '次回 ' + date; },
      statusProgress: function (done, total) { return '確認中 ' + done + '/' + total; },
      statusAutoChecking: function (date) { return '発火 ' + date + ' / 判定中'; },
      statusAutoSkippedNotDue: function (date, next) {
        return '発火 ' + date + ' / 間隔未到来（次回 ' + next + '）';
      },
      statusAutoSkippedNoBaseline: function (date) {
        return '発火 ' + date + ' / 初回データなしのため未実行';
      },
      statusAutoRunning: function (triggered, value, max) {
        return '発火 ' + triggered + ' / 実行中 ' + value + (max > 0 ? '/' + max : '') + '件確認';
      },
      statusAutoCompleted: function (triggered, date, total, added) {
        return '発火 ' + triggered + ' / 完了 ' + date + ' / ' + total + '冊（追加 ' + added + '）';
      },
      statusAutoFailed: function (triggered, date) {
        return '発火 ' + triggered + ' / 失敗 ' + date;
      },
      statusRunRunning: function (done, total, failed) {
        return '実行中 ' + done + '/' + total + (failed ? '（失敗 ' + failed + '）' : '');
      },
      statusRunCompleted: function (date, total, failed) {
        return '完了 ' + date + ' / ' + total + '件' + (failed ? '（失敗 ' + failed + '）' : '');
      },
      statusRunFailed: function (date, done, total) {
        return '中断 ' + date + ' / ' + done + '/' + total;
      },
      statusBreakdown: function (next, discount) { return '続刊あり ' + next + ' / セール ' + discount; },
      days3: '3日',
      days7: '7日',
      days14: '14日',
      hours12: '12時間',
      hours24: '24時間',
      hours48: '48時間',
      topLink: '↑ トップへ',

      // --- series-card.js ---
      completed: '完結',
      priceText: function (text) { return '価格 ' + text; },
      unchecked: '未照会',
      stale: '要再確認',
      hasNextVol: function (vol) { return '続刊 ' + vol + '巻'; },
      buyPage: '購入ページ',
      noNextVol: '続刊なし',
      unknown: '判定不能',
      latestVolInfo: function (vol, date) { return '最新 ' + vol + '巻' + date; },
      completionCostPartial: function (est) { return '完結コスト 約￥' + est.toLocaleString('ja-JP') + '（推定）'; },
      completionCostFull: function (cost, count) { return '完結コスト ￥' + cost.toLocaleString('ja-JP') + '（' + count + '巻）'; },

      // --- content.js ---
      fullScanProgress: function (pass, total) { return 'Kindle蔵書を全件取得中（' + pass + '/' + total + '）'; },
      simpleScanProgress: '新着を確認中…（既知に到達で停止）',
      amazonErrorStatus: function (status) { return 'Amazon の応答が ' + status + ' でした。'; },
      amazonFetchError: 'Amazon 側で取得に失敗しました。',
      dataFormatError: 'Kindle 所有データの形式を認識できませんでした。',
      extensionUpdated: '拡張機能が更新されました。この Kindle 一覧ページを再読み込み（F5）してから、もう一度スキャンしてください。',
      csrfNotFound: 'csrfToken が見つかりません。Amazon.co.jp にログインし直してから再試行してください。',
      simpleScanNeedsBase: '簡易更新には前回のスキャン結果が必要です。先に「全件取得」を実行してください。',
      addedBooks: function (n) { return '新着' + n + '冊を追加'; },
      basicScanDetail: function (n, m) { return n + '冊 / ' + m + 'シリーズ候補'; },
      simpleScanDetail: function (added, n, m) { return added + ' / 計' + n + '冊・' + m + 'シリーズ候補'; },
      degradedDetail: function (n) { return '明細' + n + '冊は未保存（簡易更新・CSV/JSONは要再取得）'; },
      quotaWarning: '保存容量の上限によりシリーズ一覧のみ保存しました',
      scanComplete: 'Kindle蔵書の取得が完了しました',
      scanFailed: 'Kindle蔵書の取得に失敗しました',
      progressDetail: function (value, max, pct) { return value.toLocaleString() + ' / ' + (max ? max.toLocaleString() : '?') + ' 件（' + pct + '%）'; },
    },

    en: {
      // --- Shared ---
      unknownAuthor: 'Unknown author',
      volumeUnknown: 'Volume unknown',
      ownedText: function (text) { return 'Owned: ' + text; },
      recheck: 'Recheck',
      checking: 'Checking…',
      checkingSeriesStatus: function (title) { return 'Checking next volumes for ' + title + '…'; },
      noNewCheck: 'No series to check',
      priorityBadge: 'Priority',
      recheckLabel: 'Recheck',
      newCheckLabel: 'Checking',
      bulkProgress: function (label, done, total) { return label + '… ' + done + '/' + total; },

      // --- Popup ---
      unscanned: 'Not scanned',
      openLibraryPrompt: 'Open your Kindle library and click "Full Scan".',
      scanSummaryPopup: function (n, m) { return n + ' books / ' + m + ' series'; },
      noSeriesFound: 'No series candidates found. Unusual title formats may be supported in future detection updates.',
      bookCount: function (n) { return n + ' vols'; },
      latestAlt: function (title) { return title + ' — latest volume'; },
      checkNext: 'Check next vol.',
      checkNextTitle: 'Query Amazon for the next volume and price',
      checkNextDisabledTitle: 'Cannot check — volume number unknown',
      searchAmazon: 'Search Amazon for series',
      moreItems: function (n) { return n + ' more — see all series, gaps, and new volumes on the "Full Page".'; },
      lastScan: function (date) { return 'Last scan: ' + date; },
      checkSaved: 'Query results saved.',
      noRecheckTargetsPopup: 'No series to recheck.',
      bulkDone: function (done, label) { return 'Completed ' + label + ' for ' + done + ' visible series.'; },
      openLibraryFirst: 'Please open your Kindle library page first.',
      reloadPage: 'Please reload the page (F5) and try again.',
      noResponse: 'No response received.',
      checkingNew: 'Checking for new books…',
      startingFullScan: 'Starting full scan…',
      simpleScanDone: 'Quick update complete.',
      fullScanDone: 'Full scan complete.',
      exportFetching: 'Fetching all books for export…',
      exportFailed: 'Failed to fetch books.',
      exportDone: function (n) { return 'Export complete (' + n + ' books).'; },
      simpleScanTitle: 'Quickly fetch only new purchases since the last scan',
      simpleScanDisabledTitle: 'Run "Full Scan" first',

      // Popup HTML static
      seriesCandidates: 'Series Candidates',
      scanFull: 'Full Scan',
      scanSimple: 'Quick Update',
      openLibrary: 'Kindle Library',
      openFullPage: 'Full Page',
      sortPriority: 'Priority first',
      sortDiscount: 'Discount first',
      checkVisible: 'Recheck visible',
      checkSimpleBtn: 'New vol. check',
      langLabel: 'Language',

      // --- Options ---
      unscannerPrompt: 'Not scanned yet. Please open your Amazon Kindle library page and scan.',
      scanSummaryOptions: function (n, m) { return n + ' books / ' + m + ' series'; },
      noFilteredSeries: 'No series match the current filter.',
      noSeries: 'No series found.',
      priorityOff: '☆ Unset priority',
      priorityOn: '★ Set priority',
      recheckBtn: '↻ Recheck',
      checkNextBtn: '↻ Check next',
      completeOff: '○ Unmark completed',
      completeOn: '✓ Mark as completed',
      cannotCompleteHasNext: 'Cannot mark as completed — has confirmed next volume',
      excludeOff: 'Un-exclude',
      excludeOn: 'Exclude',
      searchAmazonOptions: '↗ Search Amazon',
      missingText: function (text) { return 'Gap: ' + text; },
      checkingIcon: '↻ Checking…',
      recheckIcon: '↻ Recheck',
      abortBtn: '× Abort',
      bulkSummaryMsg: function (series, done, label) { return series + ' series (' + done + ' ' + label + ')'; },
      bulkAborted: ' / Aborted.',
      checkAllBtn: '↻ Recheck all series',
      newCheckBtn: '＋ New volume check',
      noRecheckTargetsOptions: 'No series to recheck',
      cacheCleared: function (base) { return 'Query cache cleared / ' + base; },
      scanCleared: 'Scan data cleared. Please re-scan.',

      // Options HTML static
      pageTitle: 'Kindle Series Sale Tracker',
      themeLabel: 'Theme',
      themeAuto: 'Follow system',
      themeLight: 'Light',
      themeDark: 'Dark',
      searchPlaceholder: 'Filter by series name or author',
      sortLabel: 'Sort',
      sortCount: 'Books owned (most first)',
      sortVolume: 'Highest volume (desc)',
      sortDiscount2: 'Discount rate (highest first)',
      sortTitle: 'Title (A–Z)',
      filterMissing: 'Has gaps',
      filterPriority: 'Priority only',
      filterStatusLabel: 'Next vol.',
      filterStatusAll: 'All',
      filterStatusHasNext: 'Has next',
      filterStatusNoNext: 'No next',
      filterStatusUnchecked: 'Unchecked',
      filterHideCompleted: 'Hide completed',
      filterExcluded: 'Hide excluded',
      filterSale: 'On sale',
      clearCache: '× Clear query cache',
      clearScan: '× Clear scan data',
      clearNote: '* Completed/priority flags are preserved.',
      confirmClearCache: 'Clear the query cache?\nNext-volume and sale info will be reset. You will need to re-check.',
      confirmClearScan: 'Clear scan data?\nThe series list will be cleared. You will need to re-scan.\n(Completed, priority, and excluded flags are preserved.)',
      dangerHeading: 'Data Deletion',
      automationHeading: 'Automation',
      autoScanLabel: 'Auto-scan when visiting the Kindle library',
      autoScanIntervalLabel: 'Scan interval',
      bgProbeLabel: 'Check next volumes and sales in the background',
      bgProbeIntervalLabel: 'Check interval',
      statusHeading: 'Status',
      autoScanStatusLabel: 'Auto scan',
      bgProbeStatusLabel: 'Next vol & sale',
      statusEnabled: 'ON',
      statusDisabled: 'OFF',
      statusNeverRun: 'none',
      statusProvisional: '(est.)',
      statusLastRun: function (date) { return 'Last ' + date; },
      statusLastNone: 'Last none',
      statusNextRun: function (date) { return 'Next ' + date; },
      statusProgress: function (done, total) { return 'Checking ' + done + '/' + total; },
      statusAutoChecking: function (date) { return 'Triggered ' + date + ' / Checking'; },
      statusAutoSkippedNotDue: function (date, next) {
        return 'Triggered ' + date + ' / Not due (next ' + next + ')';
      },
      statusAutoSkippedNoBaseline: function (date) {
        return 'Triggered ' + date + ' / Skipped: no baseline';
      },
      statusAutoRunning: function (triggered, value, max) {
        return 'Triggered ' + triggered + ' / Running ' + value + (max > 0 ? '/' + max : '') + ' checked';
      },
      statusAutoCompleted: function (triggered, date, total, added) {
        return 'Triggered ' + triggered + ' / Completed ' + date + ' / ' + total + ' books (' + added + ' added)';
      },
      statusAutoFailed: function (triggered, date) {
        return 'Triggered ' + triggered + ' / Failed ' + date;
      },
      statusRunRunning: function (done, total, failed) {
        return 'Running ' + done + '/' + total + (failed ? ' (' + failed + ' failed)' : '');
      },
      statusRunCompleted: function (date, total, failed) {
        return 'Completed ' + date + ' / ' + total + (failed ? ' (' + failed + ' failed)' : '');
      },
      statusRunFailed: function (date, done, total) {
        return 'Stopped ' + date + ' / ' + done + '/' + total;
      },
      statusBreakdown: function (next, discount) { return 'Next vol ' + next + ' / Sale ' + discount; },
      days3: '3 days',
      days7: '7 days',
      days14: '14 days',
      hours12: '12 hours',
      hours24: '24 hours',
      hours48: '48 hours',
      topLink: '↑ Top',

      // --- series-card.js ---
      completed: 'Completed',
      priceText: function (text) { return 'Price: ' + text; },
      unchecked: 'Unchecked',
      stale: 'Needs recheck',
      hasNextVol: function (vol) { return 'Next: vol.' + vol; },
      buyPage: 'Buy page',
      noNextVol: 'No next vol.',
      unknown: 'Unknown',
      latestVolInfo: function (vol, date) { return 'Latest: vol.' + vol + date; },
      completionCostPartial: function (est) { return 'Est. completion: ¥' + est.toLocaleString('ja-JP'); },
      completionCostFull: function (cost, count) { return 'Completion: ¥' + cost.toLocaleString('ja-JP') + ' (' + count + ' vols)'; },

      // --- content.js ---
      fullScanProgress: function (pass, total) { return 'Scanning Kindle library (' + pass + '/' + total + ')'; },
      simpleScanProgress: 'Checking for new books… (stops at known books)',
      amazonErrorStatus: function (status) { return 'Amazon returned status ' + status + '.'; },
      amazonFetchError: 'Amazon returned an error.',
      dataFormatError: 'Could not recognize Kindle ownership data format.',
      extensionUpdated: 'Extension was updated. Please reload (F5) this Kindle library page and try again.',
      csrfNotFound: 'csrfToken not found. Please sign in to Amazon.co.jp again.',
      simpleScanNeedsBase: 'Quick update requires a previous scan result. Please run "Full Scan" first.',
      addedBooks: function (n) { return 'Added ' + n + ' new book' + (n !== 1 ? 's' : ''); },
      basicScanDetail: function (n, m) { return n + ' books / ' + m + ' series'; },
      simpleScanDetail: function (added, n, m) { return added + ' / Total: ' + n + ' books, ' + m + ' series'; },
      degradedDetail: function (n) { return n + ' books not saved (quick update/CSV/JSON requires re-scan)'; },
      quotaWarning: 'Storage limit reached — saved series list only',
      scanComplete: 'Kindle library scan complete',
      scanFailed: 'Kindle library scan failed',
      progressDetail: function (value, max, pct) { return value.toLocaleString() + ' / ' + (max ? max.toLocaleString() : '?') + ' items (' + pct + '%)'; },
    },
  };

  function normalizeLanguage(language) {
    return language === 'en' ? 'en' : 'ja';
  }

  function translate(language, key) {
    var args = Array.prototype.slice.call(arguments, 2);
    var table = TEXT[normalizeLanguage(language)] || TEXT.ja;
    var value = table[key];
    if (value === undefined) value = TEXT.ja[key];
    if (value === undefined) return key;
    return typeof value === 'function' ? value.apply(null, args) : value;
  }

  function applyI18n(container, language) {
    var root = container || document;
    var lang = normalizeLanguage(language);
    root.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var value = translate(lang, key);
      if (value) el.textContent = value;
    });
    root.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-title');
      var value = translate(lang, key);
      if (value) el.title = value;
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      var value = translate(lang, key);
      if (value) el.placeholder = value;
    });
  }

  return { LANGUAGE_KEY: LANGUAGE_KEY, normalizeLanguage: normalizeLanguage, translate: translate, applyI18n: applyI18n };
});
