import { render } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import {
  createCache,
  createTheme,
  StyleProvider,
  useCacheToken,
  useStyleRegister,
} from '../src';
import { ATTR_SHEET } from '../src/constants';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function sheetStyle() {
  return document.querySelector(
    `style[${ATTR_SHEET}]`,
  ) as HTMLStyleElement | null;
}

/**
 * Read the stylesheet through CSSOM instead of `textContent`: `insertRule` does
 * not update the text, so the rules are the only source of truth for both
 * backends.
 */
function sheetCss() {
  const sheet = sheetStyle()?.sheet;
  if (!sheet) {
    return '';
  }
  return Array.from(sheet.cssRules)
    .map((rule) => rule.cssText)
    .join('')
    .replace(/\s+/g, '');
}

function sheetRuleCount() {
  return sheetStyle()?.sheet?.cssRules.length ?? 0;
}

const theme = createTheme((token: Record<string, any>) => token);

describe('sheet engine', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('merges every style group into a single style element', async () => {
    const cache = createCache({ engine: 'sheet' });

    const Item = ({ index }: { index: number }) => {
      const token = { _tokenKey: 'token' };
      useStyleRegister({ theme, token, path: ['item', `${index}`] }, () => ({
        [`.item-${index}`]: { color: 'red' },
      }));
      return <div className={`item-${index}`} />;
    };

    render(
      <StyleProvider cache={cache}>
        <Item index={0} />
        <Item index={1} />
        <Item index={2} />
      </StyleProvider>,
    );
    await flush();

    const styles = document.querySelectorAll('style');
    expect(styles).toHaveLength(1);
    expect(styles[0].hasAttribute(ATTR_SHEET)).toBe(true);
    expect(sheetCss()).toContain('.item-0{color:red;}');
    expect(sheetCss()).toContain('.item-2{color:red;}');
    expect(sheetRuleCount()).toBe(3);
  });

  it('appends new groups incrementally', async () => {
    const cache = createCache({ engine: 'sheet' });

    const Item = ({ index }: { index: number }) => {
      useStyleRegister(
        { theme, token: { _tokenKey: 'token' }, path: ['item', `${index}`] },
        () => ({ [`.item-${index}`]: { color: 'red' } }),
      );
      return <div />;
    };

    const { rerender } = render(
      <StyleProvider cache={cache}>
        <Item index={0} />
      </StyleProvider>,
    );
    await flush();
    expect(sheetRuleCount()).toBe(1);

    rerender(
      <StyleProvider cache={cache}>
        <Item index={0} />
        <Item index={1} />
      </StyleProvider>,
    );
    await flush();

    expect(document.querySelectorAll('style')).toHaveLength(1);
    expect(sheetRuleCount()).toBe(2);
    expect(sheetCss()).toContain('.item-0{color:red;}');
    expect(sheetCss()).toContain('.item-1{color:red;}');
  });

  it('keeps token rules ahead of component rules', async () => {
    const cache = createCache({ engine: 'sheet' });

    const Demo = () => {
      const [token] = useCacheToken(theme, [{ color: 'red' }], {
        cssVar: { key: 'css-var-test' },
      });
      useStyleRegister({ theme, token, path: ['comp'] }, () => ({
        '.comp': { color: 'var(--color)' },
      }));
      return <div className="comp" />;
    };

    render(
      <StyleProvider cache={cache}>
        <Demo />
      </StyleProvider>,
    );
    await flush();

    expect(document.querySelectorAll('style')).toHaveLength(1);
    expect(sheetCss().indexOf('.css-var-test{')).toBeLessThan(
      sheetCss().indexOf('.comp{'),
    );
  });

  it('keeps other groups when one rule is rejected', async () => {
    const cache = createCache({ engine: 'sheet' });

    // Fill the sheet past the small-sheet threshold so the next flush takes the
    // incremental path, where `insertRule` can reject a single rule.
    const filler = Array.from(
      { length: 250 },
      (_, i) => `.filler-${i}{color:red}`,
    ).join('');
    cache.engine.inject({ key: 'filler', css: filler });
    await flush();

    // jsdom rejects `@layer` blocks from `insertRule` (Chromium accepts them).
    cache.engine.inject({ key: 'bad', css: '@layer x{.bad{color:red}}' });
    cache.engine.inject({ key: 'later', css: '.later{color:blue}' });
    await flush();

    expect(sheetCss()).toContain('.filler-0{color:red;}');
    expect(sheetCss()).toContain('.later{color:blue;}');
    expect(sheetRuleCount()).toBe(251);
  });

  it('rewrites a small sheet instead of patching it', async () => {
    const cache = createCache({ engine: 'sheet' });

    cache.engine.inject({ key: 'a', css: '.a{color:red}' });
    cache.engine.inject({ key: 'b', css: '.b{color:blue}' });
    await flush();
    expect(sheetRuleCount()).toBe(2);

    cache.engine.inject({ key: 'c', css: '.c{color:green}' });
    await flush();

    expect(sheetRuleCount()).toBe(3);
    expect(sheetCss()).toContain('.a{color:red;}');
    expect(sheetCss()).toContain('.c{color:green;}');
  });

  it('removes a group on request', async () => {
    const cache = createCache({ engine: 'sheet' });

    cache.engine.inject({ key: 'a', css: '.a{color:red}' });
    cache.engine.inject({ key: 'b', css: '.b{color:blue}' });
    await flush();
    expect(sheetRuleCount()).toBe(2);

    cache.engine.remove('a');
    await flush();

    expect(sheetRuleCount()).toBe(1);
    expect(sheetCss()).not.toContain('.a{');
    expect(sheetCss()).toContain('.b{color:blue;}');
  });

  it('removes every group of one token', async () => {
    const cache = createCache({ engine: 'sheet' });

    cache.engine.inject({ key: 'a', css: '.a{color:red}', tokenKey: 'tk' });
    cache.engine.inject({ key: 'b', css: '.b{color:blue}' });
    await flush();
    expect(sheetRuleCount()).toBe(2);

    cache.engine.removeByToken('tk');
    await flush();

    expect(sheetRuleCount()).toBe(1);
    expect(sheetCss()).toContain('.b{color:blue;}');
  });

  it('rebuilds the style element when the nonce changes', async () => {
    const cache = createCache({ engine: 'sheet' });

    cache.engine.inject({ key: 'a', css: '.a{color:red}', nonce: 'first' });
    await flush();
    expect(sheetStyle()?.nonce).toBe('first');

    cache.engine.inject({ key: 'b', css: '.b{color:blue}', nonce: 'second' });
    await flush();

    const styles = document.querySelectorAll('style');
    expect(styles).toHaveLength(1);
    expect(sheetStyle()?.nonce).toBe('second');
    expect(sheetRuleCount()).toBe(2);
  });
});
