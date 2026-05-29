(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.__KST__ = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'kstLastScan';
  const PROGRESS_KEY = 'kstScanProgress';

  function normalizeDigits(value) {
    return String(value ?? '').replace(/[０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    );
  }

  function normalizeText(value) {
    return normalizeDigits(value)
      .replace(/\s+/g, ' ')
      .replace(/[：]/g, ':')
      .trim();
  }

  function firstAuthor(authors) {
    if (Array.isArray(authors)) {
      return normalizeText(authors[0] ?? '');
    }
    return normalizeText(String(authors ?? '').split(/[,、]/)[0] ?? '');
  }

  function stripNoise(text) {
    return normalizeText(text)
      .replace(/\bkindle版\b/gi, '')
      .replace(/\b電子書籍\b/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[ \t　:：\-―—~～]+$/g, '')
      .trim();
  }

  // タイトルを「シリーズ名」と「巻数」に分割する。
  // 末尾付近の巻トークン位置でタイトルを切り、それ以降（巻ごとに変わる
  // サブタイトルや版表記）は捨てることで、表記ゆれを跨いで同一シリーズへ束ねる。
  function splitSeriesAndVolume(rawTitle) {
    const title = normalizeText(rawTitle);
    let marker = null; // { headLen, volume }

    // 強い巻マーカー: （N） / 第N巻 / vol.N。最も手前の出現位置を採用する。
    const strongPatterns = [
      /[（(]\s*(\d{1,3})\s*[）)]/,
      /(?:第\s*)?(\d{1,3})\s*巻/,
      /\bvol(?:ume)?\.?\s*(\d{1,3})\b/i,
    ];
    for (const pattern of strongPatterns) {
      const match = title.match(pattern);
      if (match && (marker === null || match.index < marker.headLen)) {
        marker = { headLen: match.index, volume: Number(match[1]) };
      }
    }

    // 弱い巻マーカー: 空白区切りの裸数字。先頭の数字（1Q84 / 20世紀少年 等）を
    // 巻数扱いしないよう、直前にシリーズ名（非空白）がある最初のトークンに限定する。
    if (marker === null) {
      const match = title.match(/^(.*?\S)\s+(\d{1,3})(?:\s|$)/);
      if (match) {
        marker = { headLen: match[1].length, volume: Number(match[2]) };
      }
    }

    if (marker === null) {
      return { seriesKey: stripNoise(title), volume: null };
    }

    const seriesKey = stripNoise(title.slice(0, marker.headLen));
    // 切った結果シリーズ名が空 → その数字はタイトルの一部とみなし、切らない。
    if (!seriesKey) {
      return { seriesKey: stripNoise(title), volume: null };
    }
    return { seriesKey, volume: marker.volume };
  }

  function normalizeBook(item) {
    const title = normalizeText(item.title);
    const authors = Array.isArray(item.authors)
      ? item.authors.map(normalizeText).filter(Boolean)
      : normalizeText(item.authors)
          .split(/[,、]/)
          .map(normalizeText)
          .filter(Boolean);

    const { seriesKey, volume } = splitSeriesAndVolume(title);

    return {
      title,
      authors,
      acquiredTime: item.acquiredTime ?? null,
      acquiredDate: item.acquiredDate ?? null,
      readStatus: item.readStatus ?? '',
      asin: normalizeText(item.asin),
      seriesKey,
      volume,
    };
  }

  function extractOwnershipItems(payload) {
    const data = payload && payload.GetContentOwnershipData;
    if (!data || !Array.isArray(data.items)) return [];
    return data.items.map(normalizeBook).filter((item) => item.title && item.asin);
  }

  function sortedUniqueVolumes(volumes) {
    return Array.from(
      new Set((volumes || []).filter((v) => Number.isFinite(v)))
    ).sort((a, b) => a - b);
  }

  // 所有巻を連番レンジに整形する。例: [1,2,3,5,6] → [[1,3],[5,6]]
  function computeOwnedRanges(volumes) {
    const sorted = sortedUniqueVolumes(volumes);
    const ranges = [];
    for (const v of sorted) {
      const last = ranges[ranges.length - 1];
      if (last && v === last[1] + 1) {
        last[1] = v;
      } else {
        ranges.push([v, v]);
      }
    }
    return ranges;
  }

  // 最小巻〜最高巻の間で所有していない巻番号を返す。最高巻より先（未刊/続刊）は含めない。
  function computeMissingVolumes(volumes) {
    const sorted = sortedUniqueVolumes(volumes);
    if (sorted.length < 2) return [];
    const owned = new Set(sorted);
    const missing = [];
    for (let v = sorted[0] + 1; v < sorted[sorted.length - 1]; v += 1) {
      if (!owned.has(v)) missing.push(v);
    }
    return missing;
  }

  // グループ内の書籍から最頻の第一著者を表示用に選ぶ。
  // （同一シリーズでも巻ごとに著者欄が揺れる＝原作/作画の表記差・順序違いがあるため）
  function mostCommonAuthor(books) {
    const counts = new Map();
    for (const book of books) {
      const author = firstAuthor(book.authors);
      if (!author) continue;
      counts.set(author, (counts.get(author) || 0) + 1);
    }
    let best = '';
    let bestCount = 0;
    for (const [author, count] of counts) {
      if (count > bestCount) {
        best = author;
        bestCount = count;
      }
    }
    return best;
  }

  function buildSeriesSummary(items) {
    const groups = new Map();
    const seenAsins = new Set();
    for (const item of items.map(normalizeBook)) {
      if (!item.seriesKey) continue;
      // 同一 ASIN を二重計上しない（取得側の重複に対する多層防御）。
      if (item.asin) {
        if (seenAsins.has(item.asin)) continue;
        seenAsins.add(item.asin);
      }
      // 著者表記ゆれ（巻ごとの原作/作画の差・順序違い）でシリーズが分裂し、
      // 欠番を誤検知するのを防ぐため、グループキーは seriesKey のみとする。
      // 著者は表示用にグループ内最頻値を後段で採用する。
      const key = item.seriesKey;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          title: item.seriesKey,
          books: [],
          count: 0,
          ownedVolumes: [],
          highestVolume: null,
          nextVolume: null,
          searchUrl: '',
        });
      }
      groups.get(key).books.push(item);
    }

    const summaries = Array.from(groups.values()).map((group) => {
      const volumes = group.books
        .map((item) => item.volume)
        .filter((volume) => Number.isFinite(volume))
        .sort((a, b) => a - b);
      const highestVolume = volumes.length ? volumes[volumes.length - 1] : null;
      const author = mostCommonAuthor(group.books);
      const query = encodeURIComponent(
        `${group.title} ${author ? `${author} ` : ''}Kindle`
      );

      return {
        key: group.key,
        title: group.title,
        author,
        count: group.books.length,
        ownedVolumes: Array.from(new Set(volumes)),
        highestVolume,
        nextVolume: highestVolume ? highestVolume + 1 : null,
        searchUrl: `https://www.amazon.co.jp/s?k=${query}&i=digital-text`,
      };
    });

    return summaries
      .filter((group) => group.count > 1 || group.highestVolume !== null)
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.title.localeCompare(b.title, 'ja');
      });
  }

  function formatDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}`;
  }

  function csvEscape(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
  }

  function toCsv(items) {
    const rows = [
      ['title', 'authors', 'asin', 'series', 'volume', 'acquiredTime', 'readStatus'],
      ...items.map((item) => {
        const book = normalizeBook(item);
        return [
          book.title,
          book.authors.join(' / '),
          book.asin,
          book.seriesKey,
          book.volume ?? '',
          formatDateTime(book.acquiredTime),
          book.readStatus,
        ];
      }),
    ];
    return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  }

  return {
    STORAGE_KEY,
    PROGRESS_KEY,
    normalizeBook,
    extractOwnershipItems,
    buildSeriesSummary,
    toCsv,
    computeOwnedRanges,
    computeMissingVolumes,
    splitSeriesAndVolume,
    seriesKeyFromTitle: (title) => splitSeriesAndVolume(title).seriesKey,
  };
});
