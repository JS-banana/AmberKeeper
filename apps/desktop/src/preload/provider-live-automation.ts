import type {
  ProviderLiveAutomationSpec,
  ProviderLiveProbeActionResult,
  ProviderLiveProbeHistoryItem,
  ProviderLiveProbeRequest,
} from '@amberkeeper/shared-types';

export interface ProviderLiveDomProbeResult {
  action: ProviderLiveProbeActionResult;
  availableHistoryItems: ProviderLiveProbeHistoryItem[];
  notes: string[];
}

export function runProviderLiveDomProbe(input: {
  request: ProviderLiveProbeRequest;
  spec: ProviderLiveAutomationSpec;
  root?: ParentNode;
}): ProviderLiveDomProbeResult {
  const root = input.root ?? document;
  const request = input.request;

  if (request.kind === 'new-message') {
    return {
      action: runNewMessageProbe(root, input.spec, request.promptText ?? ''),
      availableHistoryItems: [],
      notes: [],
    };
  }

  const { items, notes } = collectHistoryItems(root, input.spec, location.href);
  return {
    action: runHistoryClickProbe(root, input.spec, request.historyItemIndex ?? 0, items),
    availableHistoryItems: items,
    notes,
  };
}

function runNewMessageProbe(
  root: ParentNode,
  spec: ProviderLiveAutomationSpec,
  promptText: string
): ProviderLiveProbeActionResult {
  const composer = findInteractiveElement(root, spec.newMessage.readySelectors, spec.newMessage.composerSelectors);
  if (!composer) {
    return {
      ok: false,
      reason: 'No interactive composer element matched the provider automation spec.',
      selector: null,
      submitSelector: null,
    };
  }

  focusElement(composer.element);
  const writeResult = writePromptText(composer.element, promptText);
  if (!writeResult.ok) {
    return {
      ok: false,
      reason: writeResult.reason,
      selector: composer.selector,
      submitSelector: null,
    };
  }

  const submitStrategy = spec.newMessage.submitStrategy ?? 'button-or-enter';
  const sendButton = findInteractiveElement(root, spec.newMessage.readySelectors, spec.newMessage.sendButtonSelectors ?? []);
  if ((submitStrategy === 'button-only' || submitStrategy === 'button-or-enter') && sendButton) {
    clickElement(sendButton.element);
    return {
      ok: true,
      selector: composer.selector,
      submitSelector: sendButton.selector,
    };
  }

  const keyboardResult = submitComposer(composer.element, submitStrategy);
  if (!keyboardResult.ok) {
    return {
      ok: false,
      reason: keyboardResult.reason,
      selector: composer.selector,
      submitSelector: sendButton?.selector ?? null,
    };
  }

  return {
    ok: true,
    selector: composer.selector,
    submitSelector: sendButton?.selector ?? keyboardResult.submitSelector ?? null,
  };
}

function runHistoryClickProbe(
  _root: ParentNode,
  _spec: ProviderLiveAutomationSpec,
  historyItemIndex: number,
  items: ProviderLiveProbeHistoryItem[]
): ProviderLiveProbeActionResult {
  if (items.length === 0) {
    return {
      ok: false,
      reason: 'No eligible history items matched the provider automation spec.',
      historyItem: null,
    };
  }

  const index = clamp(historyItemIndex, 0, items.length - 1);
  const item = items[index];
  const element = resolveLiveHistoryElement(item.index);
  if (!element) {
    return {
      ok: false,
      reason: 'The selected history item is no longer attached to the page.',
      historyItem: item,
    };
  }

  clickElement(element);
  return {
    ok: true,
    historyItem: item,
  };
}

function collectHistoryItems(
  root: ParentNode,
  spec: ProviderLiveAutomationSpec,
  currentUrl: string
): { items: ProviderLiveProbeHistoryItem[]; notes: string[] } {
  const notes: string[] = [];
  const ignorePatterns = (spec.historyClick.ignoreTextPatterns ?? [])
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const unique = new Set<HTMLElement>();
  const items: ProviderLiveProbeHistoryItem[] = [];
  const maxItems = spec.historyClick.maxItems ?? 20;

  spec.historyClick.itemSelectors.forEach((selector) => {
    const nodes = queryElements(root, selector);
    if (nodes.length === 0) {
      notes.push(`no-match:${selector}`);
      return;
    }

    nodes.forEach((element) => {
      if (items.length >= maxItems || unique.has(element)) {
        return;
      }
      unique.add(element);

      const label = readElementLabel(element);
      const href = resolveElementHref(element);
      if (!label) {
        return;
      }
      if (href && normalizeHref(href) === normalizeHref(currentUrl)) {
        return;
      }
      if (ignorePatterns.some((pattern) => label.toLowerCase().includes(pattern))) {
        return;
      }
      if (!isVisibleElement(element)) {
        return;
      }

      registerLiveHistoryElement(items.length, element);
      items.push({
        index: items.length,
        label,
        href,
      });
    });
  });

  return {
    items,
    notes,
  };
}

function findInteractiveElement(
  root: ParentNode,
  readySelectors: string[] | undefined,
  selectors: string[]
): { selector: string; element: HTMLElement } | null {
  if (readySelectors?.length) {
    const ready = readySelectors.some((selector) => queryElements(root, selector).some(isVisibleElement));
    if (!ready) {
      return null;
    }
  }

  for (const selector of selectors) {
    const candidate = queryElements(root, selector).find(isInteractiveElement);
    if (candidate) {
      return {
        selector,
        element: candidate,
      };
    }
  }

  return null;
}

function writePromptText(
  element: HTMLElement,
  text: string
): { ok: boolean; reason?: string } {
  const normalized = text.trim();
  if (!normalized) {
    return {
      ok: false,
      reason: 'Prompt text was empty after trimming.',
    };
  }

  try {
    if (isInputLike(element)) {
      const prototype = Object.getPrototypeOf(element) as { constructor?: { prototype?: object } } | null;
      const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, 'value') : null;
      descriptor?.set?.call(element, normalized);
      if ('value' in element) {
        (element as HTMLInputElement | HTMLTextAreaElement).value = normalized;
      }
      dispatchTextInputEvents(element);
      return { ok: true };
    }

    if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') {
      element.textContent = normalized;
      dispatchTextInputEvents(element);
      return { ok: true };
    }
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    ok: false,
    reason: 'Selected composer element was not input-like or contenteditable.',
  };
}

function submitComposer(
  element: HTMLElement,
  strategy: ProviderLiveAutomationSpec['newMessage']['submitStrategy']
): { ok: boolean; reason?: string; submitSelector?: string } {
  focusElement(element);

  if (strategy === 'meta-enter') {
    dispatchKeyboardEnter(element, { metaKey: true });
    return { ok: true, submitSelector: 'keyboard:meta-enter' };
  }

  if (strategy === 'ctrl-enter') {
    dispatchKeyboardEnter(element, { ctrlKey: true });
    return { ok: true, submitSelector: 'keyboard:ctrl-enter' };
  }

  dispatchKeyboardEnter(element, {});
  return { ok: true, submitSelector: 'keyboard:enter' };
}

function dispatchTextInputEvents(element: HTMLElement): void {
  element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
}

function dispatchKeyboardEnter(
  element: HTMLElement,
  modifiers: { metaKey?: boolean; ctrlKey?: boolean }
): void {
  const init = {
    bubbles: true,
    cancelable: true,
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    metaKey: modifiers.metaKey ?? false,
    ctrlKey: modifiers.ctrlKey ?? false,
  };
  element.dispatchEvent(new KeyboardEvent('keydown', init));
  element.dispatchEvent(new KeyboardEvent('keypress', init));
  element.dispatchEvent(new KeyboardEvent('keyup', init));
}

function clickElement(element: HTMLElement): void {
  element.scrollIntoView({ block: 'center', inline: 'center' });
  focusElement(element);
  element.click();
}

function focusElement(element: HTMLElement): void {
  element.focus();
}

function queryElements(root: ParentNode, selector: string): HTMLElement[] {
  try {
    return Array.from(root.querySelectorAll(selector)) as HTMLElement[];
  } catch {
    return [];
  }
}

function isInteractiveElement(element: HTMLElement): boolean {
  return isVisibleElement(element) && (isInputLike(element) || element.isContentEditable || element.getAttribute('role') === 'textbox');
}

function isInputLike(element: HTMLElement): element is HTMLTextAreaElement | HTMLInputElement {
  return element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement;
}

function isVisibleElement(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' && rect.width >= 0 && rect.height >= 0;
}

function readElementLabel(element: HTMLElement): string {
  const text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
  if (text) {
    return text;
  }

  const ariaLabel = element.getAttribute('aria-label')?.trim();
  if (ariaLabel) {
    return ariaLabel;
  }

  return '';
}

function resolveElementHref(element: HTMLElement): string | null {
  if (element instanceof HTMLAnchorElement && element.href) {
    return element.href;
  }

  const anchor = element.querySelector('a[href]');
  return anchor instanceof HTMLAnchorElement ? anchor.href : null;
}

function normalizeHref(input: string): string {
  try {
    const url = new URL(input, location.href);
    return url.toString();
  } catch {
    return input;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function registerLiveHistoryElement(index: number, element: HTMLElement): void {
  element.dataset.amberkeeperLiveHistoryIndex = String(index);
}

function resolveLiveHistoryElement(index: number): HTMLElement | null {
  return document.querySelector(`[data-amberkeeper-live-history-index="${index}"]`) as HTMLElement | null;
}
