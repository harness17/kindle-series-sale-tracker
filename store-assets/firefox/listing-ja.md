# Firefox Add-ons Listing Draft

## Upload Package

- Zip: `dist/firefox/kindle-series-sale-tracker-firefox-v0.4.0.zip`
- Version: `0.4.0`
- Extension ID: `kindle-series-sale-tracker@harness`

## Graphic Assets

- Icon: `extension/icons/icon128.png`
- Screenshot 1: `store-assets/firefox/screenshots/01-options-list-1280x800.png`
- Screenshot 2: `store-assets/firefox/screenshots/02-side-panel-1280x800.png`

## Basic Information

- Name: `Kindle Series Sale Tracker`
- Summary:

```text
Amazon.co.jpのKindle蔵書からシリーズ候補を抽出し、続刊・価格確認リストを作ります。
```

- Category: `Shopping`
- Language: `Japanese`
- Homepage: `https://github.com/harness17/kindle-series-sale-tracker`
- Support site: `https://github.com/harness17/kindle-series-sale-tracker/issues`
- Privacy Policy: `https://github.com/harness17/kindle-series-sale-tracker/blob/main/PRIVACY.md`
- License: choose `Other / All rights reserved` unless you decide to add an OSS license file before submission.

## Description

```text
Kindle Series Sale Tracker は、Amazon.co.jp のKindle蔵書一覧からシリーズ候補を抽出し、続刊確認用のリストを作るFirefox拡張機能です。

主な機能:
- Amazon.co.jp のKindle蔵書一覧をユーザー操作でスキャン
- タイトルと著者からシリーズ候補を推定
- 所有巻レンジと欠番候補を表示
- Amazon検索結果から取れた場合だけ、続刊候補の価格・割引率・発売日・表紙を表示
- シリーズごとの優先表示、完結、除外フラグをローカル保存
- CSV / JSON でスキャン結果をエクスポート
- Firefoxサイドバーと専用ページで一覧を確認
- バックグラウンドで定期的に続刊・セール情報を自動チェック（オプトイン）
- Kindle一覧ページ訪問時に蔵書を自動スキャン（オプトイン）
- 自動実行の状況（前回・次回の実行、続刊あり・セールの件数）をサイドバーと専用ページで確認

データの扱い:
取得した蔵書データ、続刊チェック結果、設定はブラウザ内のローカルストレージに保存されます。開発者のサーバーへ送信しません。バックグラウンドの自動チェックもAmazon.co.jp内のページのみを対象とし、結果はローカルに保存されます。AmazonのCookie、ログイン情報、パスワードは保存しません。

注意:
この拡張機能はAmazon.co.jpの画面と内部応答に依存します。Amazon側の仕様変更により、取得や続刊チェックが動かなくなる場合があります。価格・割引率・発売日は検索結果から取得できた場合だけ表示します。
```

## Version Notes (0.4.0)

```text
Version 0.4.0

新機能:
- 自動スキャン／続刊・セール確認の「実行状況」表示（前回・次回・進捗・続刊あり/セール件数）をサイドバーと設定ページに追加。初期は折りたたみ
- 続刊・セール確認が起動/更新時のキャッチアップで実行されるようになり、拡張の再読込・更新後も確実に動作
- 自動スキャンは簡易（差分）取得のみに整理
- 新規パーミッションなし

過去の更新（0.3.0）:
- バックグラウンドでの続刊・セール自動チェック（オプトイン、バッジ通知）
- Kindle一覧ページ訪問時の自動スキャン（オプトイン）
- データ削除に確認ダイアログを追加
- 除外フラグの反映、検索条件の保存

過去の更新:
- 日本語 / 英語 UI 切り替え
- シリーズ完結コストの推定
- 長期シリーズの続刊検出精度向上（欠番検出・補助検索・ページネーション）
- MITライセンス・プライバシーポリシー
```

## Data Collection / Privacy

Manifest setting:

```json
"data_collection_permissions": {
  "required": ["none"]
}
```

Explanation:

```text
この拡張機能は、開発者または第三者のサーバーへ個人データを収集・送信しません。

Kindle蔵書ページとAmazon.co.jp検索結果ページの内容は、拡張機能のユーザー向け機能を提供するため、ユーザーのブラウザ内で読み取り・解析します。スキャン結果、続刊チェック結果、設定はブラウザ内のローカルストレージに保存されます。

AmazonのCookie、ログイン情報、パスワードは保存・送信しません。
```

## Permission Justifications

### `storage`

```text
スキャン結果、続刊チェックのキャッシュ、テーマ設定、優先表示・完結・除外フラグ、自動化設定をブラウザ内に保存するために使用します。
```

### `alarms`

```text
バックグラウンドでの続刊・セール自動チェックのスケジュール管理に使用します。ユーザーがオプション画面で有効にした場合のみ動作します。
```

### `activeTab`

```text
ユーザーが現在開いているAmazon.co.jpのKindle蔵書ページに対して、ユーザー操作でスキャン開始メッセージを送るために使用します。
```

### `https://www.amazon.co.jp/*`

```text
Amazon.co.jpのKindle蔵書ページから蔵書一覧を取得し、Amazon.co.jp検索結果から続刊候補・価格・割引率を確認するために使用します。バックグラウンドの自動チェック時にもAmazon.co.jpの検索結果ページを取得します。対象はこの拡張機能の表示機能に必要なAmazon.co.jp内のページに限定しています。他のWebサイトへのアクセス権限は要求していません。
```

## Reviewer Notes

```text
This extension is designed for Amazon.co.jp Kindle library users.

Review steps:
1. Install the extension.
2. Open https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/ while signed in to an Amazon.co.jp account that has Kindle books.
3. Open the Firefox sidebar for "Kindle Series Sale Tracker".
4. Click "Kindle一覧" if the library page is not already open.
5. On the Kindle library page, click "全件取得" or "簡易更新".
6. After the scan completes, open "専用ページ" or the sidebar to view series candidates.
7. Click "再確認" or "新刊チェック（簡易）" to fetch Amazon.co.jp search results and show follow-up candidate information when available.
8. Open "専用ページ" and scroll to the "自動化" section. Enable "バックグラウンドで続刊・セールを確認" and "Kindle一覧ページ訪問時に自動スキャン" to test opt-in automation features.

No test account is provided because the extension only works with the reviewer's own Amazon.co.jp browser session. The extension does not collect or transmit Amazon credentials.

The extension stores scan results only in browser extension storage. It does not operate a backend server and does not send Kindle library data to the developer.
```

