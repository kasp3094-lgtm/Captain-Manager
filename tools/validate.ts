import { fileURLToPath } from 'node:url';
import { validateContent } from './validate-content';

const root = fileURLToPath(new URL('../content', import.meta.url));
const report = validateContent(root);

for (const problem of report.problems)
  console.error(`✗ content/${problem.file}: ${problem.message}`);

if (report.problems.length > 0) {
  console.error(`\n${report.problems.length} problem(s) in content/.`);
  process.exit(1);
}
console.log(`✓ content/: ${report.checked} file(s) valid.`);
