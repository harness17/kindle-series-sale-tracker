import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  discountValue,
  formatRanges,
  isSaleImproved,
  nextUnknownProbeState,
  priceValue,
  probeSeries,
  resolveProbeCacheWrite,
  resolvePrimaryOffer,
  seriesSearchUrl,
} = require('./extension/shared/series-card.js');
const catalogProbe = require('./extension/shared/catalog-probe.js');

// --- probeSeries の補完検索（ギャップ検出）回帰テスト用スタブ ---
// fetch は URL をそのまま本文として返し、DOMParser は本文を素通しし、
// parseSearchResultsFromDoc が URL ごとの検索結果を返す。実 HTML を使わず
// 「どの URL を何回叩いたか」と「結果の統合」だけを検証する。
const probeGroupKey = 'むこうぶち 高レート裏麻雀列伝';
const probeGroup = {
  title: probeGroupKey,
  seriesKey: probeGroupKey,
  author: '天獅子悦也',
  imprint: '',
  highestVolume: 61,
  searchUrl: seriesSearchUrl(probeGroupKey, '天獅子悦也'),
};
const probeResult = (volume, spaced = false) => ({
  asin: `A${volume}`,
  title: `むこうぶち　高レート裏麻雀列伝${spaced ? '　' : ''}（${volume}） (近代麻雀コミックス)`,
  url: `https://www.amazon.co.jp/dp/A${volume}`,
  priceText: '¥700',
});
// 実際の Amazon 1ページ目（2026-09-14 実測）: 62 巻が含まれず 61 の次が 63 になる並び
const probePrimaryPage = [66, 65, 64, 1, 61, 63, 3, 2, 9, 8, 10, 29, 30, 43].map((v) =>
  probeResult(v, v < 40)
);

async function runProbe(resolver) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  const originalDOMParser = globalThis.DOMParser;
  globalThis.fetch = async (url) => {
    calls.push(url);
    if (resolver(url) === null) throw new Error('network');
    return { ok: true, text: async () => url };
  };
  globalThis.DOMParser = class {
    parseFromString(html) {
      return html;
    }
  };
  const catalog = {
    parseSearchResultsFromDoc: (url) => resolver(url) || [],
    detectNextVolume: catalogProbe.detectNextVolume,
  };
  try {
    const result = await probeSeries(catalog, probeGroup);
    return { result, calls };
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.DOMParser = originalDOMParser;
  }
}
const isPageUrl = (url) => url.includes('&page=');
const isGapUrl = (url, volume) => url === seriesSearchUrl(`${probeGroupKey} ${volume}`, '');

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

// 割引率だけを変えた has-next エントリを作る（isSaleImproved の比較対象用）。
function saleEntry(discountRate, volume = 4) {
  return {
    status: 'has-next',
    nextVolume: volume,
    nextTitle: `サンプル冒険譚 ${volume}`,
    nextUrl: 'next-url',
    nextPriceText: '￥396',
    nextListPriceText: '￥792',
    nextDiscountRate: discountRate,
    latestVolume: volume,
  };
}

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
    name: 'isSaleImproved は新規セールを検知する',
    ok:
      isSaleImproved(saleEntry(30), saleEntry(null)) === true &&
      isSaleImproved(saleEntry(30), null) === true,
  },
  {
    name: 'isSaleImproved は割引率が5ポイント以上上がったら検知する',
    ok: isSaleImproved(saleEntry(50), saleEntry(20)) === true,
  },
  {
    name: 'isSaleImproved は5ポイント未満の微増を検知しない',
    ok: isSaleImproved(saleEntry(22), saleEntry(20)) === false,
  },
  {
    name: 'isSaleImproved は割引率の下落とセール終了を検知しない',
    ok:
      isSaleImproved(saleEntry(20), saleEntry(50)) === false &&
      isSaleImproved(saleEntry(null), saleEntry(50)) === false,
  },
  {
    name: 'isSaleImproved は巻が変わっても割引率だけで比較する',
    ok:
      isSaleImproved(saleEntry(30, 5), saleEntry(null, 4)) === true &&
      isSaleImproved(saleEntry(30, 5), saleEntry(50, 4)) === false,
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

// --- probeSeries: 1ページ目に次巻が無い（+2 ギャップ）ケースの回帰テスト ---
{
  const smallGap = await runProbe((url) => {
    if (url === probeGroup.searchUrl) return probePrimaryPage;
    if (isGapUrl(url, 62)) return [probeResult(62), probeResult(66)];
    return [];
  });
  checks.push({
    name: 'probeSeries: 1ページ目が 61→63 でも補完検索で 62 巻を次巻にする',
    ok: smallGap.result.status === 'has-next' && smallGap.result.nextVolume === 62 &&
      smallGap.result.latestVolume === 66,
  });
  checks.push({
    name: 'probeSeries: +2 ギャップでは補完検索1回だけ追加し page=2〜5 は叩かない',
    ok: smallGap.calls.length === 2 && smallGap.calls.some((u) => isGapUrl(u, 62)) &&
      !smallGap.calls.some(isPageUrl),
  });

  const noGap = await runProbe((url) => {
    if (url === probeGroup.searchUrl) return probePrimaryPage.concat([probeResult(62)]);
    return [];
  });
  checks.push({
    name: 'probeSeries: 1ページ目に次巻があれば追加リクエストなし',
    ok: noGap.result.nextVolume === 62 && noGap.calls.length === 1,
  });

  const largeGap = await runProbe((url) => {
    if (url === probeGroup.searchUrl) return [probeResult(66), probeResult(61)];
    if (isGapUrl(url, 62)) return [probeResult(62)];
    if (isPageUrl(url)) return [probeResult(64)];
    return [];
  });
  checks.push({
    name: 'probeSeries: +4 以上のギャップでは従来どおり page=2〜5 と補完検索を両方叩く',
    ok: largeGap.result.nextVolume === 62 &&
      largeGap.calls.filter(isPageUrl).length === 4 && largeGap.calls.some((u) => isGapUrl(u, 62)),
  });

  const gapFailed = await runProbe((url) => {
    if (url === probeGroup.searchUrl) return probePrimaryPage;
    if (isGapUrl(url, 62)) return null;
    return [];
  });
  checks.push({
    name: 'probeSeries: 補完検索が失敗しても1ページ目の結果（63）を返す',
    ok: gapFailed.result.status === 'has-next' && gapFailed.result.nextVolume === 63,
  });
}

let allOk = true;
for (const check of checks) {
  console.log(`${check.ok ? '✓' : '✗'} ${check.name}`);
  if (!check.ok) allOk = false;
}

process.exit(allOk ? 0 : 1);
