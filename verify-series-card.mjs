import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  discountValue,
  formatRanges,
  nextUnknownProbeState,
  priceValue,
  resolveProbeCacheWrite,
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
    name: 'resolvePrimaryOffer は no-next で null を返す（所有巻の価格を出さない）',
    ok: (() => {
      return resolvePrimaryOffer(noNext) === null;
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
    name: 'ブラウザでは価格計算版が一致しない旧キャッシュを表示しない',
    ok: (() => {
      const previousCatalog = globalThis.__KST_CATALOG__;
      globalThis.__KST_CATALOG__ = { PRICE_CALC_VERSION: 7 };
      const oldOffer = resolvePrimaryOffer(hasNext);
      const currentOffer = resolvePrimaryOffer({ ...hasNext, nextPriceCalcVersion: 7 });
      if (previousCatalog === undefined) delete globalThis.__KST_CATALOG__;
      else globalThis.__KST_CATALOG__ = previousCatalog;
      return (
        oldOffer.priceText === '' &&
        oldOffer.discountRate === null &&
        currentOffer.priceText === '￥396' &&
        currentOffer.discountRate === 50
      );
    })(),
  },
  {
    name: 'discountValue は割引率を返し、割引なし/未照会は -1 を返す',
    ok:
      discountValue(hasNext) === 50 &&
      discountValue(noNext) === -1 &&
      discountValue({ status: 'no-next', latestPriceText: '￥500' }) === -1 &&
      discountValue(null) === -1,
  },
  {
    name: 'formatRanges は単巻と連番レンジを整形する',
    ok: formatRanges([[1, 3], [5, 5], [7, 9]]) === '1-3, 5, 7-9',
  },
  {
    name: 'priceValue は次巻価格を数値で返す',
    ok: priceValue(hasNext) === 396,
  },
  {
    name: 'priceValue はカンマ区切り価格も数値化する',
    ok: priceValue({ status: 'has-next', nextPriceText: '¥1,234', nextVolume: 2, nextTitle: 'x', nextUrl: 'u' }) === 1234,
  },
  {
    name: 'priceValue は no-next で Infinity を返す',
    ok: priceValue(noNext) === Infinity,
  },
  {
    name: 'priceValue は null で Infinity を返す',
    ok: priceValue(null) === Infinity,
  },
  {
    name: 'resolveProbeCacheWrite は既存 cache を unknown で上書きしない',
    ok: (() => {
      const previous = { ...hasNext, checkedAt: 100 };
      const write = resolveProbeCacheWrite(previous, { status: 'unknown' }, 200);
      return write.shouldStore === false && write.cacheEntry === previous;
    })(),
  },
  {
    name: 'resolveProbeCacheWrite は既存 cache がない unknown を保存対象にする',
    ok: (() => {
      const write = resolveProbeCacheWrite(null, { status: 'unknown' }, 300);
      return (
        write.shouldStore === true &&
        write.cacheEntry.status === 'unknown' &&
        write.cacheEntry.checkedAt === 300
      );
    })(),
  },
  {
    name: 'resolveProbeCacheWrite は判定済み結果を checkedAt 付きで保存対象にする',
    ok: (() => {
      const write = resolveProbeCacheWrite(hasNext, noNext, 400);
      return (
        write.shouldStore === true &&
        write.cacheEntry.status === 'no-next' &&
        write.cacheEntry.checkedAt === 400
      );
    })(),
  },
  {
    name: 'nextUnknownProbeState は unknown 3連続で失敗扱いにする',
    ok: (() => {
      const first = nextUnknownProbeState({ status: 'unknown' }, 0);
      const second = nextUnknownProbeState({ status: 'unknown' }, first.unknownStreak);
      const third = nextUnknownProbeState({ status: 'unknown' }, second.unknownStreak);
      return (
        first.failed === false &&
        second.failed === false &&
        third.failed === true &&
        third.unknownStreak === 3
      );
    })(),
  },
  {
    name: 'nextUnknownProbeState は判定済み結果で unknown 連続数をリセットする',
    ok: (() => {
      const state = nextUnknownProbeState({ status: 'has-next' }, 2);
      return state.failed === false && state.unknownStreak === 0;
    })(),
  },
];

let allOk = true;
for (const check of checks) {
  console.log(`${check.ok ? '✓' : '✗'} ${check.name}`);
  if (!check.ok) allOk = false;
}

process.exit(allOk ? 0 : 1);
