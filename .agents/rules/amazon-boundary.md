# Amazon Boundary

## 対象と通信

- 所有データ対象: `https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll*`
- Ajax: 同一オリジンの `GetContentOwnershipData`
- 続刊・セール確認: Amazon.co.jp 検索結果を、拡張機能の明示機能または有効化済み自動化から取得する
- developer-operated server や第三者解析基盤へ蔵書・検索結果・設定を送信しない
- password、cookie、CSRF token、ログイン情報を保存・ログ出力・handoff記載しない

## 入力と失敗

- Amazon 応答、DOM、URL、価格文字列は外部入力として検証する。
- HTTP失敗、JSON形式変更、CSRF token 不在、拡張再読み込み後の無効 context、部分的な検索失敗を区別する。
- 追加ソート軸や個別シリーズの失敗は、既に取得済みデータを破棄せず継続できる設計を優先する。
- ユーザー向けには内部パス、stack trace、storage構造、生の例外全文を出さない。

## Fixture

- 新しい DOM パターンや抽出バグは、先に再現 fixture と失敗する regression case を追加する。
- ログイン必須ページはエージェント側で認証を迂回しない。必要な DOM はユーザー提供素材から作る。
- 提供HTMLをそのまま保存しない。テストに必要な最小部分だけを残し、氏名、蔵書タイトル一覧、ASIN、注文・購入情報、URL query、token、account識別子を匿名化する。
- fixture の値は架空データへ置換しても、selector、属性構造、価格表記、版型判定に必要な差分を保つ。
- `parseSearchResultsFromDoc` の変更は、可能な限り文字列だけの単体例ではなく DOM fixture でも検証する。

## 権限

- `host_permissions` は Amazon.co.jp の必要範囲を超えて広げない。
- 新しい permission、host、常駐処理、外部通信を追加する前に、用途、発火条件、保存内容、ストア説明への影響を示してユーザー確認を得る。
- Chrome 専用 API は runtime guard を置き、Firefox package から到達しても壊れない参照方法を使う。

## 実ブラウザ確認

未認証ブラウザでは Kindle 蔵書ページの完全確認はできない。実動確認を依頼するときは、次だけを示す。

1. `dist/dev/<browser>` を再読み込み
2. Amazon.co.jp にログイン済みの Kindle 一覧を開く
3. 対象操作を1回実行
4. UI結果と、必要な場合だけ匿名化した console / DOM 断片を共有
