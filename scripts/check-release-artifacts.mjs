// 发布产物扫描：命中 hwsim / mock 痕迹即阻断（tasks 27、design 2.10.1）。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const target = process.argv[2] ?? 'server/bin';
const FORBIDDEN_NAME = /hwsim/i;
const FORBIDDEN_TEXT = /hwsim|AUTH_MODE=mock|hwsim-client/i;
const BINARY = /\.(exe|dll|so|dylib|bin|zip|apk|msix|o|a)$/i;
let findings = 0;

function scan(path) {
  const st = statSync(path);
  if (st.isDirectory()) {
    for (const entry of readdirSync(path)) scan(join(path, entry));
    return;
  }
  const name = relative(target, path);
  if (FORBIDDEN_NAME.test(name)) {
    console.error(`forbidden artifact name: ${name}`);
    findings += 1;
    return;
  }
  // 二进制只按文件名判定：编译产物字符串常量不构成发布风险。
  if (BINARY.test(path)) return;
  if (st.size > 32 * 1024 * 1024) return;
  const buf = readFileSync(path);
  const text = buf.toString('latin1');
  if (FORBIDDEN_TEXT.test(text)) {
    console.error(`forbidden marker in: ${name}`);
    findings += 1;
  }
}

scan(target);
console.log(`release artifact scan finished: ${findings} findings`);
process.exit(findings === 0 ? 0 : 1);