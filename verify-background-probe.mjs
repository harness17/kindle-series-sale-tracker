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

function createHarness(seriesCount, failingKeys = new Set()) {
  const series = Array.from({ length: seriesCount }, (_, index) => ({
    key: `series-${String(index + 1).padStart(2, '0')}`,
    title: `Series ${index + 1}`,
    highestVolume: index + 1,
  }));
  const storage = {
    kstBgProbeEnabled: true,
    kstCatalogPriceVersion: 7,
    kstLastScan: { series },
    kstCatalogCache: {},
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
        if (storage.kstBgProbeLastRunAt) return storage;
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

function createOffscreenHarness(failingKeys = new Set()) {
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
    async run(chunk) {
      const response = await new Promise((resolve) => {
        messageListener(
          {
            type: 'kst:bgProbeChunk',
            chunk,
            prevCache: {},
            currentBadgeCount: 0,
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
        Object.keys(storage.kstCatalogCache).length === 2
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
