class Select extends HTMLElement {
  private trigger: HTMLElement | null = null;
  private content: HTMLElement | null = null;
  private valueNode: HTMLElement | null = null;
  private hiddenInput: HTMLInputElement | null = null;

  private items: HTMLElement[] = [];
  private isOpen: boolean = false;
  private ticking: boolean = false;

  constructor() {
    super();
    this.handleDocumentClick = this.handleDocumentClick.bind(this);
    this.handleScrollOrResize = this.handleScrollOrResize.bind(this);
  }

  connectedCallback(): void {
    queueMicrotask(() => {
      this.init();
    });
  }

  disconnectedCallback(): void {
    if (this.content && this.content.parentNode === document.body) {
      document.body.removeChild(this.content);
    }
    this.removeGlobalListeners();
  }

  private init(): void {
    this.trigger = this.querySelector<HTMLElement>('[data-slot="select-trigger"]');
    this.content = this.querySelector<HTMLElement>('[data-slot="select-content"]');
    this.valueNode = this.querySelector<HTMLElement>('[data-slot="select-value"]');
    this.hiddenInput = this.querySelector<HTMLInputElement>('[data-slot="select-hidden-input"]');

    if (this.content && this.content.parentElement === this) {
      document.body.appendChild(this.content);
    }

    this.items = this.content
      ? [...this.content.querySelectorAll<HTMLElement>('[data-slot="select-item"]')]
      : [];

    const defaultVal = this.getAttribute('data-default-value');
    if (defaultVal) {
      const activeItem = this.items.find((i) => i.getAttribute('data-value') === defaultVal);
      if (activeItem) {
        this.updateDOMState(activeItem);
      }
    }

    if (!this.trigger || !this.content) {
      return;
    }

    this.trigger.addEventListener('pointerdown', () => {
      this.trigger?.focus({ preventScroll: true });
    });

    this.trigger.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault();
      this.toggle();
    });

    this.trigger.addEventListener('keydown', (e: KeyboardEvent) => {
      this.handleTriggerKey(e);
    });

    this.items.forEach((item, index) => {
      item.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        if (!item.hasAttribute('data-disabled')) {
          this.selectItem(item);
        }
      });

      item.addEventListener('keydown', (e: KeyboardEvent) => {
        this.handleItemKey(e, index);
      });

      item.addEventListener('mouseenter', () => {
        if (!item.hasAttribute('data-disabled')) {
          item.focus({ preventScroll: true });
        }
      });
    });

    this.content.addEventListener('animationend', () => {
      if (this.content?.getAttribute('data-state') === 'closed') {
        this.content.classList.add('hidden');
      }
    });
  }

  private handleScrollOrResize(): void {
    if (!this.ticking) {
      window.requestAnimationFrame(() => {
        this.reposition();
        this.ticking = false;
      });
      this.ticking = true;
    }
  }

  private reposition(): void {
    if (!this.isOpen || !this.trigger || !this.content) {
      return;
    }

    const rect = this.trigger.getBoundingClientRect();
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollX = window.scrollX || document.documentElement.scrollLeft;

    this.content.style.top = `${rect.bottom + scrollY + 4}px`;
    this.content.style.left = `${rect.left + scrollX}px`;
    this.content.style.width = `${rect.width}px`;
    this.content.style.setProperty('--radix-select-trigger-width', `${rect.width}px`);
  }

  private handleDocumentClick(e: MouseEvent): void {
    const target = e.target as Node;

    if (this.isOpen && !this.contains(target) && this.content && !this.content.contains(target)) {
      this.close();
    }
  }

  private addGlobalListeners(): void {
    document.addEventListener('click', this.handleDocumentClick);
    window.addEventListener('resize', this.handleScrollOrResize);
    window.addEventListener('scroll', this.handleScrollOrResize, true);
  }

  private removeGlobalListeners(): void {
    document.removeEventListener('click', this.handleDocumentClick);
    window.removeEventListener('resize', this.handleScrollOrResize);
    window.removeEventListener('scroll', this.handleScrollOrResize, true);
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
    if (!this.content || !this.trigger) {
      return;
    }

    this.isOpen = true;

    this.content.classList.remove('hidden');
    this.reposition();
    void this.content.offsetWidth;

    this.trigger.setAttribute('data-state', 'open');
    this.trigger.setAttribute('aria-expanded', 'true');
    this.content.setAttribute('data-state', 'open');

    this.addGlobalListeners();

    const selected =
      this.items.find((i) => i.getAttribute('data-state') === 'checked') ??
      this.items.find((i) => !i.hasAttribute('data-disabled'));

    if (selected) {
      selected.focus({ preventScroll: true });
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  private close(returnFocus: boolean = false): void {
    if (!this.content || !this.trigger) {
      return;
    }

    this.isOpen = false;
    this.trigger.setAttribute('data-state', 'closed');
    this.trigger.setAttribute('aria-expanded', 'false');
    this.content.setAttribute('data-state', 'closed');

    this.removeGlobalListeners();

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
      this.hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  private updateDOMState(item: HTMLElement): void {
    const val = item.getAttribute('data-value') || '';
    const textNode = item.querySelector('[data-slot="select-item-text"]');
    const text = textNode ? textNode.textContent?.trim() : item.textContent?.trim();

    if (this.valueNode) {
      this.valueNode.textContent = text || '';
      this.valueNode.removeAttribute('data-placeholder');
      this.trigger?.removeAttribute('data-placeholder');
    }

    if (this.hiddenInput) {
      this.hiddenInput.value = val;
    }
    this.setAttribute('data-value', val);

    this.items.forEach((i) => {
      const isSelected = i === item;
      i.setAttribute('data-state', isSelected ? 'checked' : 'unchecked');
      i.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });
  }

  private handleTriggerKey(e: KeyboardEvent): void {
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      this.open();
    }
  }

  private handleItemKey(e: KeyboardEvent, index: number): void {
    if (['Enter', ' '].includes(e.key)) {
      e.preventDefault();
      this.selectItem(this.items[index]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.close(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.focusNext(index, 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.focusNext(index, -1);
    }
  }

  private focusNext(currentIndex: number, dir: number): void {
    let next = currentIndex + dir;
    while (next >= 0 && next < this.items.length) {
      if (!this.items[next].hasAttribute('data-disabled')) {
        this.items[next].focus({ preventScroll: true });
        this.items[next].scrollIntoView({ block: 'nearest' });
        return;
      }
      next += dir;
    }
  }
}

if (!customElements.get('wpm-select')) {
  customElements.define('wpm-select', Select);
}

export type { Select };
