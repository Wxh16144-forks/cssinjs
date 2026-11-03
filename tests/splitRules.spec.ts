import { describe, expect, it } from 'vitest';
import splitRules from '../src/engine/splitRules';

const samples = [
  '.box{width:93px;line-height:1;background-color:var(--primary-color);}',
  '.a{color:red;}.b:hover{color:blue;}',
  '@media (min-width:100px){.c{display:flex;}}.d{color:red;}',
  '@layer antd{.a{color:red}}@layer base,antd;',
  '.a::before{content:"}";color:red}.b{content:\'{\'}',
  '.a{background:url("a;b.png")}.b{color:red}',
  '/* comment { } */ .a{color:red}.b{color:blue}',
  '@keyframes spin{from{opacity:0}to{opacity:1}}.a{animation:spin 1s}',
  '',
];

describe('splitRules', () => {
  samples.forEach((css, index) => {
    it(`keeps the input byte-identical #${index}`, () => {
      expect(splitRules(css).join('')).toBe(css);
    });
  });

  it('splits top level rules', () => {
    expect(splitRules('.a{color:red}.b{color:blue}')).toEqual([
      '.a{color:red}',
      '.b{color:blue}',
    ]);
  });

  it('keeps nested braces inside one rule', () => {
    expect(
      splitRules('@media (min-width:1px){.a{color:red}.b{color:blue}}'),
    ).toEqual(['@media (min-width:1px){.a{color:red}.b{color:blue}}']);
  });

  it('handles brace inside a quoted string', () => {
    expect(splitRules('.a{content:"}"}.b{color:red}')).toEqual([
      '.a{content:"}"}',
      '.b{color:red}',
    ]);
  });

  it('keeps statement at-rules as one rule', () => {
    expect(splitRules('@layer base, antd;.a{color:red}')).toEqual([
      '@layer base, antd;',
      '.a{color:red}',
    ]);
  });

  it('ignores braces inside comments', () => {
    expect(splitRules('/* } */ .a{color:red}')).toEqual([
      '/* } */ .a{color:red}',
    ]);
  });
});
