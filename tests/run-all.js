// 依序執行全部測試，最後列出總結。任一項失敗時結束碼為 1。
// 用法：node tests/run-all.js            （完整）
//       node tests/run-all.js --quick    （隨機點擊次數減少，較快）
const { spawnSync } = require('child_process'), path = require('path');
const quick = process.argv.includes('--quick');
const suites = [
  ['語法檢查', 'check-syntax.js', []],
  ['後端屬性測試', 'backend-props.js', []],
  ['前端屬性測試', 'front-props.js', []],
  ['雲端同步', 'sync.js', []],
  ['拼字複習', 'spelling.js', []],
  ['端到端', 'e2e.js', quick ? ['--clicks=60'] : []]
];
const summary = [];
for (const [name, file, args] of suites) {
  console.log(`\n=== ${name}（tests/${file}）===`);
  const t = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, file), ...args], { stdio: 'inherit' });
  summary.push([name, r.status === 0, ((Date.now() - t) / 1000).toFixed(1)]);
}
console.log('\n=== 總結 ===');
for (const [name, ok, s] of summary) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}（${s} 秒）`);
process.exit(summary.every(x => x[1]) ? 0 : 1);
