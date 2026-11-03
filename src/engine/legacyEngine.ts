import { removeCSS, updateCSS } from '@rc-component/util/lib/Dom/dynamicCSS';
import {
  ATTR_CACHE_PATH,
  ATTR_MARK,
  ATTR_TOKEN,
  CSS_IN_JS_INSTANCE,
} from '../constants';
import type {
  EngineType,
  InjectParams,
  RemoveParams,
  StyleEngine,
  StyleHandle,
} from './interface';

/**
 * Default backend: one `<style>` element per group, injected by
 * `@rc-component/util`. This mirrors the historical behavior exactly.
 */
export default class LegacyEngine implements StyleEngine {
  readonly type: EngineType = 'legacy';

  private instanceId: string;

  constructor(instanceId: string) {
    this.instanceId = instanceId;
  }

  inject({
    key,
    css,
    priority,
    prepend,
    nonce,
    tokenKey,
    cachePath,
    container,
  }: InjectParams): StyleHandle | null {
    const nonceStr = typeof nonce === 'function' ? nonce() : nonce;
    const config: Parameters<typeof updateCSS>[2] = {
      mark: ATTR_MARK,
      prepend,
      attachTo: container,
      priority,
      ...(nonceStr ? { csp: { nonce: nonceStr } } : {}),
    };

    const style = updateCSS(css, key, config);
    if (!style) {
      return null;
    }

    if (this.instanceId) {
      (style as any)[CSS_IN_JS_INSTANCE] = this.instanceId;
    }

    if (tokenKey) {
      style.setAttribute(ATTR_TOKEN, tokenKey);
    }

    if (process.env.NODE_ENV !== 'production' && cachePath) {
      style.setAttribute(ATTR_CACHE_PATH, cachePath);
    }

    return (style as unknown) as StyleHandle;
  }

  remove(key: string, params?: RemoveParams) {
    removeCSS(key, { mark: ATTR_MARK, attachTo: params?.container });
  }

  removeByToken(tokenKey: string) {
    if (typeof document === 'undefined') {
      return;
    }

    const styles = document.querySelectorAll(
      `style[${ATTR_TOKEN}="${tokenKey}"]`,
    );
    styles.forEach((style) => {
      if ((style as any)[CSS_IN_JS_INSTANCE] === this.instanceId) {
        style.parentNode?.removeChild(style);
      }
    });
  }
}
