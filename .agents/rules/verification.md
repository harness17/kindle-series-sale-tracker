# Verification

## テスト観点

実装前に、変更に応じて正常、境界、無効入力、認証・利用前提、失敗継続、重複実行・冪等性を列挙する。バグ修正では修正前に失敗する regression case を追加または特定する。

## Verify コマンド

```powershell
node .\verify-kindle-library.mjs
node .\verify-catalog-probe.mjs
node .\verify-series-card.mjs
node .\verify-background-probe.mjs
node .\verify-auto-scan.mjs
```

- `verify-kindle-library.mjs`: 所有データ抽出、正規化、シリーズ推定、最小保存、CSV、所有レンジ・欠番、quota関連、エクスポート範囲選択（selectRecentBooks の日付順・上限・無効入力）
- `verify-catalog-probe.mjs`: 検索結果抽出、価格、シリーズ照合、次巻・版型・ページ追加
- `verify-series-card.mjs`: catalog reconcile、カード状態、照会フロー
- `verify-background-probe.mjs`: 全件巡回、chunk継続、失敗継続、重複実行防止、状態保存
- `verify-auto-scan.mjs`: 発火、期限スキップ、基準無しスキップ、完了、失敗状態

## 変更別の最低ライン

- `shared/kindle-library.js` / `content.js`: kindle-library + auto-scan
- `shared/catalog-probe.js`: catalog-probe + series-card + background-probe
- `shared/series-card.js`: series-card + catalog-probe + background-probe
- `background/` / `offscreen/`: background-probe + catalog-probe + series-card
- popup / options / i18n: 関連 shared verify + JavaScript構文確認 + dev build
- manifests: 全 verify + dev build
- release package / version / permissions: 全 verify + dev build + release package inspection

依存関係が広い変更や判断に迷う場合は、5本すべて実行する。

## Build

`extension/` または `manifests/` を変更したら必須:

```powershell
.\scripts\build-dev.ps1 -Target all
```

`dist/dev/chrome` と `dist/dev/firefox` は Git 管理外だが、ローカル実動確認の入力なのでソース変更後に再生成する。

release作業でのみ実行:

```powershell
.\scripts\package-release.ps1 -Target all
```

package生成前にユーザー確認を得て、生成後は両manifest、ZIP内容、版番号、不要ファイル混入を確認する。

## 最終報告

- 実行したコマンドと結果
- 実行できなかった確認と理由
- Amazon ログイン済み実機でしか確認できない範囲
- 既存の未コミット変更と今回の変更範囲

を簡潔に記載する。未実施を pass と表現しない。
