// build.js — assemble a doc template into ONE self-contained HTML file.
// Inlines fonts.css at {{FONTS}}, and any flowN.svg (next to the template) at {{SVGn}}.
//
//   node build.js <template.html> <out.html> [out2.html ...]
//
// Writing the same output to two paths is handy: one to publish as an Artifact,
// one saved into docs/handover for Ctrl+P -> Save as PDF.
const fs = require('fs');
const path = require('path');

const [tpl, ...outs] = process.argv.slice(2);
if (!tpl) { console.error('usage: node build.js <template.html> <out.html> [more...]'); process.exit(1); }

const kit = __dirname;
let html = fs.readFileSync(tpl, 'utf8');
html = html.replace('{{FONTS}}', () => fs.readFileSync(path.join(kit, 'fonts.css'), 'utf8'));

// optional: inline Mermaid SVGs named flow1.svg..flow20.svg sitting next to the template
for (let n = 1; n <= 20; n++) {
  const marker = `{{SVG${n}}}`;
  if (!html.includes(marker)) continue;
  const p = path.join(path.dirname(path.resolve(tpl)), `flow${n}.svg`);
  if (!fs.existsSync(p)) throw new Error(`template needs ${marker} but ${p} is missing`);
  const svg = fs.readFileSync(p, 'utf8').replace(/<\?xml[^>]*\?>/i, '').replace(/<!DOCTYPE[^>]*>/i, '').trim();
  html = html.replace(marker, () => svg);
}

if (/\{\{(FONTS|SVG)/.test(html)) throw new Error('unreplaced placeholder remains');

const targets = outs.length ? outs : [tpl.replace(/\.html$/, '.out.html')];
for (const o of targets) { fs.writeFileSync(o, html); console.log('wrote', o, Math.round(html.length / 1024) + 'KB'); }
