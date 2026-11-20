// 語法檢查：index.html 內所有 <script> 區塊與 apps-script/Code.gs；另檢查字體大小寫法
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const { ROOT } = require('./server');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'elp-syntax-'));
let fail = 0;
function check(label, code) {
  const f = path.join(tmp, label.replace(/\W+/g, '_') + '.js');
  fs.writeFileSync(f, code);
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); console.log('PASS 語法：' + label); }
  catch (e) { fail++; console.log('FAIL 語法：' + label + '\n' + String(e.stderr || e.message)); }
}
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
check('index.html', [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n;\n'));
check('apps-script/Code.gs', fs.readFileSync(path.join(ROOT, 'apps-script/Code.gs'), 'utf8'));
check('config.js', fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8'));
// 字體大小一律寫成 calc(Npx*var(--fz))，平板與電腦才會跟著放大（寫死的 px 會在平板上顯得太小）
const fixed = [...html.matchAll(/font-size:\s*\d+(?:\.\d+)?px/g)].map(m => m[0]);
if (fixed.length) { fail++; console.log('FAIL 字體大小寫死成 px（請改成 calc(Npx*var(--fz))）：' + [...new Set(fixed)].slice(0, 10).join('、')); }
else console.log('PASS 字體大小都跟著 --fz 縮放');
// 手機主畫面的圖示：index.html 與 manifest 指到的檔案都要存在，PNG 尺寸要對
{
  const bad = [], pngSize = f => { const b = fs.readFileSync(f); return b.toString('ascii', 1, 4) === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };
  const refs = [...html.matchAll(/<link rel="(?:apple-touch-icon|icon|manifest)"[^>]*href="([^"]+)"/g)].map(m => m[1]);
  if (!refs.includes('apple-touch-icon.png') || !refs.includes('manifest.webmanifest')) bad.push('index.html 少了 apple-touch-icon 或 manifest');
  refs.forEach(r => { if (!fs.existsSync(path.join(ROOT, r))) bad.push('找不到 ' + r); });
  let man = null; try { man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8')); } catch (e) { bad.push('manifest 不是正確的 JSON'); }
  if (man) {
    if (!man.short_name || man.short_name.length > 12) bad.push('short_name 要有，而且 12 個字以內（主畫面才不會被截掉）');
    if (man.display !== 'minimal-ui') bad.push('display 要用 minimal-ui（Android 可安裝成 App；iPhone 仍用 Safari、資料不分家）');
    if (!fs.existsSync(path.join(ROOT, 'sw.js'))) bad.push('少了 sw.js（Android 安裝成 App 需要）');
    else check('sw.js', fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'));
    (man.icons || []).forEach(ic => { const f = path.join(ROOT, ic.src), sz = fs.existsSync(f) && pngSize(f); if (!sz || sz.join('x') !== ic.sizes) bad.push(`圖示 ${ic.src} 不存在或尺寸不是 ${ic.sizes}`); });
  }
  const t = path.join(ROOT, 'apple-touch-icon.png'); if (fs.existsSync(t) && String(pngSize(t)) !== '180,180') bad.push('apple-touch-icon.png 應該是 180×180');
  if (bad.length) { fail++; console.log('FAIL 主畫面圖示：' + bad.join('；')); } else console.log('PASS 主畫面圖示與 manifest');
}
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
