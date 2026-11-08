import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const dir = path.resolve('dist');
const forbidden = ['demo-acc-1', 'demo-tx-1', 'demo-note-1', 'أحمد الشمري', 'مؤسسة الأفق للتجارة', 'إدارة مساحة بيانات المعاينة', 'تصفير بيانات المعاينة', 'بيانات المعاينة'];
const files = [];
async function walk(where) {
  for (const entry of await readdir(where, { withFileTypes: true })) {
    const filename = path.join(where, entry.name);
    if (entry.isDirectory()) await walk(filename);
    else if (/\.(js|html|css|json|webmanifest)$/.test(entry.name)) files.push(filename);
  }
}
await walk(dir);
let found = [];
for (const filename of files) {
  const text = await readFile(filename, 'utf8');
  for (const needle of forbidden) {
    const index = text.indexOf(needle);
    if (index !== -1) found.push({ file: path.relative(dir, filename), marker: needle,
      context: text.slice(Math.max(0, index - 95), Math.min(text.length, index + needle.length + 95)) });
  }
}
if (found.length) {
  console.error('Production build contains preview labels or sample financial records:', found);
  process.exitCode = 1;
} else {
  console.log('PASS: production assets exclude demo records and preview UI (' + files.length + ' files inspected).');
}
