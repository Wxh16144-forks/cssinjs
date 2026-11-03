# @ant-design/cssinjs

[![NPM version][npm-image]][npm-url] [![npm download][download-image]][download-url] [![dumi](https://img.shields.io/badge/docs%20by-dumi-blue?style=flat-square)](https://github.com/umijs/dumi) [![build status][github-actions-image]][github-actions-url] [![Codecov][codecov-image]][codecov-url] [![bundle size][bundlephobia-image]][bundlephobia-url]

[npm-image]: http://img.shields.io/npm/v/@ant-design/cssinjs.svg?style=flat-square
[npm-url]: http://npmjs.org/package/@ant-design/cssinjs
[github-actions-image]: https://github.com/ant-design/cssinjs/workflows/CI/badge.svg
[github-actions-url]: https://github.com/ant-design/cssinjs/actions
[codecov-image]: https://img.shields.io/codecov/c/github/ant-design/cssinjs/master.svg?style=flat-square
[codecov-url]: https://codecov.io/gh/ant-design/cssinjs/branch/master
[download-image]: https://img.shields.io/npm/dm/@ant-design/cssinjs.svg?style=flat-square
[download-url]: https://npmjs.org/package/@ant-design/cssinjs
[bundlephobia-url]: https://bundlephobia.com/result?p=@ant-design/cssinjs
[bundlephobia-image]: https://badgen.net/bundlephobia/minzip/@ant-design/cssinjs

Component level cssinjs solution used in [ant.design](https://ant.design). It's a subset of [Emotion](https://emotion.sh/) with design token logic wrapper. Please feel free to use emotion directly if you want to find a web cssinjs solution. cssinjs related dep packages:

- stylis
- @emotion/hash
- @emotion/unitless

## Live Demo

https://ant-design.github.io/cssinjs/

## Install

```bash
npm install @ant-design/cssinjs
```

or

```bash
yarn add @ant-design/cssinjs
```

```bash
pnpm add @ant-design/cssinjs
```

## Development

```
npm install
npm start
```

## License

@ant-design/cssinjs is released under the MIT license.

## API

### StyleProvider

| Prop | Desc | Type | Default |
| --- | --- | --- | --- |
| autoClear | Clear inject style element when component remove. | boolean | false |
| cache | Config cssinjs cache entity. Only set when you need ssr to extract style on you own. | CacheEntity | - |
| hashPriority | Use `:where` selector to reduce hashId css selector priority | `'low' \| 'high'` | `'low'` |
| container | Tell cssinjs where to inject style in. | Element \| ShadowRoot | `document.head` |
| ssrInline | Component wil render inline `<style />` for fallback in SSR. Not recommend. | boolean | false |
| transformers | Transform css before inject in document. Please note that `transformers` do not support dynamic update | Transformer[] | - |

### createCache

return CacheEntity for StyleProvider.

```ts
import { createCache, StyleProvider } from '@ant-design/cssinjs';

const cache = createCache();
// <StyleProvider cache={cache}>...</StyleProvider>
```

`createCache` accepts the DOM injection backend. The decision is made once per cache, so a cache never mixes two ordering models.

| Option | Desc | Type | Default |
| --- | --- | --- | --- |
| engine | `legacy` injects one `<style>` element per style group. `sheet` keeps the rules in JS and projects them onto a single `<style>` element with `insertRule` / `deleteRule`. `auto` picks `sheet` in production builds when the browser supports constructible stylesheets and the page was not rendered by SSR. | `'auto' \| 'legacy' \| 'sheet'` | `'auto'` |

Notes:

- `auto` resolves to `legacy` when `process.env.NODE_ENV !== 'production'`, so development keeps one `<style>` element per component for debugging.
- A page that already contains server-rendered `style[data-css-hash]` elements stays on `legacy`; taking over SSR styles is not supported by the sheet backend yet.
- The sheet backend orders rules by `order` inside the single element. Rules from other libraries that use `data-rc-order` are no longer interleaved rule by rule with cssinjs styles; the whole element is positioned as one block.

### createTheme

Create theme object. When same algorithm provided, it will return same object.

### Design Token related API

Since `@ant-design/cssinjs` use strong constraints for cache hit performance, we recommend to view demo `basic.tsx` for usage and `animation.tsx` for animation usage.

### extractStyle

Extracts the styles from the cache and returns them as a string.

#### Parameters

- `cache` (Cache): The cache instance containing the styles.
- `options` (object | boolean, optional): Options for extracting the styles.
  - `plain` (boolean, optional): If true, the styles will be returned in plain format. Default is false.
  - `types` (string | string[], optional): The types of styles to extract. Default is ['style', 'token', 'cssVar'].

#### Returns

- (string): The extracted styles as a string.

#### Example

```typescript
import { extractStyle, createCache } from '@ant-design/cssinjs';

// 创建并填充缓存
const cache = createCache();
// 注意：在实际使用中，缓存通常会在渲染组件时自动填充

// 提取样式
const styles = extractStyle(cache, { plain: true, types: ['style', 'token'] });

// 使用提取的样式
const styleElement = document.createElement('style');
styleElement.innerHTML = styles;
document.head.appendChild(styleElement);
```

## Transform

When you need transform CSSObject before inject style. You can use `transformers` to handle this:

```tsx | pure
import {
  legacyLogicalPropertiesTransformer,
  StyleProvider,
} from '@ant-design/cssinjs';

export default () => (
  <StyleProvider transformers={[legacyLogicalPropertiesTransformer]}>
    <MyApp />
  </StyleProvider>
);
```

Follow are the transform we provide:

#### legacyLogicalPropertiesTransformer

Convert logical properties to legacy properties. e.g. `marginBlockStart` to `marginTop`:

- inset
- margin
- padding
- border

#### px2remTransformer

Convert pixel units to rem units. [px2remTransformer.options](./src/transformers/px2rem.ts)
