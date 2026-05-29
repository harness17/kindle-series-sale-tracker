import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  extractOwnershipItems,
  buildSeriesSummary,
  toCsv,
  computeOwnedRanges,
  computeMissingVolumes,
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

const checks = [
  {
    name: 'ownership response から4冊を抽出できる',
    ok: items.length === 4,
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
];

let allOk = true;
for (const check of checks) {
  console.log(`${check.ok ? '✓' : '✗'} ${check.name}`);
  if (!check.ok) allOk = false;
}

process.exit(allOk ? 0 : 1);
