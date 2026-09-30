import { fileURLToPath } from 'node:url';
import { validateStructure } from './policy-validation.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
try {
  const result = validateStructure(root);
  for (const w of result.warnings) console.log('待补：' + w);
  if (result.problems.length) {
    console.error(`✗ ${result.problems.length} 处结构或规则漂移：`);
    for (const p of result.problems) console.error('  - ' + p);
    process.exitCode = 1;
  } else console.log(`✓ 完整结构校验通过（${result.projectCount} 个项目；结构通过不代表正式评测完成）。`);
} catch (e) { console.error('校验无法完成：' + e.message); process.exitCode = 1; }
