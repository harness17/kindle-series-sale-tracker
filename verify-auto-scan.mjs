import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const api = require('./extension/shared/kindle-library.js');
const contentSource = fs.readFileSync(
  new URL('./extension/content/content.js', import.meta.url),
  'utf8'
);

function createHarness(storageSeed, options = {}) {
  const storage = { ...storageSeed };
  const stateHistory = [];
  const document = {
    documentElement: { appendChild() {} },
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    },
    scripts: [],
  };
  const window = {
    __KST__: api,
    csrfToken: options.csrfToken || '',
    setTimeout(callback) {
      callback();
    },
  };
  const chrome = {
    runtime: {
      id: 'test-extension',
      onMessage: { addListener() {} },
    },
    storage: {
      local: {
        async get(keys) {
          const selected = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(
            selected.filter((key) => Object.hasOwn(storage, key)).map((key) => [key, storage[key]])
          );
        },
        async set(payload) {
          Object.assign(storage, payload);
          if (payload.kstAutoScanRunState) {
            stateHistory.push({ ...payload.kstAutoScanRunState });
          }
        },
      },
    },
  };
  const context = {
    URLSearchParams,
    chrome,
    console: { warn() {} },
    document,
    fetch: options.fetch || (async () => {
      throw new Error('unexpected fetch');
    }),
    location: { href: 'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/' },
    window,
  };
  context.globalThis = context;
  window.chrome = chrome;
  window.document = document;

  vm.runInNewContext(contentSource, context, { filename: 'content.js' });

  return {
    async waitForStatus(status) {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (storage.kstAutoScanRunState?.status === status) return storage;
        await new Promise((resolve) => setImmediate(resolve));
      }
      throw new Error(`auto scan did not reach ${status}`);
    },
    stateHistory,
    storage,
  };
}

const oldScan = {
  scannedAt: Date.now() - 10 * 86400000,
  totalItems: 1,
  items: [{ asin: 'owned-1', seriesKey: 'Sample', volume: 1, imprint: '', author: '' }],
  series: [],
};

const checks = [
  {
    name: '自動スキャンOFFでは発火状態を保存せず通信もしない',
    run: async () => {
      const harness = createHarness({ kstAutoScanEnabled: false });
      await new Promise((resolve) => setImmediate(resolve));
      return harness.stateHistory.length === 0 && harness.storage.kstAutoScanRunState === undefined;
    },
  },
  {
    name: '間隔未到来のページ訪問を発火済み・未実行として記録する',
    run: async () => {
      const harness = createHarness({
        kstAutoScanEnabled: true,
        kstAutoScanIntervalD: 7,
        kstLastScan: { ...oldScan, scannedAt: Date.now() },
      });
      const storage = await harness.waitForStatus('skipped-not-due');
      return storage.kstAutoScanRunState.checkedAt > 0 && storage.kstAutoScanRunState.nextDueAt > 0;
    },
  },
  {
    name: '基準データなしのページ訪問は理由付きでスキップする',
    run: async () => {
      const harness = createHarness({
        kstAutoScanEnabled: true,
        kstAutoScanIntervalD: 7,
      });
      const storage = await harness.waitForStatus('skipped-no-baseline');
      return storage.kstAutoScanRunState.checkedAt > 0;
    },
  },
  {
    name: '期限到来時の取得失敗を失敗時刻付きで記録する',
    run: async () => {
      const harness = createHarness({
        kstAutoScanEnabled: true,
        kstAutoScanIntervalD: 7,
        kstLastScan: oldScan,
      });
      const storage = await harness.waitForStatus('failed');
      return storage.kstAutoScanLastAttempt > 0 && storage.kstAutoScanRunState.finishedAt > 0;
    },
  },
  {
    name: '期限到来時の簡易取得完了を総冊数・追加冊数付きで記録する',
    run: async () => {
      const harness = createHarness(
        {
          kstAutoScanEnabled: true,
          kstAutoScanIntervalD: 7,
          kstLastScan: oldScan,
        },
        {
          csrfToken: 'token',
          fetch: async () => ({
            ok: true,
            async json() {
              return {
                GetContentOwnershipData: {
                  items: [],
                  numberOfItems: 1,
                },
              };
            },
          }),
        }
      );
      const storage = await harness.waitForStatus('completed');
      return (
        storage.kstAutoScanRunState.totalItems === 1 &&
        storage.kstAutoScanRunState.addedItems === 0 &&
        storage.kstAutoScanRunState.finishedAt > 0 &&
        harness.stateHistory.some((state) => state.status === 'running')
      );
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
