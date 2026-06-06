import { execFileSync } from 'node:child_process';
import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const edgeCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];

let browserPath = null;
for (const candidate of edgeCandidates) {
  try {
    await access(candidate);
    browserPath = candidate;
    break;
  } catch {
    // Try the next known browser location.
  }
}

if (!browserPath) {
  throw new Error('Microsoft Edge or Google Chrome was not found.');
}

const out = {
  chromeOptions: path.join(root, 'store-assets', 'chrome', 'screenshots', 'en', '01-options-list-1280x800.png'),
  chromePanel: path.join(root, 'store-assets', 'chrome', 'screenshots', 'en', '02-side-panel-1280x800.png'),
  firefoxOptions: path.join(root, 'store-assets', 'firefox', 'screenshots', 'en', '01-options-list-1280x800.png'),
  firefoxPanel: path.join(root, 'store-assets', 'firefox', 'screenshots', 'en', '02-side-panel-1280x800.png'),
  chromePromo: path.join(root, 'store-assets', 'chrome', 'promo', 'small-promo-440x280-en.png'),
  firefoxBanner: path.join(root, 'store-assets', 'firefox', 'promo', 'banner-560x280-en.png'),
};

await Promise.all([
  mkdir(path.dirname(out.chromeOptions), { recursive: true }),
  mkdir(path.dirname(out.firefoxOptions), { recursive: true }),
  mkdir(path.dirname(out.chromePromo), { recursive: true }),
  mkdir(path.dirname(out.firefoxBanner), { recursive: true }),
]);

const tempDir = await mkdtemp(path.join(tmpdir(), 'kst-store-images-'));
const optionsCss = await readFile(path.join(root, 'extension', 'options', 'options.css'), 'utf8');
const popupCss = await readFile(path.join(root, 'extension', 'popup', 'popup.css'), 'utf8');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function cover(index) {
  const palettes = [
    ['#234d70', '#f7d859'],
    ['#b84e35', '#fde26b'],
    ['#e74632', '#fff06a'],
    ['#4ba45d', '#f5f3c3'],
    ['#602c86', '#e3648b'],
    ['#305f96', '#f8e45a'],
    ['#4d4036', '#9e9e9e'],
    ['#ffb300', '#f4511e'],
  ];
  const [a, b] = palettes[(index - 1) % palettes.length];
  return `<div class="sample-cover" style="background:linear-gradient(160deg, ${a}, ${b});">S${index}</div>`;
}

const series = Array.from({ length: 10 }, (_, index) => {
  const n = index + 1;
  const counts = [12, 18, 24, 32, 10, 40, 50, 22, 16, 8];
  const next = [13, 19, 25, 33, 11, 41, null, 23, 17, 9][index];
  const prices = ['¥693', null, '¥485', null, '¥772', '¥543', null, '¥693', '¥358', null];
  const discounts = [null, 10, null, 5, null, null, null, 25, 50, null];
  return {
    title: `Sample Series ${String(n).padStart(2, '0')}`,
    author: `Author ${String.fromCharCode(64 + n)}`,
    owned: `1-${counts[index]}`,
    price: prices[index],
    discount: discounts[index],
    next,
    latest: next ? next + 2 : counts[index],
    completed: next === null,
    priority: index === 1,
  };
});

function statusBadges(item) {
  const badges = [];
  if (item.completed) {
    badges.push('<span class="badge completed">Completed</span>');
    return badges.join(' ');
  }
  if (item.discount) badges.push(`<span class="badge sale">${item.discount}%OFF</span>`);
  if (item.price) badges.push(`<span class="badge price">Price: ${item.price}</span>`);
  if (item.next) badges.push(`<span class="badge next">Next: vol.${item.next}</span>`);
  if (item.latest) badges.push(`<span class="badge latest-date">Latest: vol.${item.latest}</span>`);
  return badges.join(' ');
}

function optionsRows() {
  return series.map((item, index) => `
    <article class="series ${item.priority ? 'priority ' : ''}${item.next ? 'has-next ' : ''}${item.discount ? 'on-sale ' : ''}has-thumbnail">
      ${cover(index + 1)}
      <div class="title">${escapeHtml(item.title)}</div>
      <div class="actions">
        <button type="button" class="secondary">${item.priority ? '☆ Unset priority' : '★ Set priority'}</button>
        <button type="button" class="secondary">${item.next ? '↻ Recheck' : '↻ Check next'}</button>
        <button type="button" class="secondary"${item.next ? ' disabled' : ''}>${item.completed ? '○ Unmark completed' : '✓ Mark as completed'}</button>
        <button type="button" class="secondary">Exclude</button>
        <a href="#">↗ Search Amazon</a>
      </div>
      <div class="meta">
        <span>${escapeHtml(item.author)}</span>
        <span class="badge">Owned: ${item.owned}</span>
        ${index === 2 ? '<span class="badge missing">Gap: 7, 12</span>' : ''}
        ${item.priority ? '<span class="badge priority">Priority</span>' : ''}
        <span class="next-result status-block">${statusBadges(item)}</span>
      </div>
    </article>
  `).join('');
}

function optionsHtml() {
  return `<!doctype html>
<html data-theme="dark">
<head>
<meta charset="utf-8" />
<style>
${optionsCss}
body { width: 1280px; min-height: 800px; overflow: hidden; }
.topbar { padding: 10px 14px; }
.controls { top: 45px; padding: 10px 14px; }
.list { padding: 10px 14px 48px; gap: 7px; }
.series { min-height: 76px; }
.sample-cover {
  grid-row: 1 / span 2;
  grid-column: 1;
  width: 40px;
  height: 58px;
  border-radius: 4px;
  border: 1px solid var(--line);
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 11px;
  text-shadow: 0 1px 2px rgb(0 0 0 / 45%);
}
</style>
</head>
<body>
  <header id="pageTop" class="topbar">
    <h1>Kindle Series Sale Tracker</h1>
    <div id="summary" class="summary">128 books / 10 series</div>
    <label class="theme-control"><span>Theme</span>
      <select><option>Follow system</option></select>
    </label>
    <label class="theme-control"><span>Language</span>
      <select><option>English</option></select>
    </label>
  </header>
  <section class="controls">
    <div class="toolbar-top">
      <input type="search" placeholder="Filter by series name or author" />
      <label class="select-control"><span>Sort</span>
        <select><option>Books owned (most first)</option></select>
      </label>
      <button type="button" class="secondary">↻ Recheck all series</button>
      <button type="button" class="secondary">＋ New volume check</button>
    </div>
    <div class="toolbar-filters">
      <label class="chip"><input type="checkbox" /><span> Has gaps</span></label>
      <label class="chip"><input type="checkbox" /><span> Priority only</span></label>
      <label class="select-control"><span>Next vol.</span><select><option>All</option></select></label>
      <label class="chip"><input type="checkbox" /><span> Hide completed</span></label>
      <label class="chip"><input type="checkbox" /><span> Hide excluded</span></label>
      <label class="chip"><input type="checkbox" /><span> On sale</span></label>
      <button type="button" class="secondary">× Clear query cache</button>
      <button type="button" class="secondary">× Clear scan data</button>
      <span class="summary">* Completed/priority flags are preserved.</span>
    </div>
  </section>
  <main class="list">${optionsRows()}</main>
  <a class="top-link" href="#">↑ Top</a>
</body>
</html>`;
}

function panelItems() {
  return series.slice(0, 2).map((item, index) => `
    <article class="series-item ${index === 0 ? 'priority' : ''}">
      <div class="series-title">
        <strong>${escapeHtml(item.title)}</strong>
        <div class="title-badges">
          ${index === 0 ? '<span class="badge priority-badge">Priority</span>' : ''}
          <span class="badge">${index === 0 ? '7 vols' : '2 vols'}</span>
        </div>
      </div>
      <div class="series-body">
        ${cover(index + 1)}
        <div>
          <div class="series-meta">${escapeHtml(item.author)} / <span class="badge">Owned: ${index === 0 ? '1-7' : '1'}</span></div>
          <div class="catalog-status"><span class="status-block">${index === 0
            ? '<span class="badge sale">95%OFF</span> <span class="badge price">Price: ¥33</span> <span class="badge next">Next: vol.8</span>'
            : '<span class="badge sale">76%OFF</span> <span class="badge price">Price: ¥792</span> <span class="badge next">Next: vol.2</span>'}</span></div>
        </div>
      </div>
      <div class="series-actions">
        <button type="button">Recheck</button>
        <a href="#">Search Amazon for series</a>
      </div>
    </article>
  `).join('');
}

function panelHtml() {
  return `<!doctype html>
<html data-theme="dark">
<head>
<meta charset="utf-8" />
<style>
${optionsCss}
${popupCss}
body {
  width: 1280px;
  height: 800px;
  overflow: hidden;
  background: #090704;
}
.background {
  position: absolute;
  inset: 0;
  filter: blur(4px);
  opacity: .32;
  transform: scale(1.02);
  overflow: hidden;
}
.stage {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: 450px 1fr;
  align-items: center;
}
.panel {
  align-self: start;
  margin: 14px 0 0 38px;
  width: 412px;
  max-height: 772px;
  overflow: hidden;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: var(--bg);
  box-shadow: 0 18px 45px rgb(0 0 0 / 55%);
}
.copy {
  color: #f7efe4;
  padding-left: 12px;
}
.copy h2 {
  color: #fff7ed;
  font-size: 29px;
  line-height: 1.35;
  margin: 0 0 14px;
}
.copy p {
  color: #d7c7b8;
  font-size: 16px;
  line-height: 1.8;
  max-width: 690px;
}
.copy ul {
  list-style: none;
  margin: 26px 0 0;
  padding: 0;
  display: grid;
  gap: 18px;
  color: #fff7ed;
  font-size: 17px;
}
.copy li::before {
  content: "";
  display: inline-block;
  width: 15px;
  height: 15px;
  border-radius: 999px;
  background: #f6ad55;
  margin-right: 12px;
  vertical-align: -2px;
}
.sample-cover {
  flex: 0 0 auto;
  width: 42px;
  height: 60px;
  border-radius: 4px;
  border: 1px solid var(--line);
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 11px;
  text-shadow: 0 1px 2px rgb(0 0 0 / 45%);
}
.background .sample-cover { width: 40px; height: 58px; }
</style>
</head>
<body>
  <div class="background">${optionsHtml().match(/<body>([\s\S]*)<\/body>/)[1]}</div>
  <div class="stage">
    <main class="app panel">
      <header class="header">
        <h1>Kindle Series</h1>
        <p>Sample data</p>
        <select class="lang-toggle" aria-label="Language"><option>English</option></select>
      </header>
      <section class="toolbar toolbar-scan" aria-label="Scan">
        <button type="button">Full Scan</button>
        <button type="button">Quick Update</button>
      </section>
      <section class="toolbar toolbar-nav" aria-label="Navigation">
        <button type="button">Kindle Library</button>
        <button type="button">Full Page</button>
        <button type="button">CSV</button>
        <button type="button">JSON</button>
      </section>
      <section class="toolbar toolbar-sort"><select><option>Discount first</option></select></section>
      <section class="toolbar toolbar-bulk">
        <button type="button">Recheck visible</button>
        <button type="button">New vol. check</button>
      </section>
      <p class="status">Last scan: sample data</p>
      <section>
        <h2>Series Candidates</h2>
        <div class="series-list">${panelItems()}</div>
      </section>
    </main>
    <section class="copy">
      <h2>Review next-volume candidates in the side panel</h2>
      <p>Scan your Kindle library, group owned books by series, and keep next volumes, prices, discounts, and completion cost estimates organized locally.</p>
      <ul>
        <li>Manual scan on Amazon.co.jp Kindle library pages</li>
        <li>Prices and discount rates from Amazon search results</li>
        <li>CSV and JSON export for your own records</li>
      </ul>
    </section>
  </div>
</body>
</html>`;
}

function promoHtml({ width, product }) {
  const isSmall = width === 440;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
* { box-sizing: border-box; }
body {
  margin: 0;
  width: ${width}px;
  height: 280px;
  overflow: hidden;
  background:
    radial-gradient(circle at 78% 18%, rgb(35 74 120 / 48%), transparent 34%),
    linear-gradient(135deg, #102b4f 0%, #0b1a32 66%, #081429 100%);
  color: white;
  font-family: Arial, "Segoe UI", sans-serif;
  border-top: 5px solid #d88a22;
}
.wrap {
  position: relative;
  height: 100%;
  padding: ${isSmall ? '28px 20px 18px' : '30px 34px 18px'};
}
h1 {
  margin: 0 0 16px;
  color: #f8b83f;
  font-size: ${isSmall ? 34 : 40}px;
  line-height: 1.08;
  letter-spacing: 0;
  max-width: ${isSmall ? 395 : 500}px;
}
p {
  margin: 0;
  color: #f7efe4;
  font-size: ${isSmall ? 19 : 24}px;
  line-height: 1.35;
  max-width: ${isSmall ? 380 : 480}px;
}
.meta {
  position: absolute;
  left: ${isSmall ? 20 : 34}px;
  bottom: 56px;
  color: #bcc9da;
  font-size: ${isSmall ? 15 : 19}px;
}
.books {
  position: absolute;
  left: ${isSmall ? 20 : 34}px;
  bottom: 19px;
  display: flex;
  align-items: end;
  gap: 4px;
}
.book {
  width: 20px;
  border: 1px solid rgb(255 255 255 / 28%);
  background: linear-gradient(180deg, #526b8c, #2f415f);
}
.free {
  position: absolute;
  right: ${isSmall ? 8 : 8}px;
  bottom: 8px;
  min-width: 80px;
  height: 23px;
  display: grid;
  place-items: center;
  background: #c47c1c;
  font-weight: 700;
  font-size: 12px;
}
</style>
</head>
<body>
  <div class="wrap">
    <h1>${isSmall ? 'Kindle Series<br>Sale Tracker' : 'Kindle Series Sale Tracker'}</h1>
    <p>${isSmall ? 'Track next volumes, prices and completion cost' : 'Track next volumes, prices and completion costs'}</p>
    <div class="meta">Amazon.co.jp Kindle&nbsp;&nbsp;|&nbsp;&nbsp;${product} Extension</div>
    <div class="books">
      <div class="book" style="height:60px"></div>
      <div class="book" style="height:72px"></div>
      <div class="book" style="height:52px"></div>
      <div class="book" style="height:68px"></div>
      <div class="book" style="height:60px"></div>
      <div class="book" style="height:44px"></div>
    </div>
    <div class="free">Free</div>
  </div>
</body>
</html>`;
}

async function writePage(name, html) {
  const file = path.join(tempDir, name);
  await writeFile(file, html, 'utf8');
  return file;
}

async function waitForFile(file) {
  for (let i = 0; i < 30; i += 1) {
    try {
      const handle = await readFile(file);
      if (handle.length > 10_000) return;
    } catch {
      // Retry while the browser is still writing.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Screenshot was not written: ${file}`);
}

async function screenshot(file, output, width, height) {
  await rm(output, { force: true });
  const profileDir = path.join(tempDir, `profile-${path.basename(output, '.png')}`);
  await mkdir(profileDir, { recursive: true });
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--disable-background-networking',
    '--hide-scrollbars',
    '--no-first-run',
    '--allow-file-access-from-files',
    '--force-device-scale-factor=1',
    `--user-data-dir=${profileDir}`,
    `--window-size=${width},${height}`,
    '--virtual-time-budget=1000',
    `--screenshot=${output}`,
    pathToFileURL(file).href,
  ];
  execFileSync(browserPath, args, { stdio: 'inherit' });
  await waitForFile(output);
}

try {
  const optionsPage = await writePage('options-en.html', optionsHtml());
  const panelPage = await writePage('panel-en.html', panelHtml());
  const chromePromoPage = await writePage('chrome-promo-en.html', promoHtml({ width: 440, product: 'Chrome' }));
  const firefoxBannerPage = await writePage('firefox-banner-en.html', promoHtml({ width: 560, product: 'Firefox' }));

  await screenshot(optionsPage, out.chromeOptions, 1280, 800);
  await screenshot(panelPage, out.chromePanel, 1280, 800);
  await copyFile(out.chromeOptions, out.firefoxOptions);
  await copyFile(out.chromePanel, out.firefoxPanel);
  await screenshot(chromePromoPage, out.chromePromo, 440, 280);
  await screenshot(firefoxBannerPage, out.firefoxBanner, 560, 280);

  console.log('Generated English store images:');
  Object.values(out).forEach((file) => console.log(`- ${path.relative(root, file)}`));
} finally {
  await rm(tempDir, { recursive: true, force: true }).catch(() => {});
}
