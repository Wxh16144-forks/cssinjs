import { useContext } from 'react';
import StyleContext from '../StyleContext';
import { isClientSide, toStyleStr } from '../util';
import type { TokenWithCSSVar } from '../util/css-variables';
import { transformToken } from '../util/css-variables';
import type { ExtractStyle } from './useGlobalCache';
import useGlobalCache from './useGlobalCache';
import { uniqueHash } from './useStyleRegister';

export const CSS_VAR_PREFIX = 'cssVar';

type CSSVarCacheValue<V, T extends Record<string, V> = Record<string, V>> = [
  cssVarToken: TokenWithCSSVar<V, T>,
  cssVarStr: string,
  styleId: string,
  cssVarKey: string,
];

const useCSSVarRegister = <V, T extends Record<string, V>>(
  config: {
    path: string[];
    key: string;
    prefix?: string;
    unitless?: Record<string, boolean>;
    ignore?: Record<string, boolean>;
    scope?: string | string[];
    token: any;
    hashId?: string;
    nonce?: string | (() => string);
  },
  fn: () => T,
) => {
  const { key, prefix, unitless, ignore, token, hashId, scope, nonce } = config;
  const { cache: cacheEntity, container, hashPriority } = useContext(StyleContext);
  const { _tokenKey: tokenKey } = token;

  const scopeKey = Array.isArray(scope) ? scope.join('@@') : scope;
  const stylePath = [...config.path, key, scopeKey, tokenKey];

  const cache = useGlobalCache<CSSVarCacheValue<V, T>>(
    CSS_VAR_PREFIX,
    stylePath,
    () => {
      const originToken = fn();
      const [mergedToken, cssVarsStr] = transformToken<V, T>(originToken, key, {
        prefix,
        unitless,
        ignore,
        scope,
        hashPriority,
        hashCls: hashId,
      });
      const styleId = uniqueHash(stylePath, cssVarsStr);
      return [mergedToken, cssVarsStr, styleId, key];
    },
    ([, , styleId]) => {
      if (isClientSide) {
        cacheEntity.engine.remove(styleId, { container });
      }
    },
    ([, cssVarsStr, styleId]) => {
      if (!cssVarsStr) {
        return;
      }

      cacheEntity.engine.inject({
        key: styleId,
        css: cssVarsStr,
        prepend: 'queue',
        priority: -999,
        nonce,
        tokenKey: key,
        container,
      });
    },
  );

  return cache;
};

export const extract: ExtractStyle<CSSVarCacheValue<any>> = (
  cache,
  effectStyles,
  options,
) => {
  const [, styleStr, styleId, cssVarKey] = cache;
  const { plain } = options || {};

  if (!styleStr) {
    return null;
  }

  const order = -999;

  // ====================== Style ======================
  // Used for @rc-component/util
  const sharedAttrs = {
    'data-rc-order': 'prependQueue',
    'data-rc-priority': `${order}`,
  };

  const styleText = toStyleStr(
    styleStr,
    cssVarKey,
    styleId,
    sharedAttrs,
    plain,
  );

  return [order, styleId, styleText];
};

export default useCSSVarRegister;
