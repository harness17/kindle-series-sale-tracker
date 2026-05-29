# Kindle Series Sale Tracker

Amazon.co.jp の Kindle 蔵書一覧からシリーズ候補を抽出し、続刊確認用のリストを作る Chrome 拡張プロトタイプです。

## できること

- Amazon.co.jp のデジタルコンソールから購入済み Kindle 本の一覧を取得
- タイトルと著者からシリーズ候補と所有巻数を簡易推定
- 次巻候補を探す Amazon 検索リンクを表示
- 取得結果を CSV / JSON でエクスポート

## まだできないこと

- 未購入巻のASIN確定
- 価格、ポイント、セール情報の自動取得
- Kindle Unlimited、Audible、紙本の横断管理

## 使い方

1. `.\scripts\package-release.ps1 -Target chrome` を実行
2. `chrome://extensions/` を開く
3. デベロッパーモードをオン
4. `dist/chrome/kindle-series-sale-tracker-chrome-v0.1.0` を「パッケージ化されていない拡張機能」として読み込む
5. 拡張ポップアップから「Kindle一覧を開く」を押す
6. Amazon.co.jp にログイン済みの状態で「このページをスキャン」を押す

## Verify

```powershell
node .\verify-kindle-library.mjs
.\scripts\package-release.ps1 -Target all
```

## 実装メモ

Kindle 所有データは、Amazon.co.jp のデジタルコンソール上で同一オリジンの Ajax に問い合わせて取得します。これは公開された安定 API ではないため、Amazon 側のページ変更で壊れる前提で fixture と検証を追加していきます。
