/**
 * Compiles the Ink scripts in content/events/ (used by the Vite build, `npm run validate` and the
 * unit tests; the game itself only loads the compiled result). Every script gets the game's
 * functions declared for it, so writers can call fx(), flag() and the rest without boilerplate.
 */
import { Compiler, CompilerOptions } from 'inkjs/full';

/**
 * The functions the game gives every script (src/sim/narrative.ts binds them). Prepended to each
 * script before compiling; line numbers in errors are corrected for it.
 */
const INK_FUNCTIONS = [
  'EXTERNAL fx(what, amount)',
  'EXTERNAL flag(name)',
  'EXTERNAL has(name)',
  'EXTERNAL meter(what)',
  'EXTERNAL tier(what)',
  'EXTERNAL summon(who, room)',
  'EXTERNAL name(who)',
  'EXTERNAL last(who)',
  'EXTERNAL ship()',
];

export interface CompiledInk {
  /** The story as JSON for the inkjs runtime; empty if it didn't compile. */
  readonly json: string;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/** Compiles one script. `file` names it in messages. */
export function compileInk(source: string, file: string): CompiledInk {
  const offset = INK_FUNCTIONS.length;
  const errors: string[] = [];
  const warnings: string[] = [];
  const fix = (message: string) =>
    message
      .replace(/^(ERROR|WARNING|TODO):\s*/, '')
      .replace(/line (\d+)/, (_, line: string) => `line ${Number(line) - offset}`);
  // No source file name: the compiler would try to open it; `file` only labels the messages.
  const options = new CompilerOptions(null, [], false, (message: string) => {
    if (/^WARNING/.test(message)) warnings.push(`${file}: ${fix(message)}`);
    else if (!/^TODO/.test(message)) errors.push(`${file}: ${fix(message)}`);
  });
  try {
    const story = new Compiler(`${INK_FUNCTIONS.join('\n')}\n${source}`, options).Compile();
    if (errors.length > 0 || !story) return { json: '', errors, warnings };
    return { json: story.ToJson() as string, errors, warnings };
  } catch (error) {
    return {
      json: '',
      errors: errors.length > 0 ? errors : [`${file}: ${(error as Error).message}`],
      warnings,
    };
  }
}
