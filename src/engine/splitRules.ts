/**
 * Split a stylesheet into top-level rules.
 *
 * `insertRule` only accepts a single rule, while cssinjs produces the whole
 * group as one string. Splitting the final output (instead of hooking into
 * stylis) keeps `normalizeStyle` untouched, so SSR output, snapshots and
 * `uniqueHash` stay byte-identical.
 *
 * Invariant: `splitRules(css).join('') === css`.
 */
export default function splitRules(css: string): string[] {
  const rules: string[] = [];

  let start = 0;
  let depth = 0;
  let quote = '';
  let escaped = false;
  let comment = false;

  for (let i = 0; i < css.length; i += 1) {
    const char = css[i];
    const next = css[i + 1];

    if (comment) {
      if (char === '*' && next === '/') {
        comment = false;
        i += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }

    if (char === '/' && next === '*') {
      comment = true;
      i += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      // Unbalanced input is tolerated instead of corrupting the depth counter,
      // otherwise one stray brace would swallow the rest of the stylesheet.
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        rules.push(css.slice(start, i + 1));
        start = i + 1;
      }
    } else if (char === ';' && depth === 0) {
      // Statement at-rules, e.g. `@layer a, b;`. Declarations never show up at
      // the top level of a normalized stylesheet.
      const chunk = css.slice(start, i + 1);
      if (chunk.trimStart().startsWith('@')) {
        rules.push(chunk);
        start = i + 1;
      }
    }
  }

  if (start < css.length) {
    rules.push(css.slice(start));
  }

  return rules;
}
