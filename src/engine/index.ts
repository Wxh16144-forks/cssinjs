import { ATTR_SHEET } from '../constants';
import type { EngineType, StyleEngine } from './interface';
import LegacyEngine from './legacyEngine';
import SheetEngine from './sheetEngine';

export type {
  EngineType,
  InjectParams,
  RemoveParams,
  StyleEngine,
  StyleHandle,
} from './interface';

export interface EngineOptions {
  /**
   * Which DOM backend to use.
   *
   * - `auto` (default): picks the backend from the runtime environment.
   * - `legacy`: one `<style>` element per style group.
   * - `sheet`: virtual stylesheet (single `<style>` element, incremental rules).
   */
  engine?: EngineType;
}

export { ATTR_SHEET };

export function supportVirtualSheet() {
  if (typeof document === 'undefined') {
    return false;
  }

  const style = document.createElement('style');
  return Boolean(style.sheet && typeof style.sheet.insertRule === 'function');
}

/**
 * SSR pages ship pre-rendered `<style data-css-hash>` elements which the client
 * reuses instead of re-injecting. Taking them over is not supported by the
 * virtual sheet yet, so they fall back to the legacy backend.
 */
export function hasSSRStyles() {
  if (typeof document === 'undefined') {
    return false;
  }

  return Boolean(document.querySelector('style[data-css-hash]'));
}

export function resolveEngineType(options?: EngineOptions): 'legacy' | 'sheet' {
  const { engine = 'auto' } = options || {};

  if (engine === 'legacy' || engine === 'sheet') {
    return engine;
  }

  if (process.env.NODE_ENV !== 'production') {
    return 'legacy';
  }

  if (!supportVirtualSheet() || hasSSRStyles()) {
    return 'legacy';
  }

  return 'sheet';
}

/**
 * Create the DOM backend of one cache. The decision is made once so a cache
 * never mixes two ordering models.
 */
export default function createEngine(
  instanceId: string,
  options?: EngineOptions,
): StyleEngine {
  const type = resolveEngineType(options);

  if (type === 'sheet') {
    return new SheetEngine(instanceId);
  }

  return new LegacyEngine(instanceId);
}
