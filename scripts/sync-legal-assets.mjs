import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const copies = [
  {
    source: path.join(repositoryRoot, 'LICENSE'),
    targets: [
      path.join(repositoryRoot, 'src', 'renderer', 'assets', 'legal', 'LICENSE.txt'),
      path.join(repositoryRoot, 'landing', 'public', 'legal', 'LICENSE.txt')
    ]
  },
  {
    source: path.join(repositoryRoot, 'THIRD_PARTY_NOTICES.md'),
    targets: [
      path.join(repositoryRoot, 'src', 'renderer', 'assets', 'legal', 'THIRD_PARTY_NOTICES.md'),
      path.join(repositoryRoot, 'landing', 'public', 'legal', 'THIRD_PARTY_NOTICES.md')
    ]
  },
  {
    source: path.join(repositoryRoot, 'docs', 'legal', 'classic-har-gow-provenance.json'),
    targets: [
      path.join(repositoryRoot, 'src', 'renderer', 'assets', 'legal', 'classic-har-gow-provenance.json'),
      path.join(repositoryRoot, 'landing', 'public', 'legal', 'classic-har-gow-provenance.json')
    ]
  }
];

for (const { source, targets } of copies) {
  const content = await readFile(source);
  for (const target of targets) {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}

console.log(`Synchronized ${copies.length} canonical legal files to desktop and landing assets.`);
