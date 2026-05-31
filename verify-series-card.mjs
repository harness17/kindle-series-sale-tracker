import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  discountValue,
  formatRanges,
  resolvePrimaryOffer,
} = require('./extension/shared/series-card.js');

const hasNext = {
  status: 'has-next',
  nextVolume: 4,
  nextTitle: 'サンプル冒険譚 4',
  nextUrl: 'next-url',
  nextReleaseDate: '2026-06-01',
  nextThumbnailUrl: 'next.jpg',
  nextPriceText: '￥396',
  nextListPriceText: '￥792',
  nextDiscountRate: 50,
  latestVolume: 5,
  latestTitle: 'サンプル冒険譚 5',
  latestUrl: 'latest-url',
  latestReleaseDate: '2026-07-01',
  latestThumbnailUrl: 'latest.jpg',
  latestPriceText: '￥792',
  latestListPriceText: '',
  latestDiscountRate: null,
};

const noNext = {
  status: 'no-next',
  latestVolume: 3,
  latestTitle: 'サンプル冒険譚 3',
  latestUrl: 'latest-url',
  latestReleaseDate: '2026-05-01',
  latestThumbnailUrl: 'latest.jpg',
  latestPriceText: '￥500',
  latestListPriceText: '￥1,000',
  latestDiscountRate: 50,
};

const legacyHasNext = {
  status: 'has-next',
  nextVolume: 4,
  nextTitle: 'サンプル冒険譚 4',
  nextUrl: 'next-url',
  latestVolume: 4,
  latestTitle: 'サンプル冒険譚 4',
  latestPriceText: '￥500',
  latestDiscountRate: 20,
};

const checks = [
  {
    name: 'resolvePrimaryOffer は has-next で next 系フィールドを優先する',
    ok: (() => {
      const offer = resolvePrimaryOffer(hasNext);
      return (
        offer.isNext === true &&
        offer.volume === 4 &&
        offer.title === 'サンプル冒険譚 4' &&
        offer.url === 'next-url' &&
        offer.releaseDate === '2026-06-01' &&
        offer.thumbnailUrl === 'next.jpg' &&
        offer.priceText === '￥396' &&
        offer.listPriceText === '￥792' &&
        offer.discountRate === 50
      );
    })(),
  },
  {
    name: 'resolvePrimaryOffer は no-next で latest 系フィールドにフォールバックする',
    ok: (() => {
      const offer = resolvePrimaryOffer(noNext);
      return (
        offer.isNext === false &&
        offer.volume === 3 &&
        offer.title === 'サンプル冒険譚 3' &&
        offer.releaseDate === '2026-05-01' &&
        offer.thumbnailUrl === 'latest.jpg' &&
        offer.priceText === '￥500' &&
        offer.discountRate === 50
      );
    })(),
  },
  {
    name: '旧has-nextキャッシュは next 系割引なしとして扱う',
    ok: (() => {
      const offer = resolvePrimaryOffer(legacyHasNext);
      return (
        offer.isNext === true &&
        offer.volume === 4 &&
        offer.priceText === undefined &&
        offer.discountRate === null &&
        discountValue(legacyHasNext) === -1
      );
    })(),
  },
  {
    name: 'discountValue は割引率を返し、割引なし/未照会は -1 を返す',
    ok:
      discountValue(hasNext) === 50 &&
      discountValue(noNext) === 50 &&
      discountValue({ status: 'no-next', latestPriceText: '￥500' }) === -1 &&
      discountValue(null) === -1,
  },
  {
    name: 'formatRanges は単巻と連番レンジを整形する',
    ok: formatRanges([[1, 3], [5, 5], [7, 9]]) === '1-3, 5, 7-9',
  },
];

let allOk = true;
for (const check of checks) {
  console.log(`${check.ok ? '✓' : '✗'} ${check.name}`);
  if (!check.ok) allOk = false;
}

process.exit(allOk ? 0 : 1);
