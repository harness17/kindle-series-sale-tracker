import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  PRICE_CALC_VERSION,
  detectNextVolume,
  extractSearchResultOffer,
  normalizePublicationDate,
} = require('./extension/shared/catalog-probe.js');
const { reconcileCatalog, isConfirmedHasNext } = require('./extension/shared/series-card.js');
const { mergeScan, summarizeNormalizedBooks } = require('./extension/shared/kindle-library.js');

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
          {
            title: '鬼滅の刃 12',
            url: 'u12',
            releaseDate: '2018-08-03',
            thumbnailUrl: 'img12.jpg',
            priceText: '￥376',
            listPriceText: '￥459',
            discountRate: 18,
          },
          { title: '鬼滅の刃 公式ファンブック', url: 'fb' },
        ],
        { seriesTitle: '鬼滅の刃', highestVolume: 11 }
      );
      return (
        r.status === 'has-next' &&
        r.nextVolume === 12 &&
        r.nextUrl === 'u12' &&
        r.nextReleaseDate === '2018-08-03' &&
        r.nextThumbnailUrl === 'img12.jpg' &&
        r.nextPriceText === '￥376' &&
        r.nextListPriceText === '￥459' &&
        r.nextDiscountRate === 18 &&
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
    name: 'Kindle Unlimited の0円DOM表示より購入価格DOMを優先する',
    ok: (() => {
      const node = {
        textContent: 'Kindle Unlimited ￥0 Kindle版 ￥748',
        querySelector(selector) {
          if (selector.includes('a-text-price') || selector.includes('a-text-strike')) return null;
          if (selector.includes(':not') || selector.includes('data-a-color') || selector.includes('.a-price')) {
            return { textContent: '￥0' };
          }
          return null;
        },
        querySelectorAll(selector) {
          if (selector.includes('a-text-price') || selector.includes('a-text-strike')) return [];
          return [{ textContent: '￥0' }, { textContent: '￥748' }];
        },
      };
      const offer = extractSearchResultOffer(node);
      return offer.priceText === '￥748' && offer.listPriceText === '' && offer.discountRate === null;
    })(),
  },
  {
    name: 'Kindle Unlimited の0円DOM表示よりカード本文内の購入価格を優先する',
    ok: (() => {
      const node = {
        textContent: 'Kindle Unlimited ￥0 または ￥748 で購入',
        querySelector(selector) {
          if (selector.includes('a-text-price') || selector.includes('a-text-strike')) return null;
          if (selector.includes(':not') || selector.includes('data-a-color') || selector.includes('.a-price')) {
            return { textContent: '￥0' };
          }
          return null;
        },
        querySelectorAll(selector) {
          if (selector.includes('a-text-price') || selector.includes('a-text-strike')) return [];
          return [{ textContent: '￥0' }];
        },
      };
      const offer = extractSearchResultOffer(node);
      return offer.priceText === '￥748' && offer.listPriceText === '' && offer.discountRate === null;
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
    name: 'KU＋円額クーポン併存: 円額を優先して適用後の実金額(￥531)を返す',
    ok: (() => {
      const node = {
        textContent:
          'Kindle Unlimited ￥0 ￥228オフクーポンが適用されました 30%OFF ￥759で購入',
        querySelector(selector) {
          if (selector.includes('s-coupon-component'))
            return { textContent: '￥228オフクーポンが適用されました' };
          if (selector.includes('a-text-price') || selector.includes('a-text-strike'))
            return null;
          if (
            selector.includes(':not') ||
            selector.includes('data-a-color') ||
            selector.includes('.a-price')
          )
            return { textContent: '￥0' };
          return null;
        },
        querySelectorAll(selector) {
          if (selector.includes('a-text-price') || selector.includes('a-text-strike')) return [];
          if (selector.includes('.a-price')) return [{ textContent: '￥0' }];
          return [];
        },
        cloneNode() {
          let couponRemoved = false;
          return {
            get textContent() {
              return couponRemoved
                ? 'Kindle Unlimited ￥0 30%OFF ￥759で購入'
                : 'Kindle Unlimited ￥0 ￥228オフクーポンが適用されました 30%OFF ￥759で購入';
            },
            querySelectorAll(sel) {
              if (sel.includes('s-coupon-component')) {
                return couponRemoved
                  ? []
                  : [{ remove() { couponRemoved = true; } }];
              }
              return [];
            },
          };
        },
      };
      const offer = extractSearchResultOffer(node);
      return offer.priceText === '￥531' && offer.discountRate === 30;
    })(),
  },
  {
    name: 'KU＋割合クーポン併存: エアマスター相当の￥759・30%OFFを￥531にする',
    ok: (() => {
      const node = {
        textContent: 'Kindle Unlimited ￥0 30% OFF クーポンあり または、￥759で購入',
        querySelector(selector) {
          if (selector.includes('s-coupon-component'))
            return { textContent: '30% OFF クーポンあり' };
          if (selector.includes('a-text-price') || selector.includes('a-text-strike'))
            return null;
          if (
            selector.includes(':not') ||
            selector.includes('data-a-color') ||
            selector.includes('.a-price')
          )
            return { textContent: '￥0' };
          return null;
        },
        querySelectorAll(selector) {
          if (selector.includes('a-text-price') || selector.includes('a-text-strike')) return [];
          if (selector.includes('.a-price')) return [{ textContent: '￥0' }];
          return [];
        },
        cloneNode() {
          let couponRemoved = false;
          return {
            get textContent() {
              return couponRemoved
                ? 'Kindle Unlimited ￥0 または、￥759で購入'
                : 'Kindle Unlimited ￥0 30% OFF クーポンあり または、￥759で購入';
            },
            querySelectorAll(sel) {
              if (sel.includes('s-coupon-component')) {
                return couponRemoved
                  ? []
                  : [{ remove() { couponRemoved = true; } }];
              }
              return [];
            },
          };
        },
      };
      const offer = extractSearchResultOffer(node);
      return (
        offer.priceText === '￥531' &&
        offer.discountRate === 30 &&
        offer.priceCalcVersion === PRICE_CALC_VERSION
      );
    })(),
  },
  {
    name: '同じ続刊が複数ある場合は実効価格が安い候補を採用する',
    ok: (() => {
      const r = detectNextVolume(
        [
          {
            title: 'エアマスター 2 (ジェッツコミックス)',
            url: 'base-price',
            priceText: '￥759',
            discountRate: 30,
            priceCalcVersion: PRICE_CALC_VERSION,
          },
          {
            title: 'エアマスター 2 (ジェッツコミックス)',
            url: 'coupon-price',
            priceText: '￥531',
            discountRate: 30,
            priceCalcVersion: PRICE_CALC_VERSION,
          },
        ],
        { seriesTitle: 'エアマスター', highestVolume: 1 }
      );
      return (
        r.status === 'has-next' &&
        r.nextVolume === 2 &&
        r.nextUrl === 'coupon-price' &&
        r.nextPriceText === '￥531' &&
        r.nextPriceCalcVersion === PRICE_CALC_VERSION
      );
    })(),
  },
  {
    name: 'fetch初期HTMLで親component属性がなくても表示クラスから30%クーポンを適用する',
    ok: (() => {
      const node = {
        textContent: 'Kindle Unlimited ￥0 30% OFF クーポンあり または、￥759で購入',
        querySelector(selector) {
          if (selector.includes('s-coupon-unclipped'))
            return { textContent: '30% OFF クーポンあり' };
          if (selector.includes('a-text-price') || selector.includes('a-text-strike'))
            return null;
          if (
            selector.includes(':not') ||
            selector.includes('data-a-color') ||
            selector.includes('.a-price')
          )
            return { textContent: '￥0' };
          return null;
        },
        querySelectorAll(selector) {
          if (selector.includes('a-text-price') || selector.includes('a-text-strike')) return [];
          if (selector.includes('.a-price')) return [{ textContent: '￥0' }];
          return [];
        },
        cloneNode() {
          let couponRemoved = false;
          return {
            get textContent() {
              return couponRemoved
                ? 'Kindle Unlimited ￥0 または、￥759で購入'
                : 'Kindle Unlimited ￥0 30% OFF クーポンあり または、￥759で購入';
            },
            querySelectorAll(sel) {
              if (sel.includes('s-coupon-unclipped')) {
                return couponRemoved
                  ? []
                  : [{ remove() { couponRemoved = true; } }];
              }
              return [];
            },
          };
        },
      };
      const offer = extractSearchResultOffer(node);
      return offer.priceText === '￥531' && offer.discountRate === 30;
    })(),
  },
  {
    name: 'fetch初期HTMLでクーポン文言が欠けてもKU購入価格へ30%OFFを適用する',
    ok: (() => {
      const node = {
        textContent: 'Kindle Unlimited ￥0 30% OFF または、￥759で購入',
        querySelector(selector) {
          if (selector.includes('a-text-price') || selector.includes('a-text-strike')) return null;
          if (
            selector.includes(':not') ||
            selector.includes('data-a-color') ||
            selector.includes('.a-price')
          )
            return { textContent: '￥0' };
          return null;
        },
        querySelectorAll(selector) {
          if (selector.includes('a-text-price') || selector.includes('a-text-strike')) return [];
          if (selector.includes('.a-price')) return [{ textContent: '￥0' }];
          return [];
        },
      };
      const offer = extractSearchResultOffer(node);
      return (
        offer.priceText === '￥531' &&
        offer.discountRate === 30 &&
        offer.priceCalcVersion === PRICE_CALC_VERSION
      );
    })(),
  },
  {
    name: 'クーポン用DOM属性やクラスがなくても本文のクーポン明示から30%を価格へ適用する',
    ok: (() => {
      const node = {
        textContent: 'Kindle Unlimited ￥0 30% OFF クーポンあり または、￥759で購入',
        querySelector(selector) {
          if (selector.includes('s-coupon')) return null;
          if (selector.includes('a-text-price') || selector.includes('a-text-strike'))
            return null;
          if (
            selector.includes(':not') ||
            selector.includes('data-a-color') ||
            selector.includes('.a-price')
          )
            return { textContent: '￥0' };
          return null;
        },
        querySelectorAll(selector) {
          if (selector.includes('a-text-price') || selector.includes('a-text-strike')) return [];
          if (selector.includes('.a-price')) return [{ textContent: '￥0' }];
          return [];
        },
        cloneNode() {
          return {
            textContent: 'Kindle Unlimited ￥0 30% OFF クーポンあり または、￥759で購入',
            querySelectorAll() {
              return [];
            },
          };
        },
      };
      const offer = extractSearchResultOffer(node);
      return offer.priceText === '￥531' && offer.discountRate === 30;
    })(),
  },
  {
    name: '先頭4000文字より後ろのクーポン明示も価格へ適用する',
    ok: (() => {
      const prefix = 'x'.repeat(4100);
      const node = {
        textContent: `${prefix} Kindle Unlimited ￥0 30% OFF クーポンあり または、￥759で購入`,
        querySelector(selector) {
          if (selector.includes('s-coupon')) return null;
          if (selector.includes('a-text-price') || selector.includes('a-text-strike'))
            return null;
          if (
            selector.includes(':not') ||
            selector.includes('data-a-color') ||
            selector.includes('.a-price')
          )
            return { textContent: '￥759' };
          return null;
        },
        querySelectorAll(selector) {
          if (selector.includes('a-text-price') || selector.includes('a-text-strike')) return [];
          if (selector.includes('.a-price')) return [{ textContent: '￥759' }];
          return [];
        },
        cloneNode() {
          return {
            textContent: `${prefix} Kindle Unlimited ￥0 30% OFF クーポンあり または、￥759で購入`,
            querySelectorAll() {
              return [];
            },
          };
        },
      };
      const offer = extractSearchResultOffer(node);
      return offer.priceText === '￥531' && offer.discountRate === 30;
    })(),
  },
  {
    name: '割合表記があってもクーポン要素でなければ価格を変更しない',
    ok: (() => {
      const node = {
        textContent: 'Kindle版 ￥759 30%OFF',
        querySelector(selector) {
          if (selector.includes(':not')) return { textContent: '￥759' };
          return null;
        },
      };
      const offer = extractSearchResultOffer(node);
      return offer.priceText === '￥759' && offer.discountRate === 30;
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
  // --- completionCost: 完結コスト集計 ---
  {
    name: '完結コスト: 2巻分の価格を合算して返す（完全一致）',
    ok: (() => {
      const r = detectNextVolume(
        [
          { title: '鬼滅の刃 12', url: 'u12', priceText: '￥376' },
          { title: '鬼滅の刃 13', url: 'u13', priceText: '￥418' },
        ],
        { seriesTitle: '鬼滅の刃', highestVolume: 11 }
      );
      return (
        r.status === 'has-next' &&
        r.completionCost === 794 &&
        r.completionFoundCount === 2 &&
        r.completionExpectedSpan === 2
      );
    })(),
  },
  {
    name: '完結コスト: 同一巻の重複ASINは最安価格でdedup（二重計上しない）',
    ok: (() => {
      const r = detectNextVolume(
        [
          { title: '鬼滅の刃 12', url: 'u12a', priceText: '￥418' },
          { title: '鬼滅の刃 12', url: 'u12b', priceText: '￥376' },
          { title: '鬼滅の刃 13', url: 'u13', priceText: '￥418' },
        ],
        { seriesTitle: '鬼滅の刃', highestVolume: 11 }
      );
      return (
        r.status === 'has-next' &&
        r.completionCost === 794 &&
        r.completionFoundCount === 2 &&
        r.completionExpectedSpan === 2
      );
    })(),
  },
  {
    name: '完結コスト: 価格不明巻があれば foundCount < expectedSpan で partial 判定',
    ok: (() => {
      const r = detectNextVolume(
        [
          { title: '鬼滅の刃 12', url: 'u12', priceText: '￥376' },
          { title: '鬼滅の刃 13', url: 'u13', priceText: '' },
        ],
        { seriesTitle: '鬼滅の刃', highestVolume: 11 }
      );
      return (
        r.status === 'has-next' &&
        r.completionCost === 376 &&
        r.completionFoundCount === 1 &&
        r.completionExpectedSpan === 2
      );
    })(),
  },
  // --- reconcileCatalog: 所持更新時の続刊情報リコンサイル ---
  {
    name: 'reconcile: 次巻未所持なら変化なし（highestVolume < nextVolume）',
    ok: (() => {
      const cached = { status: 'has-next', nextVolume: 7, latestVolume: 10 };
      const r = reconcileCatalog(cached, 6);
      return r === cached;
    })(),
  },
  {
    name: 'reconcile: カタログ最大巻まで所持で続刊なしへ降格（highestVolume >= latestVolume）',
    ok: (() => {
      const r = reconcileCatalog({ status: 'has-next', nextVolume: 7, latestVolume: 7 }, 7);
      return r.status === 'no-next' && r.reconciled === 'owned-to-latest' && !r.stale;
    })(),
  },
  {
    name: 'reconcile: 買った巻と最新巻の間に未知巻が残れば要再確認（nextVolume <= highestVolume < latestVolume）',
    ok: (() => {
      const r = reconcileCatalog({ status: 'has-next', nextVolume: 7, latestVolume: 10 }, 7);
      return r.status === 'has-next' && r.stale === true && r.reconciled === 'stale';
    })(),
  },
  {
    name: 'reconcile: latestVolume 欠落の旧エントリは nextVolume 相当で降格扱い',
    ok: (() => {
      const r = reconcileCatalog({ status: 'has-next', nextVolume: 7 }, 7);
      return r.status === 'no-next' && r.reconciled === 'owned-to-latest';
    })(),
  },
  {
    name: 'reconcile: has-next 以外（no-next / null）はそのまま返す',
    ok: (() => {
      const noNext = { status: 'no-next', latestVolume: 5 };
      return reconcileCatalog(noNext, 99) === noNext && reconcileCatalog(null, 99) === null;
    })(),
  },
  {
    name: 'reconcile: highestVolume 不明なら変化なし',
    ok: (() => {
      const cached = { status: 'has-next', nextVolume: 7, latestVolume: 10 };
      return reconcileCatalog(cached, undefined) === cached && reconcileCatalog(cached, NaN) === cached;
    })(),
  },
  {
    name: 'isConfirmedHasNext: 確定 has-next は true、stale / no-next / null は false',
    ok:
      isConfirmedHasNext({ status: 'has-next' }) === true &&
      isConfirmedHasNext({ status: 'has-next', stale: true }) === false &&
      isConfirmedHasNext({ status: 'no-next' }) === false &&
      isConfirmedHasNext(null) === false,
  },
  // --- integration: 簡易更新で highestVolume が上がると reconcile が状態遷移する（ユーザー報告フロー） ---
  // 所持側（mergeScan→highestVolume 上昇）と続刊側（reconcileCatalog）の繋ぎ目を end-to-end で検証する。
  {
    name: 'integration: 7巻購入→簡易更新で highestVolume 6→7、latest=7 なら続刊なしへ降格',
    ok: (() => {
      const existing = [1, 2, 3, 4, 5, 6].map((v) => ({
        asin: `a${v}`,
        seriesKey: '鬼滅の刃',
        volume: v,
        imprint: '',
        author: '',
      }));
      const before = summarizeNormalizedBooks(existing);
      const key = before[0].key;
      const merged = mergeScan(existing, [
        { asin: 'a7', seriesKey: '鬼滅の刃', volume: 7, imprint: '', author: '' },
      ]);
      const after = merged.series.find((s) => s.key === key);
      const cached = { status: 'has-next', nextVolume: 7, nextTitle: '鬼滅の刃 7', latestVolume: 7 };
      const r = reconcileCatalog(cached, after.highestVolume);
      return (
        before[0].highestVolume === 6 &&
        after.highestVolume === 7 &&
        merged.added === 1 &&
        r.status === 'no-next' &&
        r.reconciled === 'owned-to-latest'
      );
    })(),
  },
  {
    name: 'integration: 7巻購入→簡易更新後、latest=10 なら要再確認(stale)へ遷移',
    ok: (() => {
      const existing = [1, 2, 3, 4, 5, 6].map((v) => ({
        asin: `b${v}`,
        seriesKey: 'テストシリーズ',
        volume: v,
        imprint: '',
        author: '',
      }));
      const merged = mergeScan(existing, [
        { asin: 'b7', seriesKey: 'テストシリーズ', volume: 7, imprint: '', author: '' },
      ]);
      const after = merged.series[0];
      const cached = { status: 'has-next', nextVolume: 7, latestVolume: 10 };
      const r = reconcileCatalog(cached, after.highestVolume);
      return after.highestVolume === 7 && r.stale === true && r.status === 'has-next';
    })(),
  },
];

let allOk = true;
for (const check of checks) {
  console.log(`${check.ok ? '✓' : '✗'} ${check.name}`);
  if (!check.ok) allOk = false;
}

process.exit(allOk ? 0 : 1);
