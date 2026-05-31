import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  detectNextVolume,
  extractSearchResultOffer,
  normalizePublicationDate,
} = require('./extension/shared/catalog-probe.js');

const checks = [
  {
    name: '最高巻より先の最小巻を続刊として検出する',
    ok: (() => {
      const r = detectNextVolume(
        [
          {
            title: '鬼滅の刃 13',
            url: 'u13',
            releaseDate: '2019-01-04',
            thumbnailUrl: 'img13.jpg',
            priceText: '￥418',
            listPriceText: '￥459',
            discountRate: 9,
          },
          { title: '鬼滅の刃 12', url: 'u12', releaseDate: '2018-08-03' },
          { title: '鬼滅の刃 公式ファンブック', url: 'fb' },
        ],
        { seriesTitle: '鬼滅の刃', highestVolume: 11 }
      );
      return (
        r.status === 'has-next' &&
        r.nextVolume === 12 &&
        r.nextUrl === 'u12' &&
        r.latestVolume === 13 &&
        r.latestReleaseDate === '2019-01-04' &&
        r.latestThumbnailUrl === 'img13.jpg' &&
        r.latestPriceText === '￥418' &&
        r.latestListPriceText === '￥459' &&
        r.latestDiscountRate === 9
      );
    })(),
  },
  {
    name: '最高巻以下だけでも最新刊の発売日を返す',
    ok: (() => {
      const r = detectNextVolume(
        [
          { title: '鬼滅の刃 10', url: 'u10', releaseDate: '2018-03-02' },
          { title: '鬼滅の刃 11', url: 'u11', releaseDate: '2018-06-04' },
        ],
        { seriesTitle: '鬼滅の刃', highestVolume: 11 }
      );
      return r.status === 'no-next' && r.latestVolume === 11 && r.latestReleaseDate === '2018-06-04';
    })(),
  },
  {
    name: '検索結果テキストから日本語/スラッシュ形式の発売日を正規化する',
    ok:
      normalizePublicationDate('発売日: 2025年6月17日') === '2025-06-17' &&
      normalizePublicationDate('発行日: 2025/06/07') === '2025-06-07',
  },
  {
    name: '検索結果DOMから価格と割引率を抽出する',
    ok: (() => {
      const node = {
        textContent: 'Kindle版 ￥418 参考価格 ￥459 9%OFF',
        querySelector(selector) {
          if (selector.includes(':not')) return { textContent: '￥418' };
          if (selector.includes('a-text-price')) return { textContent: '￥459' };
          return null;
        },
      };
      const offer = extractSearchResultOffer(node);
      return (
        offer.priceText === '￥418' &&
        offer.listPriceText === '￥459' &&
        offer.discountRate === 9
      );
    })(),
  },
  {
    name: '商品名だけの%OFF表記は割引率として扱わない',
    ok: (() => {
      const node = {
        textContent: '増量20%OFFパック Kindle版 ￥1,280',
        querySelector(selector) {
          if (selector.includes(':not')) return { textContent: '￥1,280' };
          return null;
        },
        cloneNode() {
          return {
            textContent: 'Kindle版 ￥1,280',
            querySelectorAll() {
              return [];
            },
          };
        },
      };
      const offer = extractSearchResultOffer(node);
      return offer.priceText === '￥1,280' && offer.listPriceText === '' && offer.discountRate === null;
    })(),
  },
  {
    name: '表示割引率より価格差計算が大きければ計算値を採用する',
    ok: (() => {
      const node = {
        textContent: 'Kindle版 ￥800 参考価格 ￥1,000 10%OFF',
        querySelector(selector) {
          if (selector.includes(':not')) return { textContent: '￥800' };
          if (selector.includes('a-text-price')) return { textContent: '￥1,000' };
          return null;
        },
      };
      const offer = extractSearchResultOffer(node);
      return (
        offer.priceText === '￥800' &&
        offer.listPriceText === '￥1,000' &&
        offer.discountRate === 20
      );
    })(),
  },
  {
    name: '最高巻以下の結果しか無ければ続刊なし',
    ok:
      detectNextVolume(
        [
          { title: '鬼滅の刃 10', url: 'u10' },
          { title: '鬼滅の刃 11', url: 'u11' },
        ],
        { seriesTitle: '鬼滅の刃', highestVolume: 11 }
      ).status === 'no-next',
  },
  {
    name: '別シリーズの巻は続刊扱いしない',
    ok:
      detectNextVolume([{ title: '進撃の巨人 20', url: 'x' }], {
        seriesTitle: '鬼滅の刃',
        highestVolume: 11,
      }).status === 'no-next',
  },
  {
    name: '検索結果が空なら unknown',
    ok:
      detectNextVolume([], { seriesTitle: '鬼滅の刃', highestVolume: 11 }).status ===
      'unknown',
  },
  {
    name: 'スピンオフの続刊チェックで本編・他スピンオフを拾わない',
    ok: (() => {
      const r = detectNextVolume(
        [
          { title: '小林さんちのメイドラゴン 8', url: 'main8' },
          { title: '小林さんちのメイドラゴン カンナの日常 8', url: 'kanna8' },
          { title: '小林さんちのメイドラゴン エルマのＯＬ日記 8', url: 'elma8' },
        ],
        { seriesTitle: '小林さんちのメイドラゴン エルマのＯＬ日記', highestVolume: 7 }
      );
      return r.status === 'has-next' && r.nextVolume === 8 && r.nextUrl === 'elma8';
    })(),
  },
  {
    name: '本編の続刊チェックでスピンオフを拾わない',
    ok: (() => {
      const r = detectNextVolume(
        [
          { title: '小林さんちのメイドラゴン カンナの日常 19', url: 'kanna19' },
          { title: '小林さんちのメイドラゴン 19', url: 'main19' },
        ],
        { seriesTitle: '小林さんちのメイドラゴン', highestVolume: 18 }
      );
      return r.status === 'has-next' && r.nextVolume === 19 && r.nextUrl === 'main19';
    })(),
  },
  // --- 別エディション誤検知の回帰（実キャッシュの誤判定文字列で固定）---
  {
    // 所有=フラッパー版13巻。マンガの金字塔（新装版）の14巻を続刊として出さない。
    name: '別レーベルの新装版（エリア88 マンガの金字塔）は続刊扱いしない',
    ok:
      detectNextVolume([{ title: 'エリア88　14 (マンガの金字塔)', url: 'x' }], {
        seriesTitle: 'エリア88',
        highestVolume: 13,
        ownedImprint: 'MFコミックス フラッパーシリーズ',
      }).status === 'no-next',
  },
  {
    // 所有=ＦＵＺコミックス11巻。レーベルは一致するが【単話版】なので除外（raw title 判定）。
    name: '同一レーベルでも単話版（Lv1魔王）は続刊扱いしない',
    ok:
      detectNextVolume(
        [{ title: 'Ｌｖ１魔王とワンルーム勇者【単話版】　７１ (ＦＵＺコミックス)', url: 'x' }],
        { seriesTitle: 'Ｌｖ1魔王とワンルーム勇者', highestVolume: 11, ownedImprint: 'ＦＵＺコミックス' }
      ).status === 'no-next',
  },
  {
    // 副作用維持: 所有と同一レーベルの正当な続刊は引き続き拾う。
    name: '同一レーベルの正当な続刊（ダイの大冒険15）は続刊ありのまま',
    ok: (() => {
      const r = detectNextVolume(
        [
          {
            title: 'ドラゴンクエスト ダイの大冒険 勇者アバンと獄炎の魔王 15 (ジャンプコミックスDIGITAL)',
            url: 'avan15',
          },
        ],
        {
          seriesTitle: 'ドラゴンクエスト ダイの大冒険 勇者アバンと獄炎の魔王',
          highestVolume: 14,
          ownedImprint: 'ジャンプコミックスDIGITAL',
        }
      );
      return r.status === 'has-next' && r.nextVolume === 15 && r.nextUrl === 'avan15';
    })(),
  },
  {
    // 副作用維持: 候補に版名はあるが所有と一致するので拾う（異修羅 新魔王戦争3）。
    name: '同一レーベルの正当な続刊（異修羅 新魔王戦争3）は続刊ありのまま',
    ok: (() => {
      const r = detectNextVolume(
        [{ title: '異修羅　新魔王戦争（３） (月刊少年マガジンコミックス)', url: 'iso3' }],
        {
          seriesTitle: '異修羅 新魔王戦争',
          highestVolume: 2,
          ownedImprint: '月刊少年マガジンコミックス',
        }
      );
      return r.status === 'has-next' && r.nextVolume === 3 && r.nextUrl === 'iso3';
    })(),
  },
  {
    // 副作用維持: 候補の版名が空（末尾が巻数括弧）なら除外しない（異世界妹8）。
    name: '候補の版名が空の正当な続刊（異世界妹8）は続刊ありのまま',
    ok: (() => {
      const r = detectNextVolume(
        [
          {
            title: '異世界行ったら、すでに妹が魔王として君臨していた話。【電子版】(8)',
            url: 'imouto8',
          },
        ],
        {
          seriesTitle: '異世界行ったら、すでに妹が魔王として君臨していた話。',
          highestVolume: 7,
          ownedImprint: '',
        }
      );
      return r.status === 'has-next' && r.nextVolume === 8 && r.nextUrl === 'imouto8';
    })(),
  },
  {
    name: '所有側seriesKeyがHTML entity入りでも検索結果の&表記と照合する（FRONT MISSION）',
    ok: (() => {
      const r = detectNextVolume(
        [
          {
            title: 'FRONT MISSION DOG LIFE & DOG STYLE 2巻 (デジタル版ヤングガンガンコミックス)',
            url: 'front2',
          },
          {
            title: 'FRONT MISSION DOG LIFE & DOG STYLE 10巻 (デジタル版ヤングガンガンコミックス)',
            url: 'front10',
          },
        ],
        {
          seriesTitle: 'FRONT MISSION DOG LIFE &amp; DOG STYLE',
          seriesKey: 'FRONT MISSION DOG LIFE &amp; DOG STYLE',
          highestVolume: 1,
          ownedImprint: 'デジタル版ヤングガンガンコミックス',
        }
      );
      return (
        r.status === 'has-next' &&
        r.nextVolume === 2 &&
        r.nextUrl === 'front2' &&
        r.latestVolume === 10 &&
        r.latestUrl === 'front10'
      );
    })(),
  },
  {
    name: '検索結果側が全角英字+括弧巻数でも続刊を検出する（ミラーマン2D）',
    ok: (() => {
      const r = detectNextVolume(
        [
          {
            title: 'ミラーマン２Ｄ（６） (ヒーローズコミックス)',
            url: 'mirror6',
          },
        ],
        {
          seriesTitle: 'ミラーマン2D',
          seriesKey: 'ミラーマン2D',
          highestVolume: 5,
          ownedImprint: 'ヒーローズコミックス',
        }
      );
      return r.status === 'has-next' && r.nextVolume === 6 && r.nextUrl === 'mirror6';
    })(),
  },
  {
    name: '旧seriesKeyの末尾ハイフン欠落があっても正タイトルの続刊を検出する（SHOCKER SIDE）',
    ok: (() => {
      const r = detectNextVolume(
        [
          {
            title:
              '真の安らぎはこの世になく -シン・仮面ライダー SHOCKER SIDE- 6 (ヤングジャンプコミックスDIGITAL)',
            url: 'shocker6',
          },
        ],
        {
          seriesTitle: '真の安らぎはこの世になく -シン・仮面ライダー SHOCKER SIDE',
          seriesKey: '真の安らぎはこの世になく -シン・仮面ライダー SHOCKER SIDE',
          highestVolume: 5,
        }
      );
      return r.status === 'has-next' && r.nextVolume === 6 && r.nextUrl === 'shocker6';
    })(),
  },
  {
    name: 'seriesKeyの末尾波ダッシュ有無が違っても続刊を検出する（響）',
    ok: (() => {
      const r = detectNextVolume(
        [{ title: '響～小説家になる方法（３） (ビッグコミックス)', url: 'hibiki3' }],
        {
          seriesTitle: '響～小説家になる方法～',
          seriesKey: '響～小説家になる方法～',
          highestVolume: 2,
          ownedImprint: 'ビッグコミックス',
        }
      );
      return r.status === 'has-next' && r.nextVolume === 3 && r.nextUrl === 'hibiki3';
    })(),
  },
  {
    name: '版分割タイトルでもseriesKey指定で通常版の続刊を検出する（うちの師匠13）',
    ok: (() => {
      const r = detectNextVolume(
        [
          { title: 'うちの師匠はしっぽがない（13） (アフタヌーンコミックス)', url: 'normal13' },
          {
            title: 'うちの師匠はしっぽがない（13）【電子限定特装版】 (アフタヌーンコミックス)',
            url: 'special13',
          },
        ],
        {
          seriesTitle: 'うちの師匠はしっぽがない（アフタヌーンコミックス）',
          seriesKey: 'うちの師匠はしっぽがない',
          highestVolume: 12,
          ownedImprint: 'アフタヌーンコミックス',
        }
      );
      return r.status === 'has-next' && r.nextVolume === 13 && r.nextUrl === 'normal13';
    })(),
  },
  {
    name: '版分割タイトルでもseriesKey指定で電子限定特装版の続刊を検出する（うちの師匠13）',
    ok: (() => {
      const r = detectNextVolume(
        [
          { title: 'うちの師匠はしっぽがない（13） (アフタヌーンコミックス)', url: 'normal13' },
          {
            title: 'うちの師匠はしっぽがない（13）【電子限定特装版】 (アフタヌーンコミックス)',
            url: 'special13',
          },
        ],
        {
          seriesTitle: 'うちの師匠はしっぽがない（電子限定特装版/アフタヌーンコミックス）',
          seriesKey: 'うちの師匠はしっぽがない',
          highestVolume: 12,
          ownedImprint: '電子限定特装版/アフタヌーンコミックス',
        }
      );
      return r.status === 'has-next' && r.nextVolume === 13 && r.nextUrl === 'special13';
    })(),
  },
];

let allOk = true;
for (const check of checks) {
  console.log(`${check.ok ? '✓' : '✗'} ${check.name}`);
  if (!check.ok) allOk = false;
}

process.exit(allOk ? 0 : 1);
