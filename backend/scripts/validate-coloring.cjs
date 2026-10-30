const fs = require('fs');
const d = 'D:/textile1/backend/data/coloring';
const files = fs.readdirSync(d).filter((f) => f.endsWith('.svg'));
console.log('COUNT', files.length);
let ok = true;
for (const f of files) {
  const s = fs.readFileSync(d + '/' + f, 'utf8');
  const zones = [...s.matchAll(/data-zone="([^"]+)"/g)].map((m) => m[1]);
  const dup = zones.filter((z, i) => zones.indexOf(z) !== i);
  const openPaths = (s.match(/<path\b[^>]*[^/]>/g) || []).length;
  const closePaths = (s.match(/<\/path>/g) || []).length;
  const openRects = (s.match(/<rect\b[^>]*[^/]>/g) || []).length;
  const closeRects = (s.match(/<\/rect>/g) || []).length;
  const svgOpen = (s.match(/<svg\b[^>]*[^/]>/g) || []).length;
  const svgClose = (s.match(/<\/svg>/g) || []).length;
  const balanced = openPaths - closePaths === 0 && openRects - closeRects === 0 && svgOpen === svgClose;
  console.log(f, 'zones=' + zones.length, 'dups=' + dup.join(','), 'balanced=' + balanced);
  if (dup.length || !balanced) ok = false;
}
console.log('VALID', ok);
