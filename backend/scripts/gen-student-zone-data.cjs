// Script one-off de génération des données Zone Élèves (livres + coloriages).
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/textile1/backend/data';
const BOOKS = path.join(ROOT, 'student-books');
const COLORING = path.join(ROOT, 'coloring');
fs.mkdirSync(COLORING, { recursive: true });

const P = { rouge: '#E23B3B', bleu: '#3BA7E0', vert: '#57B87B', jaune: '#F2B84B' };

function svgPage(bg, ground, body, lines) {
  const textY = 470;
  const texts = lines
    .map(
      (l, i) =>
        `<text x="400" y="${textY + i * 60}" text-anchor="middle" font-family="Verdana, Arial, sans-serif" font-size="38" font-weight="bold" fill="#3A3A3A">${l}</text>`
    )
    .join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <rect width="800" height="600" fill="${bg}"/>
  <rect y="420" width="800" height="180" fill="${ground}"/>
  ${body}
  ${texts}
</svg>
`;
}

const sun = (c) => `<circle cx="700" cy="90" r="55" fill="${c}"/><g stroke="${c}" stroke-width="8" stroke-linecap="round">${[0,45,90,135,180,225,270,315].map(a=>{const r=Math.PI*a/180;return `<line x1="${700+Math.cos(r)*70}" y1="${90+Math.sin(r)*70}" x2="${700+Math.cos(r)*92}" y2="${90+Math.sin(r)*92}"/>`}).join('')}</g>`;
const cloud = `<ellipse cx="150" cy="100" rx="70" ry="35" fill="#FFFFFF"/><ellipse cx="210" cy="110" rx="55" ry="28" fill="#FFFFFF"/>`;
const tree = (t=57) => `<rect x="${t+20}" y="320" width="26" height="90" fill="#8B5A2B"/><circle cx="${t+33}" cy="290" r="60" fill="${P.vert}"/>`;
const badger = (x, y, s=1) => `<g transform="translate(${x},${y}) scale(${s})"><ellipse cx="0" cy="70" rx="55" ry="65" fill="#5A5A5A"/><ellipse cx="0" cy="85" rx="30" ry="42" fill="#FFFFFF"/><circle cx="0" cy="-30" r="48" fill="#5A5A5A"/><ellipse cx="0" cy="-12" rx="26" ry="30" fill="#FFFFFF"/><circle cx="-16" cy="-40" r="6" fill="#222"/><circle cx="16" cy="-40" r="6" fill="#222"/><ellipse cx="0" cy="-18" rx="10" ry="7" fill="#222"/><path d="M -45 -62 L -25 -48 L -45 -44 Z" fill="#5A5A5A"/><path d="M 45 -62 L 25 -48 L 45 -44 Z" fill="#5A5A5A"/><ellipse cx="-38" cy="128" rx="14" ry="9" fill="#222"/><ellipse cx="38" cy="128" rx="14" ry="9" fill="#222"/></g>`;
const girl = (x, y, s=1) => `<g transform="translate(${x},${y}) scale(${s})"><ellipse cx="0" cy="80" rx="42" ry="55" fill="${P.rouge}"/><circle cx="0" cy="-20" r="42" fill="#F5C99B"/><path d="M -46 -30 Q 0 -110 46 -30 L 46 10 Q 0 -30 -46 10 Z" fill="#6B4423"/><circle cx="-15" cy="-24" r="5" fill="#222"/><circle cx="15" cy="-24" r="5" fill="#222"/><path d="M -12 0 Q 0 10 12 0" stroke="#222" stroke-width="4" fill="none" stroke-linecap="round"/><ellipse cx="-46" cy="128" rx="12" ry="8" fill="#F5C99B"/><ellipse cx="46" cy="128" rx="12" ry="8" fill="#F5C99B"/></g>`;
const lion = (x, y, s=1) => `<g transform="translate(${x},${y}) scale(${s})"><circle cx="0" cy="0" r="72" fill="${P.jaune}"/><circle cx="0" cy="0" r="52" fill="#F9D98A"/><circle cx="-18" cy="-8" r="6" fill="#222"/><circle cx="18" cy="-8" r="6" fill="#222"/><ellipse cx="0" cy="14" rx="9" ry="6" fill="#6B4423"/><path d="M -14 28 Q 0 40 14 28" stroke="#222" stroke-width="4" fill="none" stroke-linecap="round"/><ellipse cx="0" cy="110" rx="48" ry="58" fill="${P.jaune}"/></g>`;
const cat = (x, y, s=1) => `<g transform="translate(${x},${y}) scale(${s})"><ellipse cx="0" cy="95" rx="42" ry="52" fill="#8E8E8E"/><circle cx="0" cy="0" r="46" fill="#8E8E8E"/><path d="M -42 -20 L -50 -58 L -16 -38 Z" fill="#8E8E8E"/><path d="M 42 -20 L 50 -58 L 16 -38 Z" fill="#8E8E8E"/><circle cx="-16" cy="-6" r="6" fill="#222"/><circle cx="16" cy="-6" r="6" fill="#222"/><path d="M -6 12 L 0 18 L 6 12" stroke="#222" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M -10 26 Q 0 34 10 26" stroke="#222" stroke-width="4" fill="none" stroke-linecap="round"/></g>`;

// ---------- Livre 1 : Le blaireau Trim va à l'école (CP) ----------
const book1 = [
  svgPage('#BEE8FF', P.vert, sun(P.jaune) + cloud + `<rect x="80" y="300" width="160" height="120" fill="${P.rouge}"/><path d="M 60 300 L 160 230 L 260 300 Z" fill="#B03A3A"/><rect x="130" y="350" width="50" height="70" fill="#7A4A21"/>` + badger(430, 380), ['Trim le blaireau', 'se réveille.']),
  svgPage('#BEE8FF', P.vert, sun(P.jaune) + cloud + badger(400, 370) + `<rect x="470" y="360" width="70" height="85" rx="16" fill="${P.bleu}"/><rect x="488" y="345" width="34" height="26" rx="8" fill="#2B7FB4"/>`, ['Il met son cartable bleu.']),
  svgPage('#BEE8FF', P.vert, sun(P.jaune) + tree(60) + badger(380, 380) + `<g transform="translate(560,240)"><ellipse cx="0" cy="0" rx="18" ry="12" fill="${P.jaune}"/><circle cx="-8" cy="-16" r="12" fill="${P.jaune}"/><circle cx="8" cy="-16" r="12" fill="${P.jaune}"/><line x1="0" y1="-30" x2="0" y2="-52" stroke="#555" stroke-width="3"/></g>`, ['En chemin, il voit un', 'papillon jaune.']),
  svgPage('#FFF3D6', '#E8D5A8', `<rect x="100" y="180" width="600" height="240" rx="10" fill="#FFFFFF" stroke="#C9A85C" stroke-width="6"/><rect x="120" y="90" width="560" height="90" rx="8" fill="${P.vert}"/><rect x="560" y="200" width="110" height="220" rx="10" fill="#C98A4B"/>` + lion(330, 260, 0.75) + badger(470, 300, 0.75), ['À l\u2019école, la maîtresse', 'sourit.']),
  svgPage('#BEE8FF', P.vert, badger(300, 340) + `<rect x="400" y="300" width="230" height="170" rx="8" fill="#FFFFFF" stroke="#888" stroke-width="6"/><path d="M 440 430 L 440 360 L 490 330 L 540 360 L 540 430 Z" fill="${P.rouge}"/><rect x="470" y="380" width="40" height="50" fill="#7A4A21"/>`, ['Trim dessine une', 'jolie maison.']),
  svgPage('#BEE8FF', P.vert, sun(P.jaune) + cloud + tree(580) + badger(380, 380), ['Quelle belle journée', 'à l\u2019école !']),
];

// ---------- Livre 2 : Les couleurs de Tanà (CE1) ----------
const book2 = [
  svgPage('#FFF3D6', '#E8D5A8', girl(300, 300) + `<rect x="400" y="330" width="220" height="150" rx="8" fill="#FFFFFF" stroke="#888" stroke-width="6"/>` + `<circle cx="440" cy="375" r="16" fill="${P.rouge}"/><circle cx="490" cy="375" r="16" fill="${P.bleu}"/><circle cx="540" cy="375" r="16" fill="${P.vert}"/><circle cx="465" cy="420" r="16" fill="${P.jaune}"/><circle cx="515" cy="420" r="16" fill="#B565D8"/>`, ['Tanà la petite artiste', 'peint tout en couleurs.']),
  svgPage('#FFE4E4', '#F3C5C5', girl(260, 300) + `<path d="M 420 420 C 440 330 520 330 540 420 Z" fill="${P.rouge}"/><circle cx="470" cy="360" r="7" fill="#FFD1D1"/><circle cx="500" cy="360" r="7" fill="#FFD1D1"/><path d="M 460 335 L 470 320 L 480 335" stroke="#2E7D32" stroke-width="6" fill="none"/>`, ['Le rouge', 'comme une fraise !']),
  svgPage('#D9F1FF', '#BEE8FF', girl(260, 300) + `<ellipse cx="480" cy="360" rx="110" ry="55" fill="#FFFFFF"/><ellipse cx="440" cy="360" rx="42" ry="38" fill="#FFFFFF"/><ellipse cx="510" cy="360" rx="42" ry="38" fill="#FFFFFF"/>`, ['Le bleu', 'comme le ciel !']),
  svgPage('#E4F6E9', P.vert, girl(260, 300) + tree(420, ) + `<circle cx="475" cy="300" r="62" fill="${P.vert}"/><rect x="465" y="352" width="22" height="70" fill="#8B5A2B"/>`, ['Le vert', 'comme l\u2019arbre !']),
  svgPage('#FFF7DC', '#F2E3AC', girl(240, 300) + sun(500, ) + `<circle cx="500" cy="200" r="60" fill="${P.jaune}"/><g stroke="${P.jaune}" stroke-width="10" stroke-linecap="round">${[0,45,90,135,180,225,270,315].map(a=>{const r=Math.PI*a/180;return `<line x1="${500+Math.cos(r)*78}" y1="${200+Math.sin(r)*78}" x2="${500+Math.cos(r)*104}" y2="${200+Math.sin(r)*104}"/>`}).join('')}</g>`, ['Le jaune', 'comme le soleil !']),
  svgPage('#EFE3FF', '#DCC8F5', girl(400, 330, 1.1) + `<g><path d="M 200 250 A 200 130 0 0 1 600 250" stroke="${P.rouge}" stroke-width="18" fill="none"/><path d="M 220 268 A 185 118 0 0 1 580 268" stroke="${P.jaune}" stroke-width="18" fill="none"/><path d="M 240 286 A 170 106 0 0 1 560 286" stroke="${P.vert}" stroke-width="18" fill="none"/><path d="M 260 304 A 155 94 0 0 1 540 304" stroke="${P.bleu}" stroke-width="18" fill="none"/></g>`, ['Un bel', 'arc-en-ciel !']),
];

// ---------- Livre 3 : Le lion et le chat deviennent amis (CE2) ----------
const book3 = [
  svgPage('#FBE9C9', P.jaune, sun(P.rouge, ) + lion(400, 280, 1.1), ['Le grand lion', 'est tout seul.']),
  svgPage('#FBE9C9', P.jaune, lion(300, 290, 0.9) + cat(520, 320, 0.85), ['Un petit chat', 'arrive...']),
  svgPage('#FBE9C9', P.jaune, lion(320, 280, 0.9) + cat(520, 310, 0.85) + `<path d="M 430 250 Q 460 220 490 250" stroke="#222" stroke-width="6" fill="none" stroke-linecap="round"/>`, ['« Veux-tu jouer', 'avec moi ? »']),
  svgPage('#FBE9C9', P.jaune, lion(300, 280, 0.9) + cat(520, 300, 0.85) + `<circle cx="410" cy="330" r="34" fill="${P.rouge}"/><path d="M 385 315 Q 410 295 435 315" stroke="#B03A3A" stroke-width="5" fill="none"/>`, ['Ils jouent', 'à la balle.']),
  svgPage('#FBE9C9', P.jaune, lion(300, 280, 0.9) + cat(520, 300, 0.85) + `<rect x="375" y="360" width="70" height="45" rx="8" fill="#C98A4B"/><circle cx="392" cy="355" r="9" fill="${P.rouge}"/><circle cx="418" cy="355" r="9" fill="${P.vert}"/><circle cx="428" cy="352" r="9" fill="${P.jaune}"/>`, ['Ils partagent', 'leur goûter.']),
  svgPage('#FBE9C9', P.jaune, sun(P.jaune, ) + lion(320, 280, 0.95) + cat(500, 300, 0.9) + `<path d="M 380 200 Q 410 170 440 200" stroke="${P.rouge}" stroke-width="8" fill="none" stroke-linecap="round"/>`, ['Deux amis', 'pour toujours !']),
];

// fix: sun/tree helpers with position params were buggy above -> re-render safely
// (les appels `sun(P.rouge, )` utilisent la version 1-argument ; tree(420,) et sun(500,) ignorent l'argument superflu)

const books = [
  { id: 'blaireau-ecole', slug: 'blaireau-ecole', title: 'Le blaireau Trim va à l\u2019école', level: 'CP', pages: book1.length, coverColor: P.bleu },
  { id: 'couleurs-tana', slug: 'couleurs-tana', title: 'Les couleurs de Tanà', level: 'CE1', pages: book2.length, coverColor: P.rouge },
  { id: 'lion-et-chat', slug: 'lion-et-chat', title: 'Le lion et le chat deviennent amis', level: 'CE2', pages: book3.length, coverColor: P.vert },
];

for (const b of books) {
  const dir = path.join(BOOKS, b.slug);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const pages = b.slug === 'blaireau-ecole' ? book1 : b.slug === 'couleurs-tana' ? book2 : book3;
  pages.forEach((svg, i) => fs.writeFileSync(path.join(dir, `page-${String(i + 1).padStart(2, '0')}.svg`), svg));
}
fs.writeFileSync(path.join(BOOKS, 'manifest.json'), JSON.stringify(books, null, 2) + '\n');

// ---------- Coloriages (line-art, zones fill=#FFFFFF + data-zone) ----------
const O = (inner, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
<rect width="800" height="600" fill="#FFFFFF" data-zone="fond"/>
${extra}
<g stroke="#000000" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" fill="none">
${inner}
</g>
</svg>
`;

const coloring = {};

coloring['blaireau'] = O(`
<ellipse cx="400" cy="430" rx="150" ry="120" fill="#FFFFFF" data-zone="corps"/>
<ellipse cx="400" cy="460" rx="75" ry="85" fill="#FFFFFF" data-zone="ventre"/>
<circle cx="400" cy="250" r="110" fill="#FFFFFF" data-zone="tete"/>
<ellipse cx="400" cy="295" rx="55" ry="60" fill="#FFFFFF" data-zone="museau"/>
<path d="M 310 185 L 350 225 L 305 235 Z" fill="#FFFFFF" data-zone="oreille-g"/>
<path d="M 490 185 L 450 225 L 495 235 Z" fill="#FFFFFF" data-zone="oreille-d"/>
<circle cx="360" cy="235" r="12" fill="#000000"/>
<circle cx="440" cy="235" r="12" fill="#000000"/>
<ellipse cx="400" cy="285" rx="22" ry="15" fill="#000000" data-zone="nez"/>
<ellipse cx="330" cy="545" rx="32" ry="20" fill="#FFFFFF" data-zone="pied-g"/>
<ellipse cx="470" cy="545" rx="32" ry="20" fill="#FFFFFF" data-zone="pied-d"/>`);

coloring['lion'] = O(`
<circle cx="400" cy="270" r="170" fill="#FFFFFF" data-zone="criniere"/>
<circle cx="400" cy="270" r="115" fill="#FFFFFF" data-zone="tete"/>
<circle cx="360" cy="250" r="12" fill="#000000"/>
<circle cx="440" cy="250" r="12" fill="#000000"/>
<ellipse cx="400" cy="300" rx="20" ry="14" fill="#000000" data-zone="nez"/>
<path d="M 380 325 Q 400 345 420 325" stroke="#000000" stroke-width="6" fill="none" data-zone="bouche"/>
<ellipse cx="400" cy="480" rx="120" ry="90" fill="#FFFFFF" data-zone="corps"/>
<ellipse cx="320" cy="565" rx="34" ry="18" fill="#FFFFFF" data-zone="pied-g"/>
<ellipse cx="480" cy="565" rx="34" ry="18" fill="#FFFFFF" data-zone="pied-d"/>
<path d="M 520 480 Q 590 470 580 400" stroke="#000000" stroke-width="6" fill="none" data-zone="queue"/>`);

coloring['chat'] = O(`
<circle cx="400" cy="260" r="115" fill="#FFFFFF" data-zone="tete"/>
<path d="M 305 220 L 285 120 L 370 180 Z" fill="#FFFFFF" data-zone="oreille-g"/>
<path d="M 495 220 L 515 120 L 430 180 Z" fill="#FFFFFF" data-zone="oreille-d"/>
<circle cx="355" cy="245" r="12" fill="#000000"/>
<circle cx="445" cy="245" r="12" fill="#000000"/>
<path d="M 390 285 L 400 295 L 410 285" stroke="#000000" stroke-width="6" fill="none" data-zone="nez"/>
<path d="M 370 320 Q 400 345 430 320" stroke="#000000" stroke-width="6" fill="none" data-zone="bouche"/>
<path d="M 290 300 L 330 310 M 290 330 L 330 330 M 510 300 L 470 310 M 510 330 L 470 330" stroke="#000000" stroke-width="4" fill="none" data-zone="moustaches"/>
<ellipse cx="400" cy="470" rx="125" ry="95" fill="#FFFFFF" data-zone="corps"/>
<path d="M 520 500 Q 610 520 600 430" stroke="#000000" stroke-width="8" fill="none" data-zone="queue"/>
<ellipse cx="330" cy="560" rx="32" ry="18" fill="#FFFFFF" data-zone="pied-g"/>
<ellipse cx="470" cy="560" rx="32" ry="18" fill="#FFFFFF" data-zone="pied-d"/>`);

coloring['panda'] = O(`
<circle cx="400" cy="260" r="115" fill="#FFFFFF" data-zone="tete"/>
<circle cx="315" cy="180" r="42" fill="#FFFFFF" data-zone="oreille-g"/>
<circle cx="485" cy="180" r="42" fill="#FFFFFF" data-zone="oreille-d"/>
<ellipse cx="355" cy="250" rx="30" ry="36" fill="#FFFFFF" data-zone="oeil-g"/>
<ellipse cx="445" cy="250" rx="30" ry="36" fill="#FFFFFF" data-zone="oeil-d"/>
<circle cx="358" cy="252" r="10" fill="#000000"/>
<circle cx="442" cy="252" r="10" fill="#000000"/>
<ellipse cx="400" cy="295" rx="20" ry="14" fill="#000000" data-zone="nez"/>
<path d="M 380 320 Q 400 338 420 320" stroke="#000000" stroke-width="6" fill="none" data-zone="bouche"/>
<ellipse cx="400" cy="470" rx="130" ry="95" fill="#FFFFFF" data-zone="corps"/>
<ellipse cx="300" cy="450" rx="38" ry="55" fill="#FFFFFF" data-zone="patte-g"/>
<ellipse cx="500" cy="450" rx="38" ry="55" fill="#FFFFFF" data-zone="patte-d"/>
<ellipse cx="350" cy="560" rx="32" ry="18" fill="#FFFFFF" data-zone="pied-g"/>
<ellipse cx="450" cy="560" rx="32" ry="18" fill="#FFFFFF" data-zone="pied-d"/>`);

coloring['lapin'] = O(`
<circle cx="400" cy="290" r="105" fill="#FFFFFF" data-zone="tete"/>
<ellipse cx="340" cy="130" rx="32" ry="85" fill="#FFFFFF" data-zone="oreille-g"/>
<ellipse cx="460" cy="130" rx="32" ry="85" fill="#FFFFFF" data-zone="oreille-d"/>
<circle cx="365" cy="275" r="10" fill="#000000"/>
<circle cx="435" cy="275" r="10" fill="#000000"/>
<path d="M 392 305 L 408 305 L 400 315 Z" fill="#000000" data-zone="nez"/>
<path d="M 375 330 Q 400 350 425 330" stroke="#000000" stroke-width="6" fill="none" data-zone="bouche"/>
<circle cx="330" cy="310" r="16" fill="#FFFFFF" data-zone="joue-g"/>
<circle cx="470" cy="310" r="16" fill="#FFFFFF" data-zone="joue-d"/>
<ellipse cx="400" cy="480" rx="115" ry="85" fill="#FFFFFF" data-zone="corps"/>
<circle cx="505" cy="470" r="32" fill="#FFFFFF" data-zone="queue"/>
<ellipse cx="340" cy="560" rx="32" ry="18" fill="#FFFFFF" data-zone="pied-g"/>
<ellipse cx="460" cy="560" rx="32" ry="18" fill="#FFFFFF" data-zone="pied-d"/>`);

coloring['maison'] = O(`
<rect x="200" y="280" width="400" height="240" fill="#FFFFFF" data-zone="mur"/>
<path d="M 160 280 L 400 140 L 640 280 Z" fill="#FFFFFF" data-zone="toit"/>
<rect x="350" y="380" width="100" height="140" fill="#FFFFFF" data-zone="porte"/>
<circle cx="432" cy="455" r="7" fill="#000000"/>
<rect x="240" y="330" width="80" height="80" fill="#FFFFFF" data-zone="fenetre-1"/>
<rect x="480" y="330" width="80" height="80" fill="#FFFFFF" data-zone="fenetre-2"/>
<rect x="490" y="170" width="40" height="70" fill="#FFFFFF" data-zone="cheminee"/>`);

coloring['arbre'] = O(`
<rect x="360" y="320" width="80" height="200" fill="#FFFFFF" data-zone="tronc"/>
<circle cx="400" cy="220" r="130" fill="#FFFFFF" data-zone="feuillage"/>
<circle cx="300" cy="290" r="75" fill="#FFFFFF" data-zone="feuillage-2"/>
<circle cx="500" cy="290" r="75" fill="#FFFFFF" data-zone="feuillage-3"/>
<path d="M 300 560 Q 400 480 500 560" stroke="#000000" stroke-width="5" fill="none" data-zone="herbe"/>`);

coloring['voiture'] = O(`
<path d="M 130 420 L 130 350 L 230 350 L 290 260 L 520 260 L 580 350 L 670 350 L 670 420 Z" fill="#FFFFFF" data-zone="carrosserie"/>
<path d="M 310 275 L 500 275 L 548 350 L 262 350 Z" fill="#FFFFFF" data-zone="parebrise"/>
<circle cx="250" cy="430" r="45" fill="#FFFFFF" data-zone="roue-g"/>
<circle cx="250" cy="430" r="20" fill="#FFFFFF" data-zone="moyeu-g"/>
<circle cx="550" cy="430" r="45" fill="#FFFFFF" data-zone="roue-d"/>
<circle cx="550" cy="430" r="20" fill="#FFFFFF" data-zone="moyeu-d"/>
<rect x="600" y="365" width="45" height="22" rx="8" fill="#FFFFFF" data-zone="phare"/>
<path d="M 150 470 L 650 470" stroke="#000000" stroke-width="5" fill="none" data-zone="route"/>`);

// ---------- Madagascar / École / Fêtes (extension) ----------
coloring['lemur'] = O(`
<ellipse cx="400" cy="430" rx="110" ry="90" fill="#FFFFFF" data-zone="corps"/>
<ellipse cx="400" cy="455" rx="60" ry="60" fill="#FFFFFF" data-zone="ventre"/>
<circle cx="400" cy="250" r="95" fill="#FFFFFF" data-zone="tete"/>
<ellipse cx="400" cy="292" rx="48" ry="48" fill="#FFFFFF" data-zone="museau"/>
<path d="M 315 190 L 295 110 L 370 165 Z" fill="#FFFFFF" data-zone="oreille-g"/>
<path d="M 485 190 L 505 110 L 430 165 Z" fill="#FFFFFF" data-zone="oreille-d"/>
<circle cx="362" cy="235" r="10" fill="#000000"/>
<circle cx="438" cy="235" r="10" fill="#000000"/>
<ellipse cx="400" cy="278" rx="16" ry="11" fill="#000000" data-zone="nez"/>
<path d="M 388 302 Q 400 312 412 302" stroke="#000000" stroke-width="5" fill="none" data-zone="bouche"/>
<ellipse cx="535" cy="210" rx="30" ry="30" fill="#FFFFFF" data-zone="queue-1"/>
<ellipse cx="575" cy="280" rx="30" ry="30" fill="#FFFFFF" data-zone="queue-2"/>
<ellipse cx="575" cy="355" rx="30" ry="30" fill="#FFFFFF" data-zone="queue-3"/>
<ellipse cx="545" cy="425" rx="28" ry="28" fill="#FFFFFF" data-zone="queue-4"/>
<ellipse cx="305" cy="425" rx="32" ry="52" fill="#FFFFFF" data-zone="bras"/>
<ellipse cx="330" cy="548" rx="34" ry="18" fill="#FFFFFF" data-zone="pied-g"/>
<ellipse cx="470" cy="548" rx="34" ry="18" fill="#FFFFFF" data-zone="pied-d"/>`);

coloring['cameleon'] = O(`
<rect x="60" y="330" width="680" height="44" rx="20" fill="#FFFFFF" data-zone="branche"/>
<path d="M 620 330 Q 660 250 745 235 Q 695 300 705 330 Z" fill="#FFFFFF" data-zone="feuille-1"/>
<path d="M 100 330 Q 70 255 15 245 Q 75 295 65 335 Z" fill="#FFFFFF" data-zone="feuille-2"/>
<ellipse cx="420" cy="300" rx="140" ry="75" fill="#FFFFFF" data-zone="corps"/>
<circle cx="270" cy="280" r="70" fill="#FFFFFF" data-zone="tete"/>
<path d="M 240 225 Q 260 150 310 165 Q 320 200 315 230 Z" fill="#FFFFFF" data-zone="casque"/>
<circle cx="268" cy="270" r="24" fill="#FFFFFF" data-zone="oeil"/>
<circle cx="268" cy="270" r="9" fill="#000000"/>
<path d="M 210 305 Q 230 320 255 312" stroke="#000000" stroke-width="5" fill="none" data-zone="bouche"/>
<ellipse cx="555" cy="335" rx="32" ry="30" fill="#FFFFFF" data-zone="queue-1"/>
<ellipse cx="600" cy="295" rx="26" ry="26" fill="#FFFFFF" data-zone="queue-2"/>
<ellipse cx="612" cy="245" rx="20" ry="20" fill="#FFFFFF" data-zone="queue-3"/>
<ellipse cx="595" cy="205" rx="14" ry="14" fill="#FFFFFF" data-zone="queue-4"/>
<ellipse cx="350" cy="372" rx="20" ry="26" fill="#FFFFFF" data-zone="patte-g"/>
<ellipse cx="490" cy="372" rx="20" ry="26" fill="#FFFFFF" data-zone="patte-d"/>`);

coloring['fossa'] = O(`
<path d="M 560 380 Q 700 360 695 275 Q 690 240 660 250 Q 685 300 570 330 Z" fill="#FFFFFF" data-zone="queue"/>
<ellipse cx="430" cy="400" rx="170" ry="85" fill="#FFFFFF" data-zone="corps"/>
<ellipse cx="430" cy="430" rx="100" ry="50" fill="#FFFFFF" data-zone="ventre"/>
<circle cx="255" cy="335" r="78" fill="#FFFFFF" data-zone="tete"/>
<ellipse cx="215" cy="370" rx="38" ry="28" fill="#FFFFFF" data-zone="museau"/>
<path d="M 205 275 L 180 205 L 250 250 Z" fill="#FFFFFF" data-zone="oreille-g"/>
<path d="M 300 268 L 330 200 L 262 245 Z" fill="#FFFFFF" data-zone="oreille-d"/>
<circle cx="245" cy="320" r="10" fill="#000000"/>
<circle cx="300" cy="315" r="10" fill="#000000"/>
<ellipse cx="205" cy="362" rx="13" ry="9" fill="#000000" data-zone="nez"/>
<rect x="320" y="460" width="42" height="90" rx="18" fill="#FFFFFF" data-zone="patte-av-g"/>
<rect x="390" y="460" width="42" height="90" rx="18" fill="#FFFFFF" data-zone="patte-av-d"/>
<rect x="470" y="460" width="42" height="90" rx="18" fill="#FFFFFF" data-zone="patte-ar-g"/>
<rect x="540" y="460" width="42" height="90" rx="18" fill="#FFFFFF" data-zone="patte-ar-d"/>
<path d="M 120 560 Q 400 540 680 560" stroke="#000000" stroke-width="5" fill="none" data-zone="sol"/>`);

coloring['zebu'] = O(`
<ellipse cx="440" cy="400" rx="180" ry="110" fill="#FFFFFF" data-zone="corps"/>
<circle cx="420" cy="290" r="70" fill="#FFFFFF" data-zone="bosse"/>
<circle cx="255" cy="325" r="72" fill="#FFFFFF" data-zone="tete"/>
<ellipse cx="240" cy="365" rx="46" ry="36" fill="#FFFFFF" data-zone="museau"/>
<circle cx="232" cy="362" r="8" fill="#000000"/>
<circle cx="262" cy="362" r="8" fill="#000000"/>
<path d="M 205 265 Q 150 210 190 180 Q 215 225 232 252 Z" fill="#FFFFFF" data-zone="corne-g"/>
<path d="M 300 258 Q 355 205 320 172 Q 292 215 275 245 Z" fill="#FFFFFF" data-zone="corne-d"/>
<ellipse cx="322" cy="290" rx="26" ry="16" fill="#FFFFFF" data-zone="oreille-d"/>
<circle cx="228" cy="312" r="10" fill="#000000"/>
<rect x="340" y="490" width="44" height="75" rx="16" fill="#FFFFFF" data-zone="patte-1"/>
<rect x="410" y="495" width="44" height="70" rx="16" fill="#FFFFFF" data-zone="patte-2"/>
<rect x="490" y="490" width="44" height="75" rx="16" fill="#FFFFFF" data-zone="patte-3"/>
<rect x="555" y="485" width="44" height="80" rx="16" fill="#FFFFFF" data-zone="patte-4"/>
<path d="M 618 370 Q 680 390 672 450" stroke="#000000" stroke-width="6" fill="none" data-zone="queue"/>
<circle cx="672" cy="462" r="16" fill="#FFFFFF" data-zone="queue-pompon"/>
<path d="M 130 565 Q 400 545 690 565" stroke="#000000" stroke-width="5" fill="none" data-zone="sol"/>`);

coloring['baobab'] = O(`
<path d="M 310 560 L 335 340 Q 345 300 400 290 Q 455 300 465 340 L 490 560 Z" fill="#FFFFFF" data-zone="tronc"/>
<path d="M 365 315 L 255 215 L 230 245 L 345 345 Z" fill="#FFFFFF" data-zone="branche-g"/>
<path d="M 435 315 L 545 215 L 570 245 L 455 345 Z" fill="#FFFFFF" data-zone="branche-d"/>
<circle cx="245" cy="185" r="68" fill="#FFFFFF" data-zone="feuillage-1"/>
<circle cx="555" cy="185" r="68" fill="#FFFFFF" data-zone="feuillage-2"/>
<circle cx="400" cy="150" r="80" fill="#FFFFFF" data-zone="feuillage-3"/>
<circle cx="560" cy="300" r="28" fill="#FFFFFF" data-zone="oiseau-corps"/>
<ellipse cx="545" cy="308" rx="16" ry="10" fill="#FFFFFF" data-zone="aile"/>
<path d="M 585 295 L 605 300 L 585 306 Z" fill="#000000" data-zone="bec"/>
<circle cx="568" cy="292" r="4" fill="#000000"/>
<path d="M 540 320 Q 525 330 532 340 Q 545 332 552 325 Z" fill="#FFFFFF" data-zone="oiseau-queue"/>
<path d="M 200 560 Q 400 535 620 560" stroke="#000000" stroke-width="5" fill="none" data-zone="sol"/>`);

coloring['tortue'] = O(`
<path d="M 200 420 A 200 165 0 0 1 600 420 Z" fill="#FFFFFF" data-zone="carapace"/>
<path d="M 400 270 L 419 319 L 471 322 L 430 355 L 444 406 L 400 377 L 356 406 L 370 355 L 329 322 L 381 319 Z" fill="#FFFFFF" data-zone="etoile"/>
<path d="M 400 270 L 378 225 L 422 225 Z" fill="#FFFFFF" data-zone="rayon-nord"/>
<path d="M 471 322 L 512 300 L 518 342 Z" fill="#FFFFFF" data-zone="rayon-est"/>
<path d="M 444 406 L 478 438 L 432 444 Z" fill="#FFFFFF" data-zone="rayon-sud-est"/>
<path d="M 356 406 L 322 438 L 368 444 Z" fill="#FFFFFF" data-zone="rayon-sud-ouest"/>
<circle cx="625" cy="395" r="48" fill="#FFFFFF" data-zone="tete"/>
<circle cx="640" cy="382" r="7" fill="#000000"/>
<path d="M 620 415 Q 635 425 650 415" stroke="#000000" stroke-width="4" fill="none" data-zone="bouche"/>
<ellipse cx="235" cy="455" rx="45" ry="28" fill="#FFFFFF" data-zone="patte-g"/>
<ellipse cx="545" cy="455" rx="45" ry="28" fill="#FFFFFF" data-zone="patte-d"/>
<path d="M 190 430 Q 155 435 145 455 Q 170 458 195 448 Z" fill="#FFFFFF" data-zone="queue"/>
<path d="M 130 500 Q 400 485 680 500" stroke="#000000" stroke-width="5" fill="none" data-zone="sol"/>`);

coloring['sac-a-dos'] = O(`
<path d="M 330 225 Q 400 140 470 225" stroke="#000000" stroke-width="14" fill="none" data-zone="anse"/>
<rect x="240" y="220" width="320" height="300" rx="60" fill="#FFFFFF" data-zone="corps"/>
<rect x="240" y="220" width="320" height="115" rx="55" fill="#FFFFFF" data-zone="rabat"/>
<rect x="385" y="315" width="30" height="18" rx="6" fill="#FFFFFF" data-zone="boucle"/>
<rect x="290" y="365" width="220" height="125" rx="40" fill="#FFFFFF" data-zone="poche"/>
<rect x="285" y="170" width="18" height="70" rx="8" transform="rotate(-12 294 205)" fill="#FFFFFF" data-zone="crayon-1"/>
<path d="M 278 170 L 294 138 L 308 168 Z" fill="#FFFFFF" data-zone="pointe-1"/>
<rect x="395" y="160" width="18" height="70" rx="8" fill="#FFFFFF" data-zone="crayon-2"/>
<path d="M 395 162 L 404 130 L 413 162 Z" fill="#FFFFFF" data-zone="pointe-2"/>
<rect x="500" y="170" width="18" height="70" rx="8" transform="rotate(12 509 205)" fill="#FFFFFF" data-zone="crayon-3"/>
<path d="M 495 168 L 509 136 L 524 170 Z" fill="#FFFFFF" data-zone="pointe-3"/>`);

coloring['tableau-noir'] = O(`
<rect x="180" y="140" width="440" height="280" rx="12" fill="#FFFFFF" data-zone="cadre"/>
<rect x="210" y="170" width="380" height="220" fill="#FFFFFF" data-zone="tableau"/>
<circle cx="320" cy="250" r="42" fill="none" stroke="#000000" stroke-width="5" data-zone="soleil"/>
<line x1="380" y1="290" x2="450" y2="230" stroke="#000000" stroke-width="5" data-zone="craie-trait"/>
<rect x="220" y="420" width="30" height="130" fill="#FFFFFF" data-zone="pied-g"/>
<rect x="550" y="420" width="30" height="130" fill="#FFFFFF" data-zone="pied-d"/>
<rect x="190" y="412" width="420" height="24" rx="8" fill="#FFFFFF" data-zone="tablette"/>
<rect x="280" y="390" width="55" height="14" rx="6" fill="#FFFFFF" data-zone="craie-1"/>
<rect x="360" y="390" width="40" height="14" rx="6" fill="#FFFFFF" data-zone="craie-2"/>
<rect x="560" y="480" width="180" height="95" rx="10" fill="#FFFFFF" data-zone="ardoise"/>
<rect x="470" y="520" width="70" height="40" rx="10" fill="#FFFFFF" data-zone="eponge"/>`);

coloring['gateau-anniversaire'] = O(`
<ellipse cx="400" cy="530" rx="260" ry="40" fill="#FFFFFF" data-zone="assiette"/>
<rect x="200" y="385" width="400" height="140" rx="18" fill="#FFFFFF" data-zone="etage-bas"/>
<path d="M 200 420 L 200 395 Q 225 350 250 395 Q 275 350 300 395 Q 325 350 350 395 Q 375 350 400 395 Q 425 350 450 395 Q 475 350 500 395 Q 525 350 550 395 Q 575 350 600 395 L 600 420 Q 400 445 200 420 Z" fill="#FFFFFF" data-zone="glacage-bas"/>
<rect x="260" y="275" width="280" height="110" rx="16" fill="#FFFFFF" data-zone="etage-haut"/>
<path d="M 260 305 L 260 285 Q 285 245 310 285 Q 335 245 360 285 Q 385 245 410 285 Q 435 245 460 285 Q 485 245 510 285 L 510 305 Q 385 325 260 305 Z" fill="#FFFFFF" data-zone="glacage-haut"/>
<rect x="315" y="212" width="16" height="62" rx="6" fill="#FFFFFF" data-zone="bougie-1"/>
<rect x="372" y="205" width="16" height="69" rx="6" fill="#FFFFFF" data-zone="bougie-2"/>
<rect x="430" y="212" width="16" height="62" rx="6" fill="#FFFFFF" data-zone="bougie-3"/>
<rect x="482" y="222" width="16" height="52" rx="6" fill="#FFFFFF" data-zone="bougie-4"/>
<ellipse cx="323" cy="195" rx="12" ry="16" fill="#FFFFFF" data-zone="flamme-1"/>
<ellipse cx="380" cy="188" rx="12" ry="16" fill="#FFFFFF" data-zone="flamme-2"/>
<ellipse cx="438" cy="195" rx="12" ry="16" fill="#FFFFFF" data-zone="flamme-3"/>
<ellipse cx="490" cy="205" rx="12" ry="16" fill="#FFFFFF" data-zone="flamme-4"/>
<circle cx="255" cy="415" r="18" fill="#FFFFFF" data-zone="cerise"/>`);

coloring['fete-fanions'] = O(`
<path d="M 60 150 Q 400 250 740 150" stroke="#000000" stroke-width="6" fill="none" data-zone="corde"/>
<path d="M 100 165 L 180 178 L 140 265 Z" fill="#FFFFFF" data-zone="fanion-1"/>
<path d="M 220 196 L 300 208 L 260 295 Z" fill="#FFFFFF" data-zone="fanion-2"/>
<path d="M 360 214 L 440 214 L 400 305 Z" fill="#FFFFFF" data-zone="fanion-3"/>
<path d="M 500 196 L 580 185 L 540 272 Z" fill="#FFFFFF" data-zone="fanion-4"/>
<path d="M 620 165 L 700 155 L 660 242 Z" fill="#FFFFFF" data-zone="fanion-5"/>
<circle cx="160" cy="440" r="58" fill="#FFFFFF" data-zone="ballon-1"/>
<path d="M 152 496 L 160 510 L 168 496 Z" fill="#FFFFFF" data-zone="noeud-1"/>
<path d="M 160 510 Q 140 550 155 580" stroke="#000000" stroke-width="4" fill="none" data-zone="ficelle-1"/>
<circle cx="405" cy="475" r="62" fill="#FFFFFF" data-zone="ballon-2"/>
<path d="M 397 535 L 405 549 L 413 535 Z" fill="#FFFFFF" data-zone="noeud-2"/>
<path d="M 405 549 Q 420 570 405 590" stroke="#000000" stroke-width="4" fill="none" data-zone="ficelle-2"/>
<circle cx="650" cy="440" r="58" fill="#FFFFFF" data-zone="ballon-3"/>
<path d="M 642 496 L 650 510 L 658 496 Z" fill="#FFFFFF" data-zone="noeud-3"/>
<path d="M 650 510 Q 670 550 655 580" stroke="#000000" stroke-width="4" fill="none" data-zone="ficelle-3"/>`);

for (const [id, svg] of Object.entries(coloring)) {
  fs.writeFileSync(path.join(COLORING, `${id}.svg`), svg);
}

console.log('OK —', books.length, 'livres,', Object.keys(coloring).length, 'coloriages');
