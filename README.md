# Kindle Series Sale Tracker

Amazon.co.jp の Kindle 蔵書一覧からシリーズ候補を抽出し、続刊確認用のリストを作る Chrome / Firefox 拡張プロトタイプです。

## できること

- Amazon.co.jp のデジタルコンソールから購入済み Kindle 本の一覧を取得
- タイトルと著者からシリーズ候補と所有巻数を簡易推定
- 次巻候補を探す Amazon 検索リンクを表示
- Amazon 検索結果から取れた場合だけ、続刊候補の価格・割引率・発売日・表紙を表示
- 取得結果を CSV / JSON でエクスポート

## まだできないこと

- 未購入巻のASIN確定
- ポイント情報の自動取得
- Kindle Unlimited、Audible、紙本の横断管理

## インストール

- [Chrome Web Store](https://chromewebstore.google.com/detail/kindle-%E3%82%B7%E3%83%AA%E3%83%BC%E3%82%BA%E7%B6%9A%E5%88%8A%E3%83%88%E3%83%A9%E3%83%83%E3%82%AB%E3%83%BC/aiemlodfimjjbeejdghomifkhhhaekfm)
- [Firefox Add-ons](https://addons.mozilla.org/ja/firefox/addon/kindle-series-sale-tracker/)

## 開発用の読み込み

1. `.\scripts\build-dev.ps1` を実行（拡張をビルド。コード変更のたびに実行）
2. `chrome://extensions/` を開き、デベロッパーモードをオン
3. 「パッケージ化されていない拡張機能を読み込む」で `dist/dev/chrome` を選択（パスは固定。以後は手順1の再実行 → 🔄 リロードで反映）
4. 拡張ポップアップから「Kindle一覧を開く」を押す
5. Amazon.co.jp にログイン済みの状態で「このページをスキャン」を押す

Firefox は `.\scripts\build-dev.ps1 -Target all` を実行し、`about:debugging#/runtime/this-firefox` から `dist/dev/firefox/manifest.json` を一時的なアドオンとして読み込みます。

> 開発用ロードはバージョン名のない固定パス `dist/dev/<browser>/` を使うため、版を上げてもフォルダを選び直す必要はありません。出力先 `dist/` は Git 管理外です。ストア提出用の版番号付きパッケージは `scripts/package-release.ps1` で別途生成します。

## Verify

```powershell
node .\verify-kindle-library.mjs
node .\verify-catalog-probe.mjs
node .\verify-series-card.mjs
.\scripts\build-dev.ps1 -Target all
.\scripts\package-release.ps1 -Target all
```

## 実装メモ

Kindle 所有データは、Amazon.co.jp のデジタルコンソール上で同一オリジンの Ajax に問い合わせて取得します。これは公開された安定 API ではないため、Amazon 側のページ変更で壊れる前提で fixture と検証を追加していきます。

## 関連記事

- [外部サイトの解析結果が全件unknownになったので「既存値保持」と「連続失敗」を分けた](https://zenn.dev/harness/articles/chrome-extension-unknown-cache-preserve-design) (2026-06-20)
- [Chrome拡張のポップアップをサイドパネルへ移したのは状態保存では根本解決にならなかったため](https://zenn.dev/harness/articles/chrome-extension-popup-to-sidepanel) (2026-06-20)
