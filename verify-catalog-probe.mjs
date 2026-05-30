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
];

let allOk = true;
for (const check of checks) {
  console.log(`${check.ok ? '✓' : '✗'} ${check.name}`);
  if (!check.ok) allOk = false;
}

process.exit(allOk ? 0 : 1);
