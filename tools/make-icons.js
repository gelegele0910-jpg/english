// 產生手機桌面圖示：用 App 裡的小怪獸「啵啵」＋寫著 ABC 的對話泡泡，背景是小島與海浪（Echo Island）
// 用法：node tools/make-icons.js     → 產生 icon.svg、icon-512.png、icon-192.png、apple-touch-icon.png、favicon-32.png
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { start, blockExternal, ROOT } = require('../tests/server');

(async () => {
  const srv = await start(), b = await chromium.launch();
  const p = await b.newPage(); await blockExternal(p);
  await p.goto(srv.url); await p.waitForFunction(() => typeof monster === 'function');
  const svg = await p.evaluate(() => {
    const L = '#4a3434';
    const bobo = monster('bobo', 'cheer', 300).replace('<svg ', '<svg x="18" y="168" ');
    // ABC 用線條畫，不靠字型（每台手機看起來都一樣）
    const letter = (d, c) => `<path d="${d}" fill="none" stroke="${L}" stroke-width="27" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${c}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4f0ff"/><stop offset="1" stop-color="#a6dcff"/></linearGradient></defs>
  <rect width="512" height="512" fill="url(#sky)"/>
  <g fill="#fff" opacity=".9"><ellipse cx="88" cy="96" rx="44" ry="18"/><ellipse cx="120" cy="84" rx="30" ry="20"/><ellipse cx="62" cy="88" rx="22" ry="14"/></g>
  <path d="M0 400 Q64 380 128 400 T256 400 T384 400 T512 400 V512 H0 Z" fill="#7cc8f2"/>
  <path d="M0 438 Q64 420 128 438 T256 438 T384 438 T512 438 V512 H0 Z" fill="#5ab4ea"/>
  <path d="M30 470 Q60 460 90 470 M360 478 Q392 466 424 478" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" opacity=".8"/>
  <ellipse cx="172" cy="446" rx="150" ry="36" fill="#ffe2a6" stroke="${L}" stroke-width="8"/>
  <path d="M60 440 Q170 424 284 440" stroke="#fff3d0" stroke-width="8" fill="none" stroke-linecap="round"/>
  ${bobo}
  <path d="M318 214 L262 268 L360 222 Z" fill="#fff" stroke="${L}" stroke-width="10" stroke-linejoin="round"/>
  <rect x="266" y="66" width="222" height="156" rx="50" fill="#fff" stroke="${L}" stroke-width="10"/>
  <path d="M300 230 L330 214 L352 224 Z" fill="#fff"/>
  ${letter('M300 180 L326 104 L352 180 M311 152 H341', '#ff6f9c')}
  ${letter('M372 105 V180 M372 105 H388 Q410 105 410 123 Q410 141 388 141 H372 M372 141 H392 Q414 141 414 160 Q414 180 392 180 H372', '#ffb52e')}
  ${letter('M466 118 Q455 104 440 104 Q420 104 420 142 Q420 180 440 180 Q455 180 466 166', '#3fbfa8')}
  <g fill="#fff3a8" stroke="${L}" stroke-width="4"><path d="M246 64 l6 14 15 1 -11 10 4 15 -14 -8 -13 8 3 -15 -11 -10 15 -1 Z"/></g>
</svg>`;
  });
  fs.writeFileSync(path.join(ROOT, 'icon.svg'), svg);
  for (const [name, size] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180], ['favicon-32.png', 32]]) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0">${svg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
    await p.screenshot({ path: path.join(ROOT, name), clip: { x: 0, y: 0, width: size, height: size } });
  }
  console.log('done');
  await b.close(); srv.close();
})();
