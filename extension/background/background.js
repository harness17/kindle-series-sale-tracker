(function () {
  'use strict';

  if (
    typeof chrome !== 'undefined' &&
    chrome.sidePanel &&
    typeof chrome.sidePanel.setPanelBehavior === 'function'
  ) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((e) => console.error(e));
  }
})();
