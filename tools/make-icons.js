// 產生手機桌面圖示（Echo Island 回音島）。圖示裡的小怪獸用 App 裡的 monster()，字型是渾圓的 Baloo 2／Fredoka（Google Fonts）。
// 用法：node tools/make-icons.js            → 用目前選定的款式（CHOSEN）產生 icon-512.png、icon-192.png、apple-touch-icon.png、favicon-32.png
//       node tools/make-icons.js --preview  → 所有款式並排存到 tests/output/icon-options.png，方便挑選
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { start, ROOT } = require('../tests/server');
const CHOSEN = process.env.ICON || 'a';
const PREVIEW = process.argv.includes('--preview');

// 每一款是在網頁裡執行的函式，回傳 512×512 的 SVG（可以用 monster()）
const DESIGNS = {
  // A 回音泡泡：啵啵在小島上喊 Hi!，聲音一圈圈傳出去，Hi! 越來越小（回音）
  a: () => {
    const L = '#4a3434', mon = monster('bobo', 'cheer', 290).replace('<svg ', '<svg x="10" y="190" ');
    const hi = (x, y, s, o) => `<g transform="translate(${x} ${y}) scale(${s})" opacity="${o}"><rect x="-74" y="-52" width="148" height="96" rx="48" fill="#fff" stroke="${L}" stroke-width="9"/><text x="0" y="22" text-anchor="middle" font-family="'Baloo 2'" font-weight="800" font-size="66" fill="#ff6f9c" stroke="${L}" stroke-width="7" paint-order="stroke" stroke-linejoin="round">Hi!</text></g>`;
    return `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9f2"/><stop offset=".55" stop-color="#d9f1ff"/><stop offset="1" stop-color="#a6dcff"/></linearGradient></defs>
      <rect width="512" height="512" fill="url(#sky)"/>
      ${[70, 120, 170].map((r, i) => `<path d="M ${300 - r * .2} ${250 - r} A ${r} ${r} 0 0 1 ${300 + r * .9} ${250 + r * .1}" fill="none" stroke="#9fd2ff" stroke-width="10" stroke-linecap="round" opacity="${.9 - i * .25}"/>`).join('')}
      ${hi(330, 120, 1, 1)}${hi(420, 230, .7, .75)}${hi(462, 316, .48, .5)}
      <path d="M0 418 Q64 400 128 418 T256 418 T384 418 T512 418 V512 H0 Z" fill="#7cc8f2"/><path d="M0 452 Q64 436 128 452 T256 452 T384 452 T512 452 V512 H0 Z" fill="#5ab4ea"/>
      <ellipse cx="160" cy="452" rx="150" ry="34" fill="#ffe2a6" stroke="${L}" stroke-width="8"/>
      ${mon}`;
  },
  // B 貝殼回音：沙灘上一個大貝殼，彩色聲波從貝殼傳出來，嘟嘟把耳朵靠在貝殼上聽
  b: () => {
    const L = '#4a3434', mon = monster('dudu', 'happy', 240).replace('<svg ', '<svg x="262" y="214" ');
    const rib = [-60, -36, -12, 12, 36, 60].map(a => { const r = a * Math.PI / 180; return `M200 372 L${(200 + Math.sin(r) * 150).toFixed(0)} ${(372 - Math.cos(r) * 170).toFixed(0)}`; }).join(' ');
    return `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4d9"/><stop offset="1" stop-color="#ffe0ec"/></linearGradient>
        <radialGradient id="shell" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#fff3f7"/><stop offset=".55" stop-color="#ffb3cf"/><stop offset="1" stop-color="#e77aa2"/></radialGradient>
        <clipPath id="sc"><path d="M58 330 Q50 190 200 168 Q350 190 342 330 Q200 400 58 330 Z"/></clipPath></defs>
      <rect width="512" height="512" fill="url(#sky)"/>
      <path d="M0 410 Q128 388 256 410 T512 410 V512 H0 Z" fill="#ffe2a6"/>
      ${[[0, '#ff6f9c'], [1, '#ffb52e'], [2, '#3fbfa8']].map(([i, c]) => `<path d="M ${150 - i * 20} ${130 - i * 34} Q 200 ${96 - i * 40} ${250 + i * 20} ${130 - i * 34}" fill="none" stroke="${c}" stroke-width="14" stroke-linecap="round"/>`).join('')}
      <path d="M58 330 Q50 190 200 168 Q350 190 342 330 Q200 400 58 330 Z" fill="url(#shell)" stroke="${L}" stroke-width="10" stroke-linejoin="round"/>
      <g clip-path="url(#sc)"><path d="${rib}" stroke="#e77aa2" stroke-width="9" fill="none" stroke-linecap="round"/></g>
      <path d="M168 352 L232 352 L246 392 Q200 404 154 392 Z" fill="#ffb3cf" stroke="${L}" stroke-width="9" stroke-linejoin="round"/>
      <ellipse cx="140" cy="230" rx="40" ry="17" transform="rotate(-30 140 230)" fill="#fff" opacity=".65"/>
      <text x="256" y="492" text-anchor="middle" font-family="'Baloo 2'" font-weight="800" font-size="84" fill="#ff6f9c" stroke="${L}" stroke-width="12" paint-order="stroke" stroke-linejoin="round">Echo</text>
      ${mon}`;
  },
  // C 聲波島：小島在中間，周圍的水波一圈圈像回音；啵啵戴耳機坐在島上，上方雲朵寫 Echo
  c: () => {
    const L = '#4a3434', mon = monster('bobo', 'happy', 250).replace('<svg ', '<svg x="131" y="186" ');
    return `<defs><radialGradient id="sea" cx=".5" cy=".62" r=".7"><stop offset="0" stop-color="#bfeaff"/><stop offset="1" stop-color="#6cc3f0"/></radialGradient></defs>
      <rect width="512" height="512" fill="url(#sea)"/>
      ${[0, 1, 2, 3].map(i => `<ellipse cx="256" cy="398" rx="${170 + i * 52}" ry="${54 + i * 20}" fill="none" stroke="#fff" stroke-width="${9 - i * 1.6}" opacity="${.9 - i * .2}"/>`).join('')}
      <ellipse cx="256" cy="398" rx="150" ry="46" fill="#ffe2a6" stroke="${L}" stroke-width="9"/>
      <path d="M140 392 Q256 372 372 392" stroke="#fff3d0" stroke-width="9" fill="none" stroke-linecap="round"/>
      <g transform="translate(256 112)"><path d="M-170 40 Q-190 -10 -130 -20 Q-120 -78 -40 -66 Q10 -110 70 -62 Q150 -80 150 -10 Q200 0 176 46 Q170 66 140 66 H-140 Q-176 66 -170 40 Z" fill="#fff" stroke="${L}" stroke-width="9"/>
        <text x="0" y="40" text-anchor="middle" font-family="'Baloo 2'" font-weight="800" font-size="104" fill="#ff6f9c" stroke="${L}" stroke-width="10" paint-order="stroke" stroke-linejoin="round">Echo</text></g>
      ${mon}
      ${[[108, 250, '#ff6f9c', 1], [404, 236, '#3fbfa8', .9]].map(([x, y, c, k]) => `<g transform="translate(${x} ${y}) scale(${k})"><path d="M0 -40 V12 a14 12 0 1 1 -10 -10 V-40 l34 -10 V2 a14 12 0 1 1 -10 -10 V-32 Z" fill="${c}" stroke="${L}" stroke-width="6" stroke-linejoin="round"/></g>`).join('')}`;
  },
  // D 字島：圓滾滾的 Echo 大字像一座島浮在海上，啵啵趴在字上面，旁邊冒出 ABC 小泡泡
  d: () => {
    const L = '#4a3434', mon = monster('bobo', 'cheer', 230).replace('<svg ', '<svg x="140" y="40" ');
    return `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3f6ff"/><stop offset="1" stop-color="#bfe6ff"/></linearGradient>
        <linearGradient id="word" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ff0b4"/><stop offset="1" stop-color="#47c27a"/></linearGradient></defs>
      <rect width="512" height="512" fill="url(#sky)"/>
      <path d="M0 360 Q64 342 128 360 T256 360 T384 360 T512 360 V512 H0 Z" fill="#7cc8f2"/><path d="M0 410 Q64 394 128 410 T256 410 T384 410 T512 410 V512 H0 Z" fill="#5ab4ea"/>
      <ellipse cx="256" cy="372" rx="210" ry="30" fill="#ffe2a6" stroke="${L}" stroke-width="8"/>
      <text x="256" y="372" text-anchor="middle" font-family="'Baloo 2'" font-weight="800" font-size="190" fill="url(#word)" stroke="${L}" stroke-width="14" paint-order="stroke" stroke-linejoin="round" letter-spacing="-4">Echo</text>
      ${mon}
      ${[[392, 92, 'A', '#ff6f9c'], [440, 150, 'B', '#ffb52e'], [470, 212, 'C', '#3fbfa8']].map(([x, y, t, c], i) => `<circle cx="${x}" cy="${y}" r="${30 - i * 3}" fill="#fff" stroke="${L}" stroke-width="7"/><text x="${x}" y="${y + 13}" text-anchor="middle" font-family="'Fredoka'" font-weight="700" font-size="${38 - i * 4}" fill="${c}">${t}</text>`).join('')}`;
  }
};

(async () => {
  const srv = await start(), b = await chromium.launch();
  const p = await b.newPage();
  await p.route(/script\.google(usercontent)?\.com/, r => r.abort());   // 只擋 Apps Script；字型要載入
  await p.goto(srv.url); await p.waitForFunction(() => typeof monster === 'function');
  await p.addStyleTag({ url: 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@800&family=Fredoka:wght@700&display=block' });
  await p.evaluate(async () => { await document.fonts.load("800 60px 'Baloo 2'"); await document.fonts.load("700 40px 'Fredoka'"); });
  const svgs = {};
  // 平面風：圖示也不畫框線（跟小怪獸一致）
  for (const [k, f] of Object.entries(DESIGNS)) svgs[k] = await p.evaluate(src => { const inner = (0, eval)('(' + src + ')')(); return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${ART_STYLE === 'flat' ? flatify(inner, [], '#4a3434') : inner}</svg>`; }, f.toString());
  const shot = async (svg, size, file) => {
    await p.setViewportSize({ width: size, height: size });
    await p.evaluate(([svg, size]) => { document.body.innerHTML = svg.replace('width="512" height="512"', `width="${size}" height="${size}"`); document.body.style.cssText = 'margin:0;padding:0;background:none'; document.documentElement.style.background = 'none'; window.scrollTo(0, 0); }, [svg, size]);
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: file, clip: { x: 0, y: 0, width: size, height: size } });
  };
  if (PREVIEW) {
    const out = path.join(ROOT, 'tests', 'output'); fs.mkdirSync(out, { recursive: true });
    for (const k of Object.keys(svgs)) await shot(svgs[k], 512, path.join(out, `icon-option-${k}.png`));
    console.log('預覽在 tests/output/icon-option-*.png');
  } else {
    for (const [name, size] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180], ['favicon-32.png', 32]]) await shot(svgs[CHOSEN], size, path.join(ROOT, name));
    console.log('已用款式 ' + CHOSEN + ' 產生圖示');
  }
  await b.close(); srv.close();
})();
