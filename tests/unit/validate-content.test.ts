import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateContent } from '../../tools/validate-content';

const contentRoot = fileURLToPath(new URL('../../content', import.meta.url));
const realBalance = readFileSync(join(contentRoot, 'balance.yaml'), 'utf8');

function contentDir(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'captain-content-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

describe('validateContent', () => {
  it('passes the real content directory', () => {
    const report = validateContent(contentRoot);
    expect(report.problems).toEqual([]);
    expect(report.checked).toBeGreaterThan(0);
  });

  it('reports a wrong value with its path', () => {
    const root = contentDir({
      'balance.yaml': realBalance.replace('walkSpeed: 3.0', 'walkSpeed: fast'),
    });
    const { problems } = validateContent(root);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: 'balance.yaml' });
    expect(problems[0]?.message).toMatch(/^player\.walkSpeed:/);
  });

  it('reports unknown keys, so typos are caught', () => {
    const root = contentDir({ 'balance.yaml': `${realBalance}\nplayr: {}\n` });
    expect(validateContent(root).problems[0]?.message).toMatch(/playr/);
  });

  it('reports values that break a cross-field rule', () => {
    const root = contentDir({
      'balance.yaml': realBalance.replace('eyeHeight: 1.65', 'eyeHeight: 2.0'),
    });
    expect(validateContent(root).problems[0]?.message).toMatch(/^player\.eyeHeight:/);
  });

  it('reports YAML syntax errors', () => {
    const root = contentDir({ 'balance.yaml': 'player: [unclosed\n' });
    expect(validateContent(root).problems[0]?.message).toMatch(/^YAML:/);
  });

  it('reports files that have no schema, and ignores READMEs', () => {
    const root = contentDir({
      'balance.yaml': realBalance,
      'README.md': '# notes',
      'battles/cutter.yaml': 'enemy: pirate\n',
    });
    const { problems, checked } = validateContent(root);
    expect(checked).toBe(1);
    expect(problems).toEqual([
      { file: 'battles/cutter.yaml', message: expect.stringMatching(/no schema/) },
    ]);
  });

  it('runs the cross-file ship checks once every file is valid', () => {
    const root = mkdtempSync(join(tmpdir(), 'captain-content-'));
    cpSync(contentRoot, root, { recursive: true });
    const deck2 = join(root, 'ship/deck2.yaml');
    writeFileSync(deck2, readFileSync(deck2, 'utf8').replace('doors: [[30, 12]]', 'doors: []'));
    expect(validateContent(root).problems).toEqual([
      {
        file: 'ship/*.yaml',
        message: "deck 2 / junior-berthing-a: can't be reached on foot from captains-quarters",
      },
    ]);
  });
});
