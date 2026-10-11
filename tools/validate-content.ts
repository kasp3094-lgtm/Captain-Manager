import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parseDocument } from 'yaml';
import { CONTENT_KINDS, type ContentKind } from '../src/content/registry';

export interface ContentProblem {
  /** Path relative to the content root, with forward slashes. */
  readonly file: string;
  readonly message: string;
}

export interface ContentReport {
  readonly checked: number;
  readonly problems: readonly ContentProblem[];
}

const IGNORED = /(^|\/)README\.md$/;

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

/** Checks every file under `root` against the schema registered for its path. */
export function validateContent(
  root: string,
  kinds: readonly ContentKind[] = CONTENT_KINDS,
): ContentReport {
  const problems: ContentProblem[] = [];
  let checked = 0;

  for (const absolute of listFiles(root).sort()) {
    const file = relative(root, absolute).split(sep).join('/');
    if (IGNORED.test(file)) continue;

    const kind = kinds.find((k) => k.pattern.test(file));
    if (!kind) {
      problems.push({
        file,
        message: 'no schema is registered for this file (src/content/registry.ts)',
      });
      continue;
    }

    checked++;
    const document = parseDocument(readFileSync(absolute, 'utf8'));
    if (document.errors.length > 0) {
      for (const error of document.errors)
        problems.push({ file, message: `YAML: ${error.message}` });
      continue;
    }

    const result = kind.schema.safeParse(document.toJS());
    if (!result.success) {
      for (const issue of result.error.issues) {
        const where = issue.path.length > 0 ? issue.path.join('.') : '(top level)';
        problems.push({ file, message: `${where}: ${issue.message}` });
      }
    }
  }

  return { checked, problems };
}
