// Fetch Google Fonts CSS, inline every woff2 as a data: URI -> self-contained fonts.css
const fs = require('fs');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const CSS_URL = 'https://fonts.googleapis.com/css2?family=Anuphan:wght@400;500;600&family=Trirong:wght@600;700&family=IBM+Plex+Mono:wght@500&display=swap';

(async () => {
  const res = await fetch(CSS_URL, { headers: { 'User-Agent': UA } });
  let css = await res.text();
  const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/g)].map(m => m[1]))];
  console.log('woff2 files:', urls.length);
  let total = 0;
  for (const u of urls) {
    const b = Buffer.from(await (await fetch(u, { headers: { 'User-Agent': UA } })).arrayBuffer());
    total += b.length;
    const data = `data:font/woff2;base64,${b.toString('base64')}`;
    css = css.split(u).join(data);
  }
  fs.writeFileSync('fonts.css', css);
  console.log('raw woff2 bytes:', total, '| fonts.css bytes:', css.length);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
