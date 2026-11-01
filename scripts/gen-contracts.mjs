// 由 contracts/error-codes.json 生成双端码表，避免两端手写漂移。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const src = 'contracts/error-codes.json';
const outTs = 'contracts/generated/ts/error-catalog.ts';

const catalog = JSON.parse(readFileSync(src, 'utf8'));
if (!Array.isArray(catalog.codes) || catalog.codes.length !== 14) {
  console.error(`expected 14 error codes, got ${catalog.codes?.length ?? 0}`);
  process.exit(1);
}

const lines = catalog.codes.map((c) => {
  const http = c.httpStatus === null ? 'null' : String(c.httpStatus);
  return `  ${c.code}: { code: '${c.code}', httpStatus: ${http}, userMessage: '${c.userMessage}', clientAction: '${c.clientAction}', retryable: ${c.retryable} }`;
});

const content = `// 构建期产物，勿手改。由 contracts/error-codes.json 生成。
export const ERROR_CODES = {
${lines.join(',\n')}
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;
`;

mkdirSync(dirname(outTs), { recursive: true });
writeFileSync(outTs, content, 'utf8');
console.log(`generated ${outTs} (${catalog.codes.length} codes)`);