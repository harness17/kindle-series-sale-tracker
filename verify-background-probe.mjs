import fs from 'node:fs';
import vm from 'node:vm';

const backgroundSource = fs.readFileSync(
  new URL('./extension/background/background.js', import.meta.url),
  'utf8'
);
const offscreenSource = fs.readFileSync(
  new URL('./extension/offscreen/offscreen.js', import.meta.url),
  'utf8'
);

function createHarness(
  seriesCount,
  failingKeys = new Set(),
  { unknownKeys = new Set(), initialCache = {} } = {}
) {
  const series = Array.from({ length: seriesCount }, (_, index) => ({
    key: `series-${String(index + 1).padStart(2, '0')}`,
    title: `Series ${index + 1}`,
    highestVolume: index + 1,
  }));
  const storage = {
    kstBgProbeEnabled: true,
    kstCatalogPriceVersion: 7,
    kstLastScan: { series },
    kstCatalogCache: { ...initialCache },
    kstBgProbeQueue: { cursor: 0, lastCycleAt: 0 },
    kstBgBadgeCount: 0,
  };
  let alarmListener = null;
  let probeCount = 0;

  const chrome = {
    action: {
      async setBadgeText() {},
      async setBadgeBackgroundColor() {},
    },
    alarms: {
      async clear() {},
      async create() {},
      get(_name, callback) {
        callback(null);
      },
      onAlarm: {
        addListener(listener) {
          alarmListener = listener;
        },
      },
    },
    runtime: {
      lastError: null,
      onInstalled: { addListener() {} },
      onMessage: { addListener() {} },
      onStartup: { addListener() {} },
    },
    storage: {
      local: {
        async get(keys) {
          const selected = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(
            selected.filter((key) => Object.hasOwn(storage, key)).map((key) => [key, storage[key]])
          );
        },
        async remove(key) {
          delete storage[key];
        },
        async set(payload) {
          Object.assign(storage, payload);
        },
      },
      onChanged: { addListener() {} },
    },
  };

  const context = {
    chrome,
    console: { error() {}, log() {}, warn() {} },
    setTimeout(callback) {
      callback();
    },
    __KST__: { STORAGE_KEY: 'kstLastScan' },
    __KST_CATALOG__: {},
    __KST_CARD__: {
      discountValue() {
        return -1;
      },
      isConfirmedHasNext() {
        return false;
      },
      async probeSeries(_catalog, item) {
        probeCount += 1;
        if (failingKeys.has(item.key)) throw new Error('expected probe failure');
        if (unknownKeys.has(item.key)) return { status: 'unknown', marker: `new-${item.key}` };
        return { status: 'no-next', marker: item.key };
      },
      reconcileCatalog(value) {
        return value || null;
      },
    },
  };
  context.globalThis = context;

  vm.runInNewContext(backgroundSource, context, { filename: 'background.js' });

  return {
    async run() {
      alarmListener({ name: 'kstBgProbe' });
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (['completed', 'failed'].includes(storage.kstBgProbeRunState?.status)) return storage;
        await new Promise((resolve) => setImmediate(resolve));
      }
      throw new Error('background probe did not finish');
    },
    async runTwice() {
      alarmListener({ name: 'kstBgProbe' });
      alarmListener({ name: 'kstBgProbe' });
      const result = await this.run();
      return { storage: result, probeCount };
    },
  };
}

function createOffscreenHarness(failingKeys = new Set(), unknownKeys = new Set()) {
  const storage = {};
  let messageListener = null;
  const chrome = {
    runtime: {
      onMessage: {
        addListener(listener) {
          messageListener = listener;
        },
      },
    },
    storage: {
      local: {
        async set(payload) {
          Object.assign(storage, payload);
        },
      },
    },
  };
  const context = {
    chrome,
    console: { log() {}, warn() {} },
    setTimeout(callback) {
      callback();
    },
    window: {
      __KST_CATALOG__: {},
      __KST_CARD__: {
        discountValue() {
          return -1;
        },
        isConfirmedHasNext() {
          return false;
        },
        async probeSeries(_catalog, item) {
          if (failingKeys.has(item.key)) throw new Error('expected probe failure');
          if (unknownKeys.has(item.key)) return { status: 'unknown', marker: `new-${item.key}` };
          return { status: 'no-next', marker: item.key };
        },
        reconcileCatalog(value) {
          return value || null;
        },
      },
    },
  };
  vm.runInNewContext(offscreenSource, context, { filename: 'offscreen.js' });

  return {
    async run(chunk, prevCache = {}, initialUnknownStreak = 0) {
      const response = await new Promise((resolve) => {
        messageListener(
          {
            type: 'kst:bgProbeChunk',
            chunk,
            prevCache,
            currentBadgeCount: 0,
            initialUnknownStreak,
            queue: { cursor: 0, lastCycleAt: 0, eligibleLength: chunk.length },
          },
          null,
          resolve
        );
      });
      return { response, storage };
    },
  };
}

const checks = [
  {
    name: '対象が8件を超えても1回のalarmで全シリーズのcacheを更新する',
    run: async () => {
      const storage = await createHarness(17).run();
      return (
        Object.keys(storage.kstCatalogCache).length === 17 &&
        storage.kstBgProbeQueue.cursor === 0 &&
        storage.kstBgProbeQueue.lastCycleAt > 0 &&
        storage.kstBgProbeLastRunAt > 0 &&
        storage.kstBgProbeRunState.status === 'completed' &&
        storage.kstBgProbeRunState.processed === 17 &&
        storage.kstBgProbeRunState.failed === 0
      );
    },
  },
  {
    name: '8件境界でも1サイクルを完了扱いにする',
    run: async () => {
      const storage = await createHarness(8).run();
      return (
        Object.keys(storage.kstCatalogCache).length === 8 &&
        storage.kstBgProbeQueue.cursor === 0 &&
        storage.kstBgProbeLastRunAt > 0
      );
    },
  },
  {
    name: '個別シリーズの取得失敗はスキップして残りを更新する',
    run: async () => {
      const storage = await createHarness(10, new Set(['series-04'])).run();
      return (
        Object.keys(storage.kstCatalogCache).length === 9 &&
        storage.kstCatalogCache['series-04'] === undefined &&
        storage.kstCatalogCache['series-10']?.marker === 'series-10' &&
        storage.kstBgProbeLastRunAt > 0 &&
        storage.kstBgProbeRunState.status === 'completed' &&
        storage.kstBgProbeRunState.processed === 10 &&
        storage.kstBgProbeRunState.failed === 1
      );
    },
  },
  {
    name: '対象0件でも実行時刻と完了queueを記録する',
    run: async () => {
      const storage = await createHarness(0).run();
      return (
        Object.keys(storage.kstCatalogCache).length === 0 &&
        storage.kstBgProbeQueue.cursor === 0 &&
        storage.kstBgProbeQueue.lastCycleAt > 0 &&
        storage.kstBgProbeLastRunAt > 0
      );
    },
  },
  {
    name: 'Chrome offscreen経路もcache差分と失敗件数をbackgroundへ返す',
    run: async () => {
      const chunk = [
        { key: 'series-01', highestVolume: 1 },
        { key: 'series-02', highestVolume: 2 },
        { key: 'series-03', highestVolume: 3 },
      ];
      const { response, storage } = await createOffscreenHarness(new Set(['series-02'])).run(chunk);
      return (
        response.done === true &&
        response.failedCount === 1 &&
        Object.keys(response.cacheEntries).length === 2 &&
        response.queue.cursor === 0 &&
        Object.keys(storage).length === 0
      );
    },
  },
  {
    name: '既存cacheがあるシリーズの判別不能結果では既存データを更新しない',
    run: async () => {
      const existing = { status: 'has-next', marker: 'existing', checkedAt: 123 };
      const storage = await createHarness(2, new Set(), {
        unknownKeys: new Set(['series-01']),
        initialCache: { 'series-01': existing },
      }).run();
      return (
        storage.kstBgProbeRunState.status === 'completed' &&
        storage.kstCatalogCache['series-01'].marker === 'existing' &&
        storage.kstCatalogCache['series-01'].checkedAt === 123 &&
        storage.kstCatalogCache['series-02'].marker === 'series-02'
      );
    },
  },
  {
    name: '判別不能が3件連続したら失敗扱いにして成功時刻を更新しない',
    run: async () => {
      const initialCache = Object.fromEntries(
        ['series-01', 'series-02', 'series-03'].map((key) => [
          key,
          { status: 'has-next', marker: `existing-${key}`, checkedAt: 123 },
        ])
      );
      const storage = await createHarness(4, new Set(), {
        unknownKeys: new Set(['series-01', 'series-02', 'series-03']),
        initialCache,
      }).run();
      return (
        storage.kstBgProbeRunState.status === 'failed' &&
        storage.kstBgProbeLastRunAt === undefined &&
        storage.kstBgProbeQueue.cursor === 0 &&
        storage.kstCatalogCache['series-01'].marker === 'existing-series-01' &&
        storage.kstBgProbeHistory?.[0]?.status === 'failed'
      );
    },
  },
  {
    name: 'chunk境界をまたぐ3件連続の判別不能も失敗扱いにする',
    run: async () => {
      const storage = await createHarness(9, new Set(), {
        unknownKeys: new Set(['series-07', 'series-08', 'series-09']),
      }).run();
      return (
        storage.kstBgProbeRunState.status === 'failed' &&
        storage.kstBgProbeLastRunAt === undefined &&
        storage.kstBgProbeQueue.cursor === 8 &&
        storage.kstCatalogCache['series-06']?.marker === 'series-06' &&
        storage.kstCatalogCache['series-07']?.status === 'unknown' &&
        storage.kstCatalogCache['series-08']?.status === 'unknown' &&
        storage.kstCatalogCache['series-09'] === undefined
      );
    },
  },
  {
    name: '正常結果を挟んだ判別不能は連続数をリセットして完走する',
    run: async () => {
      const storage = await createHarness(5, new Set(), {
        unknownKeys: new Set(['series-01', 'series-02', 'series-04', 'series-05']),
      }).run();
      return (
        storage.kstBgProbeRunState.status === 'completed' &&
        storage.kstBgProbeLastRunAt > 0 &&
        Object.keys(storage.kstCatalogCache).length === 5
      );
    },
  },
  {
    name: 'Chrome offscreen経路でも既存cache保持と連続判別不能の失敗を適用する',
    run: async () => {
      const chunk = [
        { key: 'series-01', highestVolume: 1 },
        { key: 'series-02', highestVolume: 2 },
      ];
      const existing = { 'series-01': { status: 'has-next', marker: 'existing' } };
      const preserve = await createOffscreenHarness(
        new Set(),
        new Set(['series-01'])
      ).run(chunk, existing);
      const fail = await createOffscreenHarness(
        new Set(),
        new Set(['series-01', 'series-02'])
      ).run(chunk, existing, 1);
      return (
        preserve.response.done === true &&
        preserve.response.cacheEntries['series-01'] === undefined &&
        preserve.response.cacheEntries['series-02']?.marker === 'series-02' &&
        fail.response.done === false &&
        /indeterminate/i.test(fail.response.error)
      );
    },
  },
  {
    name: '同時にalarmが重なっても全件照会を二重実行しない',
    run: async () => {
      const { storage, probeCount } = await createHarness(9).runTwice();
      return storage.kstBgProbeRunState.status === 'completed' && probeCount === 9;
    },
  },
];

let allOk = true;
for (const check of checks) {
  let ok = false;
  try {
    ok = await check.run();
  } catch (error) {
    console.error(error);
  }
  console.log(`${ok ? '✓' : '✗'} ${check.name}`);
  if (!ok) allOk = false;
}

process.exit(allOk ? 0 : 1);
