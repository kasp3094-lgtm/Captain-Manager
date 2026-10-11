import type { ZodType } from 'zod';
import { BalanceSchema } from './balance';

/** A kind of file in content/ and the schema every file of that kind must match. */
export interface ContentKind {
  readonly name: string;
  /** Matched against the path relative to content/, with forward slashes. */
  readonly pattern: RegExp;
  readonly schema: ZodType;
}

/** Every file in content/ must match one of these (README.md files excepted). */
export const CONTENT_KINDS: readonly ContentKind[] = [
  { name: 'balance', pattern: /^balance\.yaml$/, schema: BalanceSchema },
];
