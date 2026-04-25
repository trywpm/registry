import { computePosition, autoUpdate, offset, flip, size } from '@floating-ui/dom';

class Select extends HTMLElement {
  private trigger: HTMLElement | null = null;
  private content: HTMLElement | null = null;
  private valueNode: HTMLElement | null = null;
  private hiddenInput: HTMLInputElement | null = null;

  private isOpen = false;
  private cleanupFloating: (() => void) | null = null;
  private abortController: AbortController | null = null;

  private typeaheadBuffer = '';
  private typeaheadTimeout: number | null = null;

  connectedCallback(): void {
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    const idleCallback = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));
    idleCallback(() => this.init());
  }

  disconnectedCallback(): void {
    this.close();
    if (this.abortController) {
      this.abortController.abort();
    }
    if (this.content?.parentNode === document.body) {
      document.body.removeChild(this.content);
    }
  }

  private init(): void {
    if (this.abortController) {
      this.abortController.abort();
    }

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    this.trigger = this.querySelector<HTMLElement>('[data-slot="select-trigger"]');
    this.content = this.querySelector<HTMLElement>('[data-slot="select-content"]');
    this.valueNode = this.querySelector<HTMLElement>('[data-slot="select-value"]');
    this.hiddenInput = this.querySelector<HTMLInputElement>('[data-slot="select-hidden-input"]');

    if (!this.trigger || !this.content) {
      return;
    }

    this.content.id = `select-content-${Math.random().toString(36).slice(2, 9)}`;
    this.trigger.setAttribute('aria-controls', this.content.id);

    if (this.content.parentElement === this) {
      document.body.appendChild(this.content);
    }

    const defaultVal = this.getAttribute('data-default-value');
    if (defaultVal) {
      const activeItem = this.content.querySelector<HTMLElement>(`[data-value="${defaultVal}"]`);
      if (activeItem) {
        this.updateDOMState(activeItem);
      }
    }

    this.trigger.addEventListener(
      'pointerdown',
      () => this.trigger?.focus({ preventScroll: true }),
      { signal },
    );

    this.trigger.addEventListener(
      'click',
      (e: MouseEvent) => {
        e.preventDefault();
        this.toggle();
      },
      { signal },
    );

    this.trigger.addEventListener('keydown', this.handleTriggerKey, { signal });
    this.content.addEventListener('click', this.handleContentClick, { signal });
    this.content.addEventListener('keydown', this.handleContentKey, { signal });
    this.content.addEventListener('pointermove', this.handleContentHover, {
      signal,
    });

    this.content.addEventListener(
      'animationend',
      () => {
        if (this.content?.getAttribute('data-state') === 'closed') {
          this.content.style.display = 'none';
        }
      },
      { signal },
    );
  }

  private handleDocumentClick = (e: MouseEvent): void => {
    if (!this.isOpen) {
      return;
    }

    if (!(e.target instanceof Node)) {
      return;
    }

    if (!this.contains(e.target) && !this.content?.contains(e.target)) {
      this.close();
    }
  };

  private handleContentClick = (e: MouseEvent): void => {
    if (!(e.target instanceof Element)) {
      return;
    }

    const item = e.target.closest<HTMLElement>('[data-slot="select-item"]');
    if (item && !item.hasAttribute('data-disabled')) {
      e.stopPropagation();
      this.selectItem(item);
    }
  };

  private handleContentHover = (e: PointerEvent): void => {
    if (e.pointerType === '') {
      return;
    }

    if (!(e.target instanceof Element)) {
      return;
    }

    const item = e.target.closest<HTMLElement>('[data-slot="select-item"]');
    if (item && !item.hasAttribute('data-disabled') && document.activeElement !== item) {
      item.focus({ preventScroll: true });
    }
  };

  private handleTriggerKey = (e: KeyboardEvent): void => {
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      this.open();
    } else {
      this.handleTypeahead(e);
    }
  };

  private handleContentKey = (e: KeyboardEvent): void => {
    if (!(e.target instanceof Element)) {
      return;
    }

    const item = e.target.closest<HTMLElement>('[data-slot="select-item"]');
    if (!item) {
      return;
    }

    if (['Enter', ' '].includes(e.key)) {
      e.preventDefault();
      this.selectItem(item);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.close(true);
    } else if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      this.focusNext(item, e.key === 'ArrowDown' ? 1 : -1);
    } else {
      this.handleTypeahead(e);
    }
  };

  private handleTypeahead(e: KeyboardEvent): void {
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }

    e.preventDefault();
    this.typeaheadBuffer += e.key.toLowerCase();

    if (this.typeaheadTimeout != null) {
      window.clearTimeout(this.typeaheadTimeout);
    }

    this.typeaheadTimeout = window.setTimeout(() => {
      this.typeaheadBuffer = '';
    }, 500);

    if (!this.content) {
      return;
    }

    const items = [
      ...this.content.querySelectorAll<HTMLElement>(
        '[data-slot="select-item"]:not([data-disabled])',
      ),
    ];

    const match = items.find((item) => {
      const text = item.textContent.trim().toLowerCase() || '';
      return text.startsWith(this.typeaheadBuffer);
    });

    if (match) {
      match.focus({ preventScroll: true });
      match.scrollIntoView({ block: 'nearest' });
    }
  }

  private focusNext(current: HTMLElement, dir: 1 | -1): void {
    if (!this.content) {
      return;
    }

    const items = [
      ...this.content.querySelectorAll<HTMLElement>(
        '[data-slot="select-item"]:not([data-disabled])',
      ),
    ];

    const currentIndex = items.indexOf(current);
    if (currentIndex === -1) {
      return;
    }

    const nextItem = items[currentIndex + dir];
    nextItem.focus({ preventScroll: true });
    nextItem.scrollIntoView({ block: 'nearest' });
  }

  private toggle(): void {
    if (this.hasAttribute('data-disabled')) {
      return;
    }

    if (this.isOpen) {
      this.close(true);
    } else {
      this.open();
    }
  }

  private open(): void {
    if (!this.content || !this.trigger || this.isOpen) {
      return;
    }

    this.isOpen = true;

    const contentEl = this.content;
    const triggerEl = this.trigger;

    contentEl.style.display = 'block';
    contentEl.style.opacity = '0';

    document.addEventListener('click', this.handleDocumentClick, {
      signal: this.abortController?.signal,
    });

    this.cleanupFloating = autoUpdate(triggerEl, contentEl, () => {
      void computePosition(triggerEl, contentEl, {
        placement: 'bottom-start',
        middleware: [
          offset(4),
          flip(),
          size({
            apply: ({ rects, elements }) => {
              elements.floating.style.setProperty(
                '--wpm-select-trigger-width',
                `${rects.reference.width}px`,
              );
            },
          }),
        ],
      }).then(({ x, y, placement }) => {
        Object.assign(contentEl.style, { left: `${x}px`, top: `${y}px`, opacity: '' });
        contentEl.setAttribute('data-side', placement.split('-')[0]);

        triggerEl.setAttribute('data-state', 'open');
        triggerEl.setAttribute('aria-expanded', 'true');
        contentEl.setAttribute('data-state', 'open');

        const selected =
          contentEl.querySelector<HTMLElement>('[data-state="checked"]') ??
          contentEl.querySelector<HTMLElement>('[data-slot="select-item"]:not([data-disabled])');
        if (selected) {
          selected.focus({ preventScroll: true });
          selected.scrollIntoView({ block: 'nearest' });
        }
      });
    });
  }

  private close(returnFocus = false): void {
    if (!this.content || !this.trigger || !this.isOpen) {
      return;
    }

    this.isOpen = false;

    this.trigger.setAttribute('data-state', 'closed');
    this.trigger.setAttribute('aria-expanded', 'false');
    this.content.setAttribute('data-state', 'closed');

    document.removeEventListener('click', this.handleDocumentClick);

    if (this.cleanupFloating) {
      this.cleanupFloating();
      this.cleanupFloating = null;
    }

    if (returnFocus) {
      this.trigger.focus({ preventScroll: true });
    }
  }

  public selectItem(item: HTMLElement): void {
    this.updateDOMState(item);
    this.close(true);

    const val = item.getAttribute('data-value') || '';
    this.dispatchEvent(new CustomEvent('change', { detail: { value: val } }));

    if (this.hiddenInput) {
      this.hiddenInput.value = val;
      this.hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  private updateDOMState(item: HTMLElement): void {
    const val = item.getAttribute('data-value') || '';
    const textNode = item.querySelector('[data-slot="select-item-text"]');
    const text = textNode ? textNode.textContent.trim() : item.textContent.trim();

    if (this.valueNode) {
      this.valueNode.textContent = text || '';
      this.valueNode.removeAttribute('data-placeholder');
      this.trigger?.removeAttribute('data-placeholder');
    }

    this.setAttribute('data-value', val);

    if (this.content) {
      const prev = this.content.querySelector('[data-state="checked"]');
      if (prev) {
        prev.setAttribute('data-state', 'unchecked');
        prev.setAttribute('aria-selected', 'false');
      }
    }

    item.setAttribute('data-state', 'checked');
    item.setAttribute('aria-selected', 'true');
  }
}

if (!customElements.get('wpm-select')) {
  customElements.define('wpm-select', Select);
}
