import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  extractOwnershipItems,
  buildSeriesSummary,
  summarizeNormalizedBooks,
  mergeScan,
  normalizeBook,
  toMinimalBook,
  toCsv,
  computeOwnedRanges,
  computeMissingVolumes,
  splitSeriesAndVolume,
} = require('./extension/shared/kindle-library.js');

const payload = JSON.parse(readFileSync('fixtures/ownership-response.json', 'utf8'));
const items = extractOwnershipItems(payload);
const series = buildSeriesSummary(items);
const csv = toCsv(items);
const serializedScan = JSON.stringify({ items, series });

// --- シリーズ推定（タイトル表記ゆれ）の回帰テスト ---
function summarize(titles) {
  const built = buildSeriesSummary(
    titles.map((title, i) => ({ title, authors: ['著者A'], asin: `T${i}` }))
  );
  return new Map(built.map((g) => [g.title, g]));
}

const bareNumber = summarize(['鬼滅の刃 1', '鬼滅の刃 2', '鬼滅の刃 3']);
const subtitle = summarize([
  '転生賢者の異世界ライフ 1 ～第二の職業を得て、世界最強になりました～',
  '転生賢者の異世界ライフ 2 ～第二の職業を得て、世界最強になりました～',
]);
const mixedNotation = summarize(['進撃の巨人（1）', '進撃の巨人 2', '進撃の巨人（3）']);
// 巻数の直後が空白でなく【】等の括弧でも巻数を認識し、同一シリーズに束ねる
const bracketAfterVolume = summarize([
  '小林さんちのメイドラゴン : 10 (アクションコミックス)',
  '小林さんちのメイドラゴン : 11【電子版は水着回がフルカラーだよ】 (アクションコミックス)',
  '小林さんちのメイドラゴン : 12 (アクションコミックス)',
]);
const leadingNumber = summarize(['1Q84', '20世紀少年']);
const differentSeries = summarize(['シリーズX 1', 'シリーズY 1']);

// 著者表記ゆれ（巻ごとに著者欄が違う）で同一シリーズが分裂しないことを確認する。
// 解体屋ゲン: 大半が石井さだよし名義、一部巻が星野茂樹名義 → 1シリーズに統合されるべき。
const authorVariation = buildSeriesSummary([
  { title: '解体屋ゲン 50巻', authors: ['石井さだよし'], asin: 'G50' },
  { title: '解体屋ゲン 51巻', authors: ['星野茂樹'], asin: 'G51' },
  { title: '解体屋ゲン 52巻', authors: ['石井さだよし'], asin: 'G52' },
  { title: '解体屋ゲン 53巻', authors: ['石井さだよし'], asin: 'G53' },
]).find((g) => g.title === '解体屋ゲン');

// 取得時の重複（同一 ASIN が複数回）を冊数に計上しないことを確認する
const duplicatedAsin = buildSeriesSummary([
  { title: 'ゾンビ屋れい子 1', authors: ['三家本礼'], asin: 'Z1' },
  { title: 'ゾンビ屋れい子 1', authors: ['三家本礼'], asin: 'Z1' },
  { title: 'ゾンビ屋れい子 1', authors: ['三家本礼'], asin: 'Z1' },
  { title: 'ゾンビ屋れい子 2', authors: ['三家本礼'], asin: 'Z2' },
  { title: 'ゾンビ屋れい子 2', authors: ['三家本礼'], asin: 'Z2' },
]).find((g) => g.title === 'ゾンビ屋れい子');

// 複数版（レーベル）所有: 同じ巻番号が別レーベルで重複する場合は版ごとに分割する。
// 私の少年: アクションコミックス 1-4 と ヤングマガジンコミックス 1,5,7（1巻が重複）。
const multiImprint = buildSeriesSummary([
  { title: '私の少年（1） (ヤングマガジンコミックス)', authors: ['高野ひと深'], asin: 'WY1' },
  { title: '私の少年（5） (ヤングマガジンコミックス)', authors: ['高野ひと深'], asin: 'WY5' },
  { title: '私の少年（7） (ヤングマガジンコミックス)', authors: ['高野ひと深'], asin: 'WY7' },
  { title: '私の少年 : 1 (アクションコミックス)', authors: ['高野ひと深'], asin: 'WA1' },
  { title: '私の少年 : 2 (アクションコミックス)', authors: ['高野ひと深'], asin: 'WA2' },
  { title: '私の少年 : 3 (アクションコミックス)', authors: ['高野ひと深'], asin: 'WA3' },
  { title: '私の少年 : 4 【電子コミック限定特典（カラーイラスト）付き】 (アクションコミックス)', authors: ['高野ひと深'], asin: 'WA4' },
]);
const myBoyAction = multiImprint.find((g) => g.title === '私の少年（アクションコミックス）');
const myBoyYM = multiImprint.find((g) => g.title === '私の少年（ヤングマガジンコミックス）');

// 単一レーベル内で同じ巻番号が重複（特装版）するだけのケースは分割しない。
// つぐもも: 24巻が通常版と【カバーイラストBOOK付】で重複するが、版は1種類。
const sameImprintDup = buildSeriesSummary([
  { title: 'つぐもも : 23 (アクションコミックス)', authors: ['浜田よしかづ'], asin: 'TG23' },
  { title: 'つぐもも : 24 (アクションコミックス)', authors: ['浜田よしかづ'], asin: 'TG24a' },
  { title: 'つぐもも : 24 【カバーイラストBOOK付】 (アクションコミックス)', authors: ['浜田よしかづ'], asin: 'TG24b' },
  { title: 'つぐもも : 25 (アクションコミックス)', authors: ['浜田よしかづ'], asin: 'TG25' },
]).filter((g) => g.title.startsWith('つぐもも'));

// レーベル改称（版名は2種だが巻番号は連続して重複しない）は分割しない。
// 例: ヤングアニマル→ジェッツへ改称しつつ巻番号は1..6で連続。
const renamedImprint = buildSeriesSummary([
  { title: '3月のライオン 1 (ヤングアニマルコミックス)', authors: ['羽海野チカ'], asin: 'SL1' },
  { title: '3月のライオン 2 (ヤングアニマルコミックス)', authors: ['羽海野チカ'], asin: 'SL2' },
  { title: '3月のライオン 3 (ヤングアニマルコミックス)', authors: ['羽海野チカ'], asin: 'SL3' },
  { title: '3月のライオン 4 (ジェッツコミックス)', authors: ['羽海野チカ'], asin: 'SL4' },
  { title: '3月のライオン 5 (ジェッツコミックス)', authors: ['羽海野チカ'], asin: 'SL5' },
]).filter((g) => g.title.startsWith('3月のライオン'));

// 合本版・全巻バンドル表記は「完結した1冊のまとめ買い」であり、続刊/欠番の概念がない。
// 巻数を抽出せず（volume=null）、単巻候補として一覧から除外されることを確認する。
// 不具合例: 【1～6巻合本版】… の「6巻」を巻数=6と誤認し seriesKey が「【1」に崩れる。
const boxSetTitles = [
  '【1～6巻合本版】フェアリーテイル・クロニクル ～空気読まない異世界ライフ～ &lt;特典付&gt; (MFブックス)',
  '【合本版】とらドラ！　全13巻 (電撃文庫)',
  '銭ゲバ　大合本　全4巻収録',
  '【合本版】鋼殻のレギオス コンプリートBOX 全31巻 (富士見ファンタジア文庫)',
];
const boxSetSplits = boxSetTitles.map((t) => splitSeriesAndVolume(t));
const boxSetSeries = buildSeriesSummary(
  boxSetTitles.map((title, i) => ({ title, authors: ['著者A'], asin: `BX${i}` }))
);

// 合本リーズ自体が連番（N巻）を持つ正規の多巻シリーズは除外しない。
// 例: 【極！合本シリーズ】ミスター味っ子（1&2セット版）1〜3巻 → 3冊シリーズとして残す。
const goukonSeries = buildSeriesSummary([
  { title: '【極！合本シリーズ】ミスター味っ子（1&amp;2セット版）1巻', authors: ['寺沢大介'], asin: 'GM1' },
  { title: '【極！合本シリーズ】ミスター味っ子（1&amp;2セット版）2巻', authors: ['寺沢大介'], asin: 'GM2' },
  { title: '【極！合本シリーズ】ミスター味っ子（1&amp;2セット版）3巻', authors: ['寺沢大介'], asin: 'GM3' },
]).filter((g) => /ミスター味っ子/.test(g.title));

const checks = [
  {
    name: 'ownership response から4冊を抽出できる',
    ok: items.length === 4,
  },
  {
    name: '合本版・全巻バンドルは巻数を抽出しない（volume=null）',
    ok: boxSetSplits.every((r) => r.volume === null),
  },
  {
    name: '合本版を「【1」等の幻シリーズとして一覧に出さない',
    ok:
      boxSetSeries.length === 0 &&
      splitSeriesAndVolume(boxSetTitles[0]).seriesKey !== '【1',
  },
  {
    name: '通常の巻表記（解体屋ゲン 110巻）は巻数を維持する（過剰除外しない）',
    ok: splitSeriesAndVolume('解体屋ゲン 110巻').volume === 110,
  },
  {
    name: '合本リーズの連番（【極！合本シリーズ】…N巻）は正規シリーズとして残す',
    ok:
      goukonSeries.length === 1 &&
      goukonSeries[0].count === 3 &&
      JSON.stringify(goukonSeries[0].ownedVolumes) === JSON.stringify([1, 2, 3]),
  },
  {
    name: 'サンプル冒険譚を1シリーズとして束ねる',
    ok: series.some(
      (group) =>
        group.title === 'サンプル冒険譚' &&
        group.count === 2 &&
        group.highestVolume === 2 &&
        group.nextVolume === 3
    ),
  },
  {
    name: '単巻読み切りはシリーズ候補から除外する',
    ok: !series.some((group) => group.title === '単巻読み切り'),
  },
  {
    name: 'CSV にASINとシリーズ名を出力する',
    ok: csv.includes('"B000000001"') && csv.includes('"サンプル冒険譚"'),
  },
  {
    name: '保存用データに画像URLを含めない',
    ok: !serializedScan.includes('productImage') && !serializedScan.includes('example.invalid'),
  },
  {
    name: 'シリーズ要約に書籍配列を重複保存しない',
    ok: series.every((group) => !Object.hasOwn(group, 'items') && !Object.hasOwn(group, 'books')),
  },
  {
    name: '裸の巻数表記（鬼滅の刃 1/2/3）を1シリーズ3冊に束ねる',
    ok: bareNumber.size === 1 && bareNumber.get('鬼滅の刃')?.count === 3,
  },
  {
    name: '巻数の後にサブタイトルが続くシリーズを束ねる',
    ok:
      subtitle.size === 1 &&
      subtitle.get('転生賢者の異世界ライフ')?.count === 2,
  },
  {
    name: '混在表記（進撃の巨人（1）+ 進撃の巨人 2）を統合する',
    ok: mixedNotation.size === 1 && mixedNotation.get('進撃の巨人')?.count === 3,
  },
  {
    name: '巻数直後が【】等の括弧でも巻数を認識する',
    ok: (() => {
      const r = splitSeriesAndVolume(
        '小林さんちのメイドラゴン : 11【電子版は水着回がフルカラーだよ】 (アクションコミックス)'
      );
      return r.volume === 11 && r.seriesKey === '小林さんちのメイドラゴン';
    })(),
  },
  {
    name: '巻数直後の括弧違いで同一シリーズが分裂しない（欠番誤検知の防止）',
    ok:
      bracketAfterVolume.size === 1 &&
      bracketAfterVolume.get('小林さんちのメイドラゴン')?.count === 3 &&
      JSON.stringify(bracketAfterVolume.get('小林さんちのメイドラゴン')?.ownedVolumes) ===
        JSON.stringify([10, 11, 12]),
  },
  {
    name: '先頭の数字（1Q84 / 20世紀少年）を巻数扱いしない',
    ok:
      leadingNumber.get('1Q84')?.highestVolume == null &&
      leadingNumber.get('20世紀少年')?.highestVolume == null,
  },
  {
    name: '別シリーズ（seriesKeyが違う）を誤統合しない',
    ok: differentSeries.size === 2,
  },
  {
    name: '著者表記ゆれでシリーズを分裂させない（欠番誤検知の防止）',
    ok:
      authorVariation?.count === 4 &&
      JSON.stringify(authorVariation?.ownedVolumes) === JSON.stringify([50, 51, 52, 53]) &&
      authorVariation?.author === '石井さだよし',
  },
  {
    name: '同一ASINの重複取得を冊数に二重計上しない',
    ok: duplicatedAsin?.count === 2 && duplicatedAsin?.ownedVolumes.length === 2,
  },
  {
    name: '所有巻を連番レンジに整形する（1,2,3,5,6 → 1-3,5-6）',
    ok:
      JSON.stringify(computeOwnedRanges([1, 2, 3, 5, 6])) ===
      JSON.stringify([[1, 3], [5, 6]]),
  },
  {
    name: '連番のみは1レンジ・順不同/重複も正規化する',
    ok:
      JSON.stringify(computeOwnedRanges([3, 1, 2, 2])) === JSON.stringify([[1, 3]]) &&
      JSON.stringify(computeOwnedRanges([5])) === JSON.stringify([[5, 5]]),
  },
  {
    name: '欠番は最小〜最高巻の間の抜けだけを返す（最高巻より先は含めない）',
    ok:
      JSON.stringify(computeMissingVolumes([1, 2, 3, 5, 6])) === JSON.stringify([4]) &&
      JSON.stringify(computeMissingVolumes([2, 4, 6])) === JSON.stringify([3, 5]),
  },
  {
    name: '抜けの無い連番・単巻は欠番なし',
    ok:
      computeMissingVolumes([1, 2, 3]).length === 0 &&
      computeMissingVolumes([5]).length === 0,
  },
  {
    name: '複数版所有（巻番号重複×2レーベル）は版ごとに分割する',
    ok:
      !!myBoyAction &&
      !!myBoyYM &&
      JSON.stringify(myBoyAction.ownedVolumes) === JSON.stringify([1, 2, 3, 4]) &&
      JSON.stringify(myBoyYM.ownedVolumes) === JSON.stringify([1, 5, 7]) &&
      myBoyAction.key === '私の少年::アクションコミックス',
  },
  {
    name: '分割後のアクション版は欠番なし（合算による誤検知6を出さない）',
    ok: !!myBoyAction && computeMissingVolumes(myBoyAction.ownedVolumes).length === 0,
  },
  {
    name: '単一レーベル内の特装版重複（つぐもも24）は分割しない',
    ok:
      sameImprintDup.length === 1 &&
      sameImprintDup[0].title === 'つぐもも' &&
      JSON.stringify(sameImprintDup[0].ownedVolumes) === JSON.stringify([23, 24, 25]),
  },
  {
    name: 'レーベル改称（巻番号が重複しない2レーベル）は分割しない',
    ok:
      renamedImprint.length === 1 &&
      renamedImprint[0].title === '3月のライオン' &&
      JSON.stringify(renamedImprint[0].ownedVolumes) === JSON.stringify([1, 2, 3, 4, 5]),
  },
  {
    name: '巻数の括弧（私の少年（1））を版名と誤抽出しない',
    ok: splitSeriesAndVolume('私の少年（1） (ヤングマガジンコミックス)').imprint === 'ヤングマガジンコミックス',
  },
  {
    name: '末尾が巻数だけの括弧（MOONLIGHT MILE(19)）は版名にしない',
    ok: splitSeriesAndVolume('MOONLIGHT MILE(19)').imprint === '',
  },
  // --- 保存軽量化（minimal 書誌）と簡易マージの回帰テスト ---
  {
    name: 'minimal 書誌は title/authors を持たず必要フィールドだけ残す',
    ok: (() => {
      const min = toMinimalBook(
        normalizeBook({ title: '私の少年 : 4 (アクションコミックス)', authors: ['高野ひと深'], asin: 'X1' })
      );
      const keys = Object.keys(min).sort();
      return (
        JSON.stringify(keys) === JSON.stringify(['asin', 'author', 'imprint', 'seriesKey', 'volume']) &&
        min.volume === 4 &&
        min.imprint === 'アクションコミックス' &&
        min.author === '高野ひと深'
      );
    })(),
  },
  {
    name: 'series→minimal→再構築で版分割が維持される（私の少年は2分割）',
    ok: (() => {
      const raw = [
        { title: '私の少年（1） (ヤングマガジンコミックス)', authors: ['高野ひと深'], asin: 'WY1' },
        { title: '私の少年（5） (ヤングマガジンコミックス)', authors: ['高野ひと深'], asin: 'WY5' },
        { title: '私の少年（7） (ヤングマガジンコミックス)', authors: ['高野ひと深'], asin: 'WY7' },
        { title: '私の少年 : 1 (アクションコミックス)', authors: ['高野ひと深'], asin: 'WA1' },
        { title: '私の少年 : 2 (アクションコミックス)', authors: ['高野ひと深'], asin: 'WA2' },
        { title: '私の少年 : 3 (アクションコミックス)', authors: ['高野ひと深'], asin: 'WA3' },
        { title: '私の少年 : 4 (アクションコミックス)', authors: ['高野ひと深'], asin: 'WA4' },
      ];
      const minimal = raw.map((r) => toMinimalBook(normalizeBook(r)));
      const rebuilt = summarizeNormalizedBooks(minimal);
      const action = rebuilt.find((g) => g.key === '私の少年::アクションコミックス');
      const ym = rebuilt.find((g) => g.key === '私の少年::ヤングマガジンコミックス');
      return (
        !!action && !!ym &&
        JSON.stringify(action.ownedVolumes) === JSON.stringify([1, 2, 3, 4]) &&
        JSON.stringify(ym.ownedVolumes) === JSON.stringify([1, 5, 7]) &&
        action.author === '高野ひと深'
      );
    })(),
  },
  {
    name: 'series→minimal→再構築で非分割が維持される（つぐもも特装版重複）',
    ok: (() => {
      const raw = [
        { title: 'つぐもも : 23 (アクションコミックス)', authors: ['浜田よしかづ'], asin: 'T23' },
        { title: 'つぐもも : 24 (アクションコミックス)', authors: ['浜田よしかづ'], asin: 'T24a' },
        { title: 'つぐもも : 24 【カバーイラストBOOK付】 (アクションコミックス)', authors: ['浜田よしかづ'], asin: 'T24b' },
        { title: 'つぐもも : 25 (アクションコミックス)', authors: ['浜田よしかづ'], asin: 'T25' },
      ];
      const minimal = raw.map((r) => toMinimalBook(normalizeBook(r)));
      const rebuilt = summarizeNormalizedBooks(minimal).filter((g) => g.title.startsWith('つぐもも'));
      return rebuilt.length === 1 && JSON.stringify(rebuilt[0].ownedVolumes) === JSON.stringify([23, 24, 25]);
    })(),
  },
  {
    name: '簡易マージ: 既存minimalに新刊を足すと所有巻が増える',
    ok: (() => {
      const existing = [
        { title: '鬼滅の刃 1', authors: ['吾峠呼世晴'], asin: 'K1' },
        { title: '鬼滅の刃 2', authors: ['吾峠呼世晴'], asin: 'K2' },
      ].map((r) => toMinimalBook(normalizeBook(r)));
      const fresh = [normalizeBook({ title: '鬼滅の刃 3', authors: ['吾峠呼世晴'], asin: 'K3' })];
      const merged = mergeScan(existing, fresh);
      const g = merged.series.find((s) => s.key === '鬼滅の刃');
      return (
        merged.added === 1 &&
        merged.minimalBooks.length === 3 &&
        !!g && JSON.stringify(g.ownedVolumes) === JSON.stringify([1, 2, 3])
      );
    })(),
  },
  {
    name: '簡易マージ: 別レーベルの重複巻を足すと新たに版分割が発火する',
    ok: (() => {
      // 既存はアクション版のみ（未分割）。後から重複巻のヤンマガ版を足す。
      const existing = [
        { title: '私の少年 : 1 (アクションコミックス)', authors: ['高野ひと深'], asin: 'A1' },
        { title: '私の少年 : 2 (アクションコミックス)', authors: ['高野ひと深'], asin: 'A2' },
      ].map((r) => toMinimalBook(normalizeBook(r)));
      const before = summarizeNormalizedBooks(existing);
      const fresh = [normalizeBook({ title: '私の少年（1） (ヤングマガジンコミックス)', authors: ['高野ひと深'], asin: 'Y1' })];
      const merged = mergeScan(existing, fresh);
      const action = merged.series.find((s) => s.key === '私の少年::アクションコミックス');
      const ym = merged.series.find((s) => s.key === '私の少年::ヤングマガジンコミックス');
      // マージ前は1グループ（未分割）、マージ後は2グループ（分割発火）。
      return before.length === 1 && !!action && !!ym;
    })(),
  },
  {
    name: '簡易マージ: 同一ASIN再取得は重複計上しない（added=0）',
    ok: (() => {
      const existing = [normalizeBook({ title: '鬼滅の刃 1', authors: ['吾峠呼世晴'], asin: 'K1' })].map(toMinimalBook);
      const merged = mergeScan(existing, [normalizeBook({ title: '鬼滅の刃 1', authors: ['吾峠呼世晴'], asin: 'K1' })]);
      return merged.added === 0 && merged.minimalBooks.length === 1;
    })(),
  },
  {
    name: '後方互換: 旧full形式(title付きitems)からminimal化して簡易マージできる',
    ok: (() => {
      // 旧バージョンの保存 items は title/authors[] を持つフル書誌。これを toMinimalBook で
      // 最小化して簡易マージの基準にできること（author は authors[] から導出される）。
      const legacyFullItems = [
        normalizeBook({ title: '鬼滅の刃 1', authors: ['吾峠呼世晴'], asin: 'K1' }),
        normalizeBook({ title: '鬼滅の刃 2', authors: ['吾峠呼世晴'], asin: 'K2' }),
      ];
      const baseMinimal = legacyFullItems.map(toMinimalBook);
      const okMinimal =
        baseMinimal.every((b) => !('title' in b) && !('authors' in b) && b.author === '吾峠呼世晴');
      const merged = mergeScan(baseMinimal, [normalizeBook({ title: '鬼滅の刃 3', authors: ['吾峠呼世晴'], asin: 'K3' })]);
      const g = merged.series.find((s) => s.key === '鬼滅の刃');
      return okMinimal && merged.added === 1 && !!g && g.author === '吾峠呼世晴' &&
        JSON.stringify(g.ownedVolumes) === JSON.stringify([1, 2, 3]);
    })(),
  },
];

let allOk = true;
for (const check of checks) {
  console.log(`${check.ok ? '✓' : '✗'} ${check.name}`);
  if (!check.ok) allOk = false;
}

process.exit(allOk ? 0 : 1);
