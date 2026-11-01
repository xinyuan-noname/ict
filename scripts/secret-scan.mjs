// 仓库密钥扫描：命中即退出码非 0（tasks 任务 2.2 / 37.1）。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.argv[2] ?? '.';
const SKIP_DIRS = new Set(['node_modules', '.git', '.tools', 'coverage', 'data', '.codeartsdoer']);
const PATTERNS = [
  { name: 'client_secret literal', re: /client_secret\s*[=:]\s*['"]?[A-Za-z0-9._-]{8,}/i },
  { name: 'HUAWEI_CLIENT_SECRET value', re: /HUAWEI_CLIENT_SECRET\s*=\s*[A-Za-z0-9._-]{8,}/ },
  { name: 'private key block', re: /BEGIN (RSA |EC )?PRIVATE KEY/ },
  { name: 'session token literal', re: /s1_[A-Za-z0-9_-]{43}/ },
  { name: 'long hex secret', re: /\b[0-9a-f]{32,}\b/i }
];
const ALLOW = [/CHANGE_ME/, /<YOUR_/, /example/, /test-pepper/, /0123456789abcdef/, /pepper-0123456789abcdef/];

let hits = 0;
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx|js|mjs|go|json|yaml|yml|md|env|example|sql|kt|swift|cs)$/.test(entry)) continue;
    const text = readFileSync(full, 'utf8');
    for (const p of PATTERNS) {
      if (p.re.test(text) && !ALLOW.some((a) => a.test(text))) {
        console.error(`${p.name}: ${relative(ROOT, full)}`);
        hits += 1;
      }
    }
  }
}

walk(ROOT);
console.log(`secret scan finished, hits: ${hits}`);
process.exit(hits === 0 ? 0 : 1);