# Release And Store

## 事前ゲート

manifest権限変更、版上げ、release package生成、store-assets更新、提出、公開は通常実装と分けて扱い、ユーザーの明示確認を得る。

release前に次を確認する。

- Chrome / Firefox manifest の version、name、description、permissions、host_permissions
- Chrome offscreen / sidePanel と Firefox background scripts / sidebar_action の差分
- `_locales/ja` / `_locales/en` と listing の機能説明
- 自動スキャン、バックグラウンド照会、保存データ、外部通信、削除方法の説明
- `PRIVACY.md`、listing、reviewer notes、実装の一致
- 全 verify、dev build、release package inspection

## Listing 同期

ユーザー向け挙動が変わる場合は、コードだけで完了にしない。次のうち影響するものを同期する。

- `README.md`
- `PRIVACY.md`
- `store-assets/chrome/listing-ja.md` / `listing-en.md`
- `store-assets/firefox/listing-ja.md` / `listing-en.md`
- reviewer notes / submission checklist
- manifest version と release notes

特に、自動処理の発火条件、全件巡回、実行状況、permissions、データ保存量、quota縮退、外部通信の変更は listing と reviewer notes の対象。

## Reviewer Notes

- AMO Notes to Reviewer は 3,000文字以内、Chrome Test Instructions は 4,000文字を目安にする。
- 優先順は、再提出修正、目的、技術要点、通信先と発火条件、最小テスト手順、ソースURL。
- Firefox 向けでは動的値を `innerHTML` に入れず、Chrome 専用 API はブラケット参照と runtime guard を使う。
- reviewer notes に個人の蔵書、ローカル絶対パス、token、未公開情報を書かない。

## Package Inspection

生成ZIPはソースディレクトリの正しさだけで安全とみなさず、実際の内容を確認する。

- 対象browserのmanifestだけが `manifest.json` として入っている
- `tmp/`、fixture、store screenshot、handoff、開発メモ、個人データ、secretが入っていない
- Chrome packageにFirefox固有manifestが混入せず、その逆もない
- version付き出力名とmanifest versionが一致する

公開前には、本文、metadata、画像、ファイル名、URL、README、reviewer notesを含めて個人情報とローカル環境情報を確認する。
