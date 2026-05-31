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
      .replace(/【[^】]*】/g, '') // 【電子版】【特典付き】等の版表記
      .replace(/\bkindle版\b/gi, '')
      .replace(/\b電子書籍\b/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[ \t　:：\-―—~～]+$/g, '')
      .trim();
  }

  // 巻マーカーより後ろにある「末尾の非数字な括弧」をレーベル（版）名として取り出す。
  // 例:「私の少年 : 4 …（アクションコミックス）」→「アクションコミックス」。
  // 巻数そのものの括弧（私の少年（4））や、数字だけの括弧は版名扱いしない
  // （MOONLIGHT MILE(19) の "19" を版名と誤認しないため）。
  function extractImprint(title, afterIndex) {
    const match = title.match(/[（(]([^（()）]+)[)）]\s*$/);
    if (!match) return '';
    // 末尾括弧が巻マーカーより手前（＝巻括弧自身など）なら版名ではない。
    if (match.index < afterIndex) return '';
    const label = stripNoise(match[1]);
    // 数字のみ（巻数）は版名扱いしない。
    if (!label || /^\d+$/.test(label)) return '';
    return label;
  }

  // 全巻バンドル（完結セット）表記を判定する。これらは「完結済みの1冊まとめ買い」で
  // 続刊・欠番の追跡対象外。総巻数（全N巻のN）を所有巻と誤認すると、seriesKey が
  // 「【1」のように崩れたり、所有していない巻数の幻シリーズが生まれる。
  //
  // 判定は「数字が総巻数・範囲を表す」2表記に限定する:
  //   - 全N巻（例: とらドラ！ 全13巻）
  //   - M～N巻（例: 【1～6巻合本版】…）
  // 単なる「合本/コンプリート」キーワードでは判定しない。【極！合本シリーズ】の
  // ように合本リーズ自体が連番（N巻）を持つ正規の多巻シリーズを誤除外しないため。
  // 通常の巻表記（解体屋ゲン 110巻 等）も巻き込まない。
  function isBoxSet(title) {
    return (
      /全\s*\d{1,3}\s*巻/.test(title) || // 全N巻（完結セットの総巻数）
      /\d{1,3}\s*[～~〜－‐ー-]\s*\d{1,3}\s*巻/.test(title) // M～N巻（範囲指定の合本）
    );
  }

  // 合本版タイトルから束ね表記を取り除き、できるだけ本来のシリーズ名へ寄せる。
  // 除外対象（巻数なし単巻）になるため厳密さは不要だが、個別巻も所有している
  // シリーズと偶然キーが一致すれば自然に合流できる。
  function stripBoxSetNoise(title) {
    return stripNoise(
      title
        // 合本/全N巻/コンプリート/まとめ買い を含む【…】ブロックごと除去
        .replace(/[【\[][^】\]]*(?:合本|全\s*\d{1,3}\s*巻|コンプリート|まとめ買い)[^】\]]*[】\]]/g, '')
        .replace(/\d{1,3}\s*[～~〜－‐ー-]\s*\d{1,3}\s*巻/g, '')
        .replace(/全\s*\d{1,3}\s*巻/g, '')
        .replace(/(?:超|大)?合本版?/g, '')
        .replace(/コンプリート(?:BOX|ＢＯＸ)?版?/gi, '')
        .replace(/まとめ買い/g, '')
    );
  }

  // タイトルを「シリーズ名」と「巻数」に分割する。
  // 末尾付近の巻トークン位置でタイトルを切り、それ以降（巻ごとに変わる
  // サブタイトルや版表記）は捨てることで、表記ゆれを跨いで同一シリーズへ束ねる。
  // imprint には巻数より後ろの末尾レーベル名を返す（複数版所有の分割判定に使う）。
  function splitSeriesAndVolume(rawTitle) {
    const title = normalizeText(rawTitle);

    // 合本版・全巻バンドルは巻数を抽出せず、続刊追跡の対象外にする。
    if (isBoxSet(title)) {
      return { seriesKey: stripBoxSetNoise(title), volume: null, imprint: '' };
    }

    let marker = null; // { headLen, volume, tokenEnd }

    // 強い巻マーカー: （N） / 第N巻 / vol.N。最も手前の出現位置を採用する。
    const strongPatterns = [
      /[（(]\s*(\d{1,3})\s*[）)]/,
      /(?:第\s*)?(\d{1,3})\s*巻/,
      /\bvol(?:ume)?\.?\s*(\d{1,3})\b/i,
    ];
    for (const pattern of strongPatterns) {
      const match = title.match(pattern);
      if (match && (marker === null || match.index < marker.headLen)) {
        marker = {
          headLen: match.index,
          volume: Number(match[1]),
          tokenEnd: match.index + match[0].length,
        };
      }
    }

    // 弱い巻マーカー: 空白区切りの裸数字。先頭の数字（1Q84 / 20世紀少年 等）を
    // 巻数扱いしないよう、直前にシリーズ名（非空白）がある最初のトークンに限定する。
    // 数字の直後は空白/文末だけでなく括弧（11【…】 / 5(…) 等）も許可する。
    if (marker === null) {
      const match = title.match(/^(.*?\S)\s+(\d{1,3})(?=\s|$|[【（(\[「『])/);
      if (match) {
        marker = {
          headLen: match[1].length,
          volume: Number(match[2]),
          tokenEnd: match[0].length,
        };
      }
    }

    if (marker === null) {
      return { seriesKey: stripNoise(title), volume: null, imprint: '' };
    }

    const seriesKey = stripNoise(title.slice(0, marker.headLen));
    // 切った結果シリーズ名が空 → その数字はタイトルの一部とみなし、切らない。
    if (!seriesKey) {
      return { seriesKey: stripNoise(title), volume: null, imprint: '' };
    }
    return {
      seriesKey,
      volume: marker.volume,
      imprint: extractImprint(title, marker.tokenEnd),
    };
  }

  function normalizeBook(item) {
    const title = normalizeText(item.title);
    const authors = Array.isArray(item.authors)
      ? item.authors.map(normalizeText).filter(Boolean)
      : normalizeText(item.authors)
          .split(/[,、]/)
          .map(normalizeText)
          .filter(Boolean);

    const { seriesKey, volume, imprint } = splitSeriesAndVolume(title);

    return {
      title,
      authors,
      // 保存軽量化のため、グループ集計に必要な第一著者だけを単一文字列で持つ。
      // 再グルーピング（簡易マージ・読込時再構築）は author だけで mostCommonAuthor を再計算できる。
      author: firstAuthor(authors),
      acquiredTime: item.acquiredTime ?? null,
      acquiredDate: item.acquiredDate ?? null,
      readStatus: item.readStatus ?? '',
      asin: normalizeText(item.asin),
      seriesKey,
      volume,
      imprint,
    };
  }

  // 保存用の最小書誌。重い title / authors[] / acquiredDate / readStatus を捨て、
  // 再グルーピング・版分割・簡易マージに必要なフィールドだけを残す（約 1/4 サイズ）。
  // title から再計算できる seriesKey/volume/imprint は、再計算コストを避けるため保持する。
  function toMinimalBook(book) {
    return {
      asin: book.asin,
      seriesKey: book.seriesKey,
      volume: Number.isFinite(book.volume) ? book.volume : null,
      imprint: book.imprint || '',
      author: book.author || firstAuthor(book.authors),
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
  // book.author（正規化済み単一文字列）を優先し、無ければ authors[] から導出する。
  // これにより full 書誌でも minimal 書誌（authors[] を持たない）でも同じく集計できる。
  function mostCommonAuthor(books) {
    const counts = new Map();
    for (const book of books) {
      const author = book.author || firstAuthor(book.authors);
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

  // グループ内で最頻の版（レーベル）名を表示・続刊照合用に選ぶ。空（版名なし）は数えない。
  // 続刊照会で「所有している版と別レーベルの新装版」を続刊と誤認しないための基準値になる。
  function mostCommonImprint(books) {
    const counts = new Map();
    for (const book of books) {
      if (!book.imprint) continue;
      counts.set(book.imprint, (counts.get(book.imprint) || 0) + 1);
    }
    let best = '';
    let bestCount = 0;
    for (const [imprint, count] of counts) {
      if (count > bestCount) {
        best = imprint;
        bestCount = count;
      }
    }
    return best;
  }

  // 同一作品を複数の版（レーベル）で所有しているグループを版ごとに分割する。
  // 分割するのは「同じ巻番号が2冊以上ある（＝別版が重なっている確証）」かつ
  // 「2種以上の版名がある」かつ「全冊が版名を持つ」場合だけ。
  // レーベル改称（3月のライオン等、巻番号は連続して重複しない）を誤って分割しないための保守的な条件。
  function splitMixedImprints(groupList) {
    const result = [];
    for (const group of groupList) {
      const seen = new Set();
      let hasDuplicateVolume = false;
      for (const book of group.books) {
        if (!Number.isFinite(book.volume)) continue;
        if (seen.has(book.volume)) hasDuplicateVolume = true;
        seen.add(book.volume);
      }
      const imprints = new Set(group.books.map((b) => b.imprint).filter(Boolean));
      const allHaveImprint = group.books.every((b) => b.imprint);

      if (!hasDuplicateVolume || imprints.size < 2 || !allHaveImprint) {
        result.push(group);
        continue;
      }

      const byImprint = new Map();
      for (const book of group.books) {
        if (!byImprint.has(book.imprint)) {
          byImprint.set(book.imprint, {
            key: `${group.key}::${book.imprint}`,
            title: `${group.title}（${book.imprint}）`,
            books: [],
          });
        }
        byImprint.get(book.imprint).books.push(book);
      }
      for (const sub of byImprint.values()) result.push(sub);
    }
    return result;
  }

  // 正規化済み書籍（full でも minimal でも可）をグルーピングしてシリーズ要約を作る。
  // normalizeBook を通した後の books を受け取る前提なので、title を持たない minimal 書籍
  // （簡易マージ・保存からの再構築）でも同じロジックで集計できる。
  function summarizeNormalizedBooks(books) {
    const groups = new Map();
    const seenAsins = new Set();
    for (const item of books) {
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

    const summaries = splitMixedImprints(Array.from(groups.values())).map((group) => {
      const volumes = group.books
        .map((item) => item.volume)
        .filter((volume) => Number.isFinite(volume))
        .sort((a, b) => a - b);
      const highestVolume = volumes.length ? volumes[volumes.length - 1] : null;
      const author = mostCommonAuthor(group.books);
      const imprint = mostCommonImprint(group.books);
      const query = encodeURIComponent(
        `${group.title} ${author ? `${author} ` : ''}Kindle`
      );

      return {
        key: group.key,
        title: group.title,
        author,
        imprint,
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

  function buildSeriesSummary(items) {
    return summarizeNormalizedBooks(items.map(normalizeBook));
  }

  // 既存の最小書籍リストへ、新規取得分（正規化済み）をマージする。
  // ASIN で重複排除し、簡易モードの差分取得結果を既存蔵書へ足し込むのに使う。
  // 返り値は { minimalBooks, series, added } で、そのまま保存・表示できる。
  function mergeScan(existingMinimalBooks, newBooks) {
    const byAsin = new Map();
    for (const b of existingMinimalBooks || []) {
      if (b && b.asin) byAsin.set(b.asin, b);
    }
    let added = 0;
    for (const raw of newBooks || []) {
      const book = toMinimalBook(raw);
      if (!book.asin) continue;
      if (!byAsin.has(book.asin)) added += 1;
      // 新しい情報で上書き（巻数・版名の補正が反映される）。
      byAsin.set(book.asin, book);
    }
    const minimalBooks = Array.from(byAsin.values());
    return {
      minimalBooks,
      series: summarizeNormalizedBooks(minimalBooks),
      added,
    };
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
    toMinimalBook,
    extractOwnershipItems,
    buildSeriesSummary,
    summarizeNormalizedBooks,
    mergeScan,
    toCsv,
    computeOwnedRanges,
    computeMissingVolumes,
    splitSeriesAndVolume,
    seriesKeyFromTitle: (title) => splitSeriesAndVolume(title).seriesKey,
  };
});
