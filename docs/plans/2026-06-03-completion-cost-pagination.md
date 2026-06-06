# 完結コスト精度向上：ページネーション追加検索

- ベースコミット: `4769c25`
- 対象ブランチ: `feature/storage-lite-and-scan-modes`

## 背景

ギャップ検出+補完検索を追加したが、Golgo 13（108〜216巻、期待スパン109巻）のような
大規模シリーズでは初回+補完の合計約40件が 50% 閾値を超えられず完結コストが非表示のまま。

ギャップ検出が発動したとき、初回 URL に `&page=2〜5` を付けた追加ページを取得し、
80〜90% カバレッジを達成して完結コストを表示可能にする。

## スプリントコントラクト

- 正常系: 所有107巻・最新216巻のシリーズで完結コストが表示される（50%超カバレッジ達成）
- ギャップなし: ギャップ検出が発動しないシリーズでは追加ページ取得を実行しない
- ページ失敗: 途中のページ取得が失敗しても、取得済み分で計算して表示する
- 副作用: `verify-catalog-probe.mjs` が引き続き全 pass する
- dist: `scripts\build-dev.ps1 -Target all` が成功する

## 変更ファイル

- `extension/shared/series-card.js`（唯一の変更先）

変更しないファイル:
- `extension/shared/catalog-probe.js`
- `verify-catalog-probe.mjs`
- `manifests/` 以下

## 実装チェックリスト

- [ ] `probeSeries` のギャップ検出ブロック内に追加ページ取得を実装する

  現在の構造:
  ```js
  if (result.status === 'has-next' && result.nextVolume > group.highestVolume + 3) {
    try {
      // 補完検索（既存）
      const gapUrl = seriesSearchUrl(...);
      const gapResults = await fetchSearchResults(catalog, gapUrl);
      const mergedResult = catalog.detectNextVolume(primaryResults.concat(gapResults), ...);
      if (mergedResult.status === 'has-next') result = mergedResult;
    } catch (error) { /* keep primary */ }
  }
  ```

  変更後の構造:
  ```js
  if (result.status === 'has-next' && result.nextVolume > group.highestVolume + 3) {
    try {
      // 追加ページ取得（新規）
      const EXTRA_PAGES = 4;
      const extraResults = [];
      for (let page = 2; page <= EXTRA_PAGES + 1; page++) {
        try {
          const pageUrl = group.searchUrl + (group.searchUrl.includes('?') ? '&' : '?') + `page=${page}`;
          const pageData = await fetchSearchResults(catalog, pageUrl);
          extraResults.push(...pageData);
        } catch (_) { /* ページ失敗はスキップ */ }
      }

      // 補完検索（既存・維持）
      const gapUrl = seriesSearchUrl(`${group.seriesKey || group.title} ${group.highestVolume + 1}`, '');
      const gapResults = await fetchSearchResults(catalog, gapUrl);

      // マージして再評価
      const allResults = primaryResults.concat(extraResults).concat(gapResults);
      const mergedResult = catalog.detectNextVolume(allResults, {
        seriesTitle: group.title,
        seriesKey: group.seriesKey,
        highestVolume: group.highestVolume,
        ownedImprint: group.imprint,
      });
      if (mergedResult.status === 'has-next') result = mergedResult;
    } catch (error) { /* keep primary */ }
  }
  ```

- [ ] `node verify-catalog-probe.mjs` が全 pass することを確認する

- [ ] PowerShell で `scripts\build-dev.ps1 -Target all` を実行して `dist/dev` を更新する

- [ ] `git add extension/shared/series-card.js` して `git commit` する（`git add -A` 禁止）

## 補足

- `group.searchUrl` は `https://www.amazon.co.jp/s?k=...&i=digital-text` 形式なので
  `&page=2` を末尾に追加すれば Amazon のページネーションが動作する
- ページ取得は逐次（for ループ）でよい。並列化は Amazon の rate limit リスクがあるため行わない
- 各ページ失敗は inner try/catch でスキップし、outer catch には到達させない
