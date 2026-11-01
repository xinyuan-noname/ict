// 本地语法校验：当前环境无法获取 Go 工具链时，用 tree-sitter 检查 *.go 语法。
// 用法：NODE_PATH=/tmp/node_modules node scripts/check-go-syntax.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Parser = require('tree-sitter');
const Go = require('tree-sitter-go');

const parser = new Parser();
parser.setLanguage(Go);

const root = process.argv[2] ?? 'server';
let files = 0;
let failures = 0;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.git') continue;
      walk(full);
    } else if (entry.endsWith('.go')) {
      files += 1;
      const tree = parser.parse(readFileSync(full, 'utf8'));
      const errors = [];
      const visit = (node) => {
        if (node.type === 'ERROR' || node.isMissing) {
          errors.push(`${node.type}@${node.startPosition.row + 1}:${node.startPosition.column + 1}`);
        }
        for (const child of node.children) visit(child);
      };
      visit(tree.rootNode);
      if (errors.length > 0) {
        failures += 1;
        console.error(`SYNTAX ERROR ${relative(root, full)} -> ${errors.slice(0, 5).join(', ')}`);
      }
    }
  }
}

walk(root);
console.log(`checked ${files} go files, syntax failures: ${failures}`);
process.exit(failures === 0 ? 0 : 1);