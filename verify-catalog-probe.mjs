import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { detectNextVolume } = require('./extension/shared/catalog-probe.js');

const checks = [
  {
    name: '最高巻より先の最小巻を続刊として検出する',
    ok: (() => {
      const r = detectNextVolume(
        [
          { title: '鬼滅の刃 13', url: 'u13' },
          { title: '鬼滅の刃 12', url: 'u12' },
          { title: '鬼滅の刃 公式ファンブック', url: 'fb' },
        ],
        { seriesTitle: '鬼滅の刃', highestVolume: 11 }
      );
      return r.status === 'has-next' && r.nextVolume === 12 && r.nextUrl === 'u12';
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
];

let allOk = true;
for (const check of checks) {
  console.log(`${check.ok ? '✓' : '✗'} ${check.name}`);
  if (!check.ok) allOk = false;
}

process.exit(allOk ? 0 : 1);
