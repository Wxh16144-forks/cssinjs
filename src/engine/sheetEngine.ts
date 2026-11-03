import { ATTR_CACHE_PATH, ATTR_SHEET, CSS_IN_JS_INSTANCE } from '../constants';
import type {
  EngineType,
  InjectParams,
  RemoveParams,
  StyleEngine,
  StyleHandle,
} from './interface';
import splitRules from './splitRules';

interface GroupRecord {
  key: string;
  rules: string[];
  priority: number;
  seq: number;
  version: number;
  tokenKey?: string;
  cachePath?: string;
  /** `@layer a, b;` statements must stay in front of every other rule. */
  layerDecl: boolean;
}

interface AppliedInfo {
  version: number;
  /** Rules actually present in the sheet, invalid ones are skipped. */
  count: number;
}

interface SheetState {
  container: Element | ShadowRoot;
  style: HTMLStyleElement | null;
  groups: Map<string, GroupRecord>;
  /** Group keys in the order currently applied to the sheet. */
  applied: string[];
  appliedInfo: Map<string, AppliedInfo>;
  nonce?: string;
  scheduled: boolean;
  seq: number;
  dirty: boolean;
}

/** Below this amount of changed rules, patching is always cheaper. */
const REBUILD_MIN_RULES = 500;

function isLayerDecl(rules: string[]) {
  return (
    rules.length > 0 && rules.every((rule) => /^@layer[^{]*;\s*$/.test(rule))
  );
}

/**
 * Layer statements always come first, then lower priority, then insertion
 * order so that ties stay stable across flushes.
 */
function compareGroup(a: GroupRecord, b: GroupRecord) {
  if (a.layerDecl !== b.layerDecl) {
    return a.layerDecl ? -1 : 1;
  }
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }
  return a.seq - b.seq;
}

/**
 * Virtual stylesheet backend.
 *
 * Keeps the JS side as the source of truth and projects it onto one `<style>`
 * element. Bulk changes rewrite the whole text; small deltas use
 * `insertRule` / `deleteRule` so a theme switch does not re-parse everything.
 */
export default class SheetEngine implements StyleEngine {
  readonly type: EngineType = 'sheet';

  private instances = new Map<Element | ShadowRoot | 'document', SheetState>();

  private instanceId: string;

  constructor(instanceId: string) {
    this.instanceId = instanceId;
  }

  private getState(container?: Element | ShadowRoot): SheetState {
    const key = container || 'document';
    let state = this.instances.get(key);

    if (!state) {
      state = {
        container: container || document.head || document.body,
        style: null,
        groups: new Map(),
        applied: [],
        appliedInfo: new Map(),
        scheduled: false,
        seq: 0,
        dirty: false,
      };
      this.instances.set(key, state);
    }

    return state;
  }

  inject(params: InjectParams): StyleHandle | null {
    const {
      key,
      css,
      priority = 0,
      nonce,
      tokenKey,
      cachePath,
      container,
    } = params;
    const state = this.getState(container);
    const rules = splitRules(css);
    const existing = state.groups.get(key);

    if (existing) {
      // Style ids are content hashes, so an identical key means identical rules.
      // Keep the guard for callers that reuse a key with new content.
      if (existing.rules.join('') !== css) {
        existing.rules = rules;
        existing.version += 1;
        state.dirty = true;
      }
    } else {
      state.groups.set(key, {
        key,
        rules,
        priority,
        seq: state.seq += 1,
        version: 1,
        tokenKey,
        cachePath,
        layerDecl: isLayerDecl(rules),
      });
      state.dirty = true;
    }

    this.applyNonce(state, typeof nonce === 'function' ? nonce() : nonce);
    this.schedule(state);

    return this.createHandle(state, key);
  }

  remove(key: string, params?: RemoveParams) {
    const state = this.getState(params?.container);
    if (state.groups.delete(key)) {
      state.dirty = true;
      this.schedule(state);
    }
  }

  removeByToken(tokenKey: string) {
    this.instances.forEach((state) => {
      let changed = false;
      state.groups.forEach((group, key) => {
        if (group.tokenKey === tokenKey) {
          state.groups.delete(key);
          changed = true;
        }
      });
      if (changed) {
        state.dirty = true;
        this.schedule(state);
      }
    });
  }

  private createHandle(state: SheetState, key: string): StyleHandle {
    return {
      setAttribute: (name: string, value: string) => {
        if (name === ATTR_CACHE_PATH) {
          const group = state.groups.get(key);
          if (group) {
            group.cachePath = value;
          }
        }
      },
    };
  }

  private applyNonce(state: SheetState, nonce?: string) {
    if (nonce && state.nonce !== nonce) {
      state.nonce = nonce;
      // A single element holds every rule, so a nonce change rebuilds it.
      if (state.style) {
        state.style.parentNode?.removeChild(state.style);
        state.style = null;
        state.applied = [];
        state.appliedInfo.clear();
        state.dirty = true;
      }
    }
  }

  private schedule(state: SheetState) {
    if (state.scheduled) {
      return;
    }

    state.scheduled = true;
    // A microtask keeps the visible timing of `useInsertionEffect` while
    // batching every registration of one commit into a single flush.
    Promise.resolve().then(() => {
      state.scheduled = false;
      this.flush(state);
    });
  }

  private ensureStyle(state: SheetState) {
    if (state.style && state.style.isConnected) {
      return state.style;
    }

    if (typeof document === 'undefined') {
      return null;
    }

    const style = document.createElement('style');
    style.setAttribute(ATTR_SHEET, '');
    // Reuse the rc-util ordering attributes so antd styles still sit at the
    // top of the stylesheet block, ahead of consumer styles.
    style.setAttribute('data-rc-order', 'prependQueue');
    style.setAttribute('data-rc-priority', '-999');
    if (this.instanceId) {
      (style as any)[CSS_IN_JS_INSTANCE] = this.instanceId;
    }
    if (state.nonce) {
      style.nonce = state.nonce;
    }

    const { container } = state;
    const children = Array.from(container.children);
    const next = children.find(
      (node) =>
        !(
          node.tagName === 'STYLE' &&
          node.getAttribute('data-rc-order') === 'prependQueue' &&
          Number(node.getAttribute('data-rc-priority') || 0) <= -999
        ),
    );

    if (next) {
      container.insertBefore(style, next);
    } else {
      container.appendChild(style);
    }

    state.style = style;
    return style;
  }

  private flush(state: SheetState) {
    if (!state.dirty) {
      return;
    }
    state.dirty = false;

    const style = this.ensureStyle(state);
    if (!style || !style.sheet) {
      return;
    }

    const desired = Array.from(state.groups.values()).sort(compareGroup);

    // The first flush is always a single write: a fresh page accumulates every
    // group of the commit in one batch, which is cheaper to parse at once.
    if (state.applied.length === 0) {
      this.rebuild(state, style, desired);
      return;
    }

    const changedRules = this.countChangedRules(state, desired);
    if (
      changedRules > REBUILD_MIN_RULES &&
      changedRules > this.appliedRuleCount(state) * 0.5
    ) {
      this.rebuild(state, style, desired);
      return;
    }

    this.patch(state, style.sheet, desired);
  }

  private appliedRuleCount(state: SheetState) {
    let count = 0;
    state.appliedInfo.forEach((info) => {
      count += info.count;
    });
    return count;
  }

  private countChangedRules(state: SheetState, desired: GroupRecord[]) {
    let count = 0;
    const seen = new Set<string>();

    desired.forEach((group) => {
      seen.add(group.key);
      const info = state.appliedInfo.get(group.key);
      if (!info || info.version !== group.version) {
        count += group.rules.length;
      }
    });

    state.applied.forEach((key) => {
      if (!seen.has(key)) {
        count += state.appliedInfo.get(key)?.count || 0;
      }
    });

    return count;
  }

  private rebuild(
    state: SheetState,
    style: HTMLStyleElement,
    desired: GroupRecord[],
  ) {
    style.textContent = desired.map((group) => group.rules.join('')).join('');
    state.applied = desired.map((group) => group.key);
    state.appliedInfo = new Map(
      desired.map((group) => [
        group.key,
        { version: group.version, count: group.rules.length },
      ]),
    );
  }

  private patch(
    state: SheetState,
    sheet: CSSStyleSheet,
    desired: GroupRecord[],
  ) {
    // Drop groups that disappeared or whose content changed, from the end so
    // the earlier indices stay valid.
    const stale = new Set<string>();
    state.applied.forEach((key) => {
      const group = state.groups.get(key);
      if (!group || group.version !== state.appliedInfo.get(key)?.version) {
        stale.add(key);
      }
    });

    for (let i = state.applied.length - 1; i >= 0; i -= 1) {
      const key = state.applied[i];
      if (stale.has(key)) {
        const start = this.groupStart(state, i);
        const count = state.appliedInfo.get(key)?.count || 0;
        for (let j = 0; j < count; j += 1) {
          sheet.deleteRule(start);
        }
      }
    }

    const kept = new Set(state.applied.filter((key) => !stale.has(key)));
    let index = 0;
    const nextApplied: string[] = [];
    const nextInfo = new Map<string, AppliedInfo>();

    desired.forEach((group) => {
      const previous = kept.has(group.key)
        ? state.appliedInfo.get(group.key)
        : undefined;

      if (previous) {
        index += previous.count;
        nextInfo.set(group.key, previous);
      } else {
        let count = 0;
        group.rules.forEach((rule) => {
          if (this.insertRule(sheet, rule, index + count)) {
            count += 1;
          }
        });
        index += count;
        nextInfo.set(group.key, { version: group.version, count });
      }

      nextApplied.push(group.key);
    });

    state.applied = nextApplied;
    state.appliedInfo = nextInfo;
  }

  private groupStart(state: SheetState, position: number) {
    let start = 0;
    for (let i = 0; i < position; i += 1) {
      start += state.appliedInfo.get(state.applied[i])?.count || 0;
    }
    return start;
  }

  private insertRule(sheet: CSSStyleSheet, rule: string, index: number) {
    if (!rule.trim()) {
      return false;
    }

    try {
      sheet.insertRule(rule, index);
      return true;
    } catch (error) {
      // `innerHTML` silently drops invalid CSS, `insertRule` throws. Keep the
      // remaining rules working instead of losing the whole group.
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[cssinjs] Failed to insert rule:', rule, error);
      }
      return false;
    }
  }
}
