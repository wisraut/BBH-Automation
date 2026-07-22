// verify-pdf.js — render a local HTML file to PDF exactly like Ctrl+P does, so
// you can SEE the print output BEFORE publishing. This step is mandatory for any
// doc meant to be printed: it catches blank pages, orphaned callouts, cut
// content, and font fallbacks that you cannot see on screen.
//
//   node verify-pdf.js <file.html> [outStem]
//
// Produces <outStem>.pdf. Then render pages to PNG with pymupdf and look at them:
//   python -c "import fitz; d=fitz.open('out.pdf'); [d[i].get_pixmap(dpi=95).save(f'pg_{i+1}.png') for i in range(d.page_count)]; print(d.page_count,'pages')"
// A quick blank-page check (ASCII only — Windows stdout chokes on Thai):
//   python -c "import fitz; d=fitz.open('out.pdf'); [print('p%d %d'%(i+1,len(d[i].get_text().strip()))) for i in range(d.page_count)]"
//   (any page < ~120 chars is near-blank => fix the print CSS)
const fs = require('fs'), os = require('os'), path = require('path');

function findChrome() {
  const base = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
  for (const d of fs.existsSync(base) ? fs.readdirSync(base) : []) {
    for (const exe of ['chrome-win64/chrome.exe', 'chrome-linux64/chrome', 'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing']) {
      const p = path.join(base, d, exe);
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error('Chrome for Testing not found under ~/.cache/puppeteer/chrome. Trigger a download with:\n  npx -y -p @mermaid-js/mermaid-cli mmdc --version');
}
function findPuppeteer() {
  const base = path.join(os.homedir(), 'AppData', 'Local', 'npm-cache', '_npx');
  for (const d of fs.existsSync(base) ? fs.readdirSync(base) : []) {
    const p = path.join(base, d, 'node_modules', 'puppeteer-core');
    if (fs.existsSync(p)) return require(p);
  }
  try { return require('puppeteer-core'); } catch {}
  throw new Error('puppeteer-core not found. It ships with mermaid-cli; run any mmdc command once, or `npm i puppeteer-core`.');
}

const file = process.argv[2];
const stem = process.argv[3] || 'verify';
if (!file) { console.error('usage: node verify-pdf.js <file.html> [outStem]'); process.exit(1); }
const url = 'file:///' + path.resolve(file).replace(/\\/g, '/');

(async () => {
  const puppeteer = findPuppeteer();
  const b = await puppeteer.launch({ executablePath: findChrome(), headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-zygote'] });
  const p = await b.newPage();
  await p.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1200));           // let inlined webfonts settle
  await p.pdf({ path: stem + '.pdf', printBackground: true, preferCSSPageSize: true });
  await b.close();
  console.log('wrote', stem + '.pdf', '- now render pages to PNG (see header comment) and eyeball them');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
