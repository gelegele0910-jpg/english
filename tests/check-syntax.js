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
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
