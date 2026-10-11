/**
 * Checks every file in content/ against the schema registered for its path, then runs the rules
 * that span several files (src/content/registry.ts). The CLI wrapper is tools/validate.ts.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parseDocument } from 'yaml';
import {
  CONTENT_CHECKS,
  CONTENT_KINDS,
  type ContentCheck,
  type ContentKind,
} from '../src/content/registry';

export interface ContentProblem {
  /** Path relative to the content root (or the files a cross-file check looks at). */
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

export function validateContent(
  root: string,
  kinds: readonly ContentKind[] = CONTENT_KINDS,
  checks: readonly ContentCheck[] = CONTENT_CHECKS,
): ContentReport {
  const problems: ContentProblem[] = [];
  const data = new Map<string, unknown>();
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
    if (result.success) {
      data.set(file, result.data);
    } else {
      for (const issue of result.error.issues) {
        const where = issue.path.length > 0 ? issue.path.join('.') : '(top level)';
        problems.push({ file, message: `${where}: ${issue.message}` });
      }
    }
  }

  // Cross-file rules only make sense once every file is well-formed on its own.
  if (problems.length === 0) {
    for (const check of checks) {
      for (const message of check.run(data)) problems.push({ file: check.files, message });
    }
  }

  return { checked, problems };
}
