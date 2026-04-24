import type { Placement } from '@floating-ui/dom';
import { computePosition, autoUpdate, flip, shift, offset } from '@floating-ui/dom';

let instanceCounter = 0;

class DropdownMenu extends HTMLElement {
  public isOpen: boolean = false;

  private trigger: HTMLElement | null = null;
  private content: HTMLElement | null = null;
  private items: HTMLElement[] = [];

  private isSub: boolean = false;
  private initialized: boolean = false;
  private instanceId: string = '';

  private cleanupFloating: (() => void) | null = null;
  private hoverTimer: number | null = null;
  private lastHoverTarget: HTMLElement | null = null;
  private hoverRafId: number | null = null;
  private pendingHoverEvent: PointerEvent | null = null;
  private childObserver: MutationObserver | null = null;

  constructor() {
    super();
    this.handleDocumentClick = this.handleDocumentClick.bind(this);
    this.handleDocumentKeydown = this.handleDocumentKeydown.bind(this);
    this.updatePosition = this.updatePosition.bind(this);
  }

  connectedCallback(): void {
    if (this.initialized) {
      return;
    }

    if (this.childElementCount > 0) {
      this.init();
    } else {
      this.childObserver = new MutationObserver(() => {
        if (this.childElementCount > 0) {
          this.childObserver?.disconnect();
          this.childObserver = null;
          if (this.isConnected) {
            this.init();
          }
        }
      });
      this.childObserver.observe(this, { childList: true });
    }
  }

  disconnectedCallback(): void {
    this.removeGlobalListeners();

    if (this.hoverTimer) {
      window.clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
    if (this.hoverRafId) {
      cancelAnimationFrame(this.hoverRafId);
      this.hoverRafId = null;
    }
    if (this.cleanupFloating) {
      this.cleanupFloating();
      this.cleanupFloating = null;
    }
    if (this.childObserver) {
      this.childObserver.disconnect();
      this.childObserver = null;
    }

    this.initialized = false;
  }

  private init(): void {
    this.initialized = true;
    this.isSub = this.hasAttribute('data-is-sub');
    this.instanceId = `wpm-dm-${++instanceCounter}`;

    this.trigger =
      [
        ...this.querySelectorAll<HTMLElement>(
          '[data-slot="dropdown-menu-trigger"],[data-slot="dropdown-menu-sub-trigger"]',
        ),
      ].find((el) => el.closest('wpm-dropdown-menu') === this) ?? null;

    this.content =
      [...this.querySelectorAll<HTMLElement>('[data-slot="dropdown-menu-content"]')].find(
        (el) => el.closest('wpm-dropdown-menu') === this,
      ) ?? null;

    if (!this.trigger || !this.content) {
      return;
    }

    this.setupAria();
    this.addLocalListeners();
  }

  private setupAria(): void {
    if (!this.trigger || !this.content) {
      return;
    }

    if (!this.trigger.id) {
      this.trigger.id = `${this.instanceId}-trigger`;
    }
    if (!this.content.id) {
      this.content.id = `${this.instanceId}-content`;
    }

    this.trigger.setAttribute('aria-haspopup', 'menu');
    this.trigger.setAttribute('aria-controls', this.content.id);
    if (!this.trigger.hasAttribute('aria-expanded')) {
      this.trigger.setAttribute('aria-expanded', 'false');
    }

    this.content.setAttribute('role', 'menu');
    this.content.setAttribute('aria-labelledby', this.trigger.id);

    this.applyItemRoles();
  }

  private applyItemRoles(): void {
    if (!this.content) {
      return;
    }

    const allItems = this.content.querySelectorAll<HTMLElement>(
      '[data-slot$="-item"],[data-slot="dropdown-menu-sub-trigger"]',
    );

    allItems.forEach((item) => {
      if (item.closest('[data-slot="dropdown-menu-content"]') !== this.content) {
        return;
      }

      const slot = item.getAttribute('data-slot');
      switch (slot) {
        case 'dropdown-menu-checkbox-item':
          if (!item.hasAttribute('role')) {
            item.setAttribute('role', 'menuitemcheckbox');
          }
          break;
        case 'dropdown-menu-radio-item':
          if (!item.hasAttribute('role')) {
            item.setAttribute('role', 'menuitemradio');
          }
          break;
        default:
          if (!item.hasAttribute('role')) {
            item.setAttribute('role', 'menuitem');
          }
          break;
      }

      if (!item.hasAttribute('tabindex')) {
        item.setAttribute('tabindex', '-1');
      }
    });

    const radioGroups = this.content.querySelectorAll<HTMLElement>(
      '[data-slot="dropdown-menu-radio-group"]',
    );
    radioGroups.forEach((group) => {
      if (
        group.closest('[data-slot="dropdown-menu-content"]') === this.content &&
        !group.hasAttribute('role')
      ) {
        group.setAttribute('role', 'group');
      }
    });
  }

  private addLocalListeners(): void {
    if (!this.trigger || !this.content) {
      return;
    }

    this.trigger.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggle();
    });

    this.trigger.addEventListener('keydown', (e: KeyboardEvent) => {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        this.open(e.key === 'ArrowUp' ? this.items.length - 1 : 0);
      }
      if (this.isSub && e.key === 'ArrowLeft') {
        e.preventDefault();
        this.close(true);
      }
      if (this.isSub && e.key === 'ArrowRight') {
        e.preventDefault();
        this.open();
      }
    });

    this.content.addEventListener('animationend', () => {
      if (this.content?.getAttribute('data-state') === 'closed') {
        this.content.classList.add('hidden');
      }
    });

    this.content.addEventListener('click', (e: MouseEvent) => {
      this.handleContentClick(e);
    });
    this.content.addEventListener('keydown', (e: KeyboardEvent) => {
      this.handleContentKeydown(e);
    });

    this.content.addEventListener('pointerover', (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        return;
      }
      this.handleContentHover(e);
    });

    this.content.addEventListener('pointerenter', (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        return;
      }
      if (this.isSub) {
        this.dispatchEvent(new CustomEvent('wpm-cancel-close', { bubbles: true }));
      }
    });

    this.addEventListener('wpm-cancel-close', (e: Event) => {
      if (e.target !== this && this.hoverTimer) {
        window.clearTimeout(this.hoverTimer);
      }
    });

    this.addEventListener('wpm-dropdown-close', (e: Event) => {
      if (e.target !== this) {
        this.close();
      }
    });
  }

  private updatePosition(): void {
    if (!this.trigger || !this.content) {
      return;
    }

    const alignAttr = this.content.getAttribute('data-align') || 'center';
    const sideOffset = parseInt(this.content.getAttribute('data-side-offset') || '4', 10);

    let placement: Placement = 'bottom';
    if (alignAttr === 'start') {
      placement = 'bottom-start';
    }
    if (alignAttr === 'end') {
      placement = 'bottom-end';
    }
    if (this.isSub) {
      placement = 'right-start';
    }

    void computePosition(this.trigger, this.content, {
      placement,
      strategy: 'fixed',
      middleware: [offset(sideOffset), flip(), shift({ padding: 8 })],
    }).then(({ x, y }) => {
      if (!this.content) {
        return;
      }

      Object.assign(this.content.style, {
        top: `${Math.round(y)}px`,
        left: `${Math.round(x)}px`,
        position: 'fixed',
      });

      if (this.content.style.visibility === 'hidden') {
        this.content.style.visibility = '';
      }
    });
  }

  private refreshItems(): void {
    if (!this.content) {
      return;
    }

    this.items = [
      ...this.content.querySelectorAll<HTMLElement>(
        '[data-slot$="-item"]:not([data-disabled="true"]),[data-slot="dropdown-menu-sub-trigger"]:not([data-disabled="true"])',
      ),
    ].filter((item) => item.closest('[data-slot="dropdown-menu-content"]') === this.content);
  }

  private getActiveSubmenus(): DropdownMenu[] {
    if (!this.content) {
      return [];
    }

    return [...this.content.querySelectorAll<DropdownMenu>('wpm-dropdown-menu')].filter(
      (sub) => sub.closest('[data-slot="dropdown-menu-content"]') === this.content,
    );
  }

  private closeSubmenus(exceptSubmenu?: DropdownMenu | null): void {
    this.getActiveSubmenus().forEach((sub) => {
      if (sub !== exceptSubmenu && sub.isOpen) {
        sub.close();
      }
    });
  }

  private handleContentHover(e: PointerEvent): void {
    this.pendingHoverEvent = e;

    if (!this.hoverRafId) {
      this.hoverRafId = requestAnimationFrame(() => {
        this.hoverRafId = null;
        if (this.pendingHoverEvent) {
          this.processHover(this.pendingHoverEvent);
          this.pendingHoverEvent = null;
        }
      });
    }
  }

  private processHover(e: PointerEvent): void {
    if (!(e.target instanceof HTMLElement)) {
      return;
    }

    if (this.lastHoverTarget === e.target) {
      return;
    }
    this.lastHoverTarget = e.target;

    const item = e.target.closest<HTMLElement>(
      '[data-slot$="-item"],[data-slot="dropdown-menu-sub-trigger"]',
    );
    if (!item || item.getAttribute('data-disabled') === 'true') {
      return;
    }
    if (item.closest('[data-slot="dropdown-menu-content"]') !== this.content) {
      return;
    }

    if (item !== document.activeElement) {
      item.focus({ preventScroll: true });
    }

    if (this.hoverTimer) {
      window.clearTimeout(this.hoverTimer);
    }

    const isSubTrigger = item.getAttribute('data-slot') === 'dropdown-menu-sub-trigger';

    if (isSubTrigger) {
      this.hoverTimer = window.setTimeout(() => {
        const sub = item.closest<DropdownMenu>('wpm-dropdown-menu');
        this.closeSubmenus(sub);
        sub?.open(0);
      }, 100);
    } else {
      const hasOpenSubmenu = this.getActiveSubmenus().some((sub) => sub.isOpen);

      if (hasOpenSubmenu) {
        this.hoverTimer = window.setTimeout(() => {
          this.closeSubmenus();
        }, 150);
      } else {
        this.closeSubmenus();
      }
    }
  }

  private handleContentClick(e: MouseEvent): void {
    if (!(e.target instanceof HTMLElement)) {
      return;
    }

    const item = e.target.closest<HTMLElement>(
      '[data-slot$="-item"],[data-slot="dropdown-menu-sub-trigger"]',
    );
    if (!item || item.getAttribute('data-disabled') === 'true') {
      return;
    }

    const slotType = item.getAttribute('data-slot');

    if (slotType === 'dropdown-menu-checkbox-item') {
      const isChecked = item.getAttribute('data-state') === 'checked';
      item.setAttribute('data-state', isChecked ? 'unchecked' : 'checked');
      item.setAttribute('aria-checked', (!isChecked).toString());
    } else if (slotType === 'dropdown-menu-radio-item') {
      const group = item.closest('[data-slot="dropdown-menu-radio-group"]');
      if (group) {
        group.querySelectorAll('[data-slot="dropdown-menu-radio-item"]').forEach((sibling) => {
          sibling.setAttribute('data-state', 'unchecked');
          sibling.setAttribute('aria-checked', 'false');
        });
      }
      item.setAttribute('data-state', 'checked');
      item.setAttribute('aria-checked', 'true');
    }

    if (slotType === 'dropdown-menu-sub-trigger') {
      const sub = item.closest<DropdownMenu>('wpm-dropdown-menu');
      sub?.open(0);
      return;
    }

    this.close(true);
    this.dispatchEvent(new CustomEvent('wpm-dropdown-close', { bubbles: true }));
  }

  private handleContentKeydown(e: KeyboardEvent): void {
    if (!(document.activeElement instanceof HTMLElement)) {
      return;
    }

    const activeElement = document.activeElement;
    const currentIndex = this.items.indexOf(activeElement);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        e.stopPropagation();
        this.focusNext(currentIndex, 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        e.stopPropagation();
        this.focusNext(currentIndex, -1);
        break;
      case 'ArrowRight':
        if (activeElement.getAttribute('data-slot') === 'dropdown-menu-sub-trigger') {
          e.preventDefault();
          e.stopPropagation();
          activeElement.closest<DropdownMenu>('wpm-dropdown-menu')?.open(0);
        }
        break;
      case 'ArrowLeft':
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this.close(true);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        e.stopPropagation();
        activeElement.click();
        break;
    }
  }

  private focusNext(currentIndex: number, direction: number): void {
    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) {
      nextIndex = this.items.length - 1;
    }
    if (nextIndex >= this.items.length) {
      nextIndex = 0;
    }
    this.items[nextIndex]?.focus({ preventScroll: true });
  }

  private handleDocumentClick(e: MouseEvent): void {
    if (!(e.target instanceof Node)) {
      return;
    }

    if (
      this.isOpen &&
      !this.contains(e.target) &&
      this.content &&
      !this.content.contains(e.target)
    ) {
      this.close();
    }
  }

  private handleDocumentKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.close(true);
    }
  }

  private toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  public open(focusIndex: number = 0): void {
    if (!this.content || !this.trigger) {
      return;
    }

    this.isOpen = true;
    this.lastHoverTarget = null;
    this.content.style.overflow = '';

    // Prevent 1-frame position flash before Floating UI resolves
    this.content.style.visibility = 'hidden';
    this.content.classList.remove('hidden');

    this.cleanupFloating = autoUpdate(this.trigger, this.content, this.updatePosition);

    this.trigger.setAttribute('data-state', 'open');
    this.trigger.setAttribute('aria-expanded', 'true');
    this.content.setAttribute('data-state', 'open');

    this.refreshItems();

    document.addEventListener('click', this.handleDocumentClick, true);
    document.addEventListener('keydown', this.handleDocumentKeydown);

    if (this.items[focusIndex]) {
      this.items[focusIndex].focus({ preventScroll: true });
    }
  }

  public close(returnFocus: boolean = false): void {
    if (!this.isOpen || !this.content || !this.trigger) {
      return;
    }
    this.isOpen = false;

    if (this.hoverTimer) {
      window.clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
    if (this.hoverRafId) {
      cancelAnimationFrame(this.hoverRafId);
      this.hoverRafId = null;
    }
    if (this.cleanupFloating) {
      this.cleanupFloating();
      this.cleanupFloating = null;
    }

    this.content.style.overflow = 'hidden';

    this.trigger.setAttribute('data-state', 'closed');
    this.trigger.setAttribute('aria-expanded', 'false');
    this.content.setAttribute('data-state', 'closed');

    // Fallback for "prefers-reduced-motion" or disabled animations
    const styles = getComputedStyle(this.content);
    const hasAnimation =
      styles.animationName !== 'none' && parseFloat(styles.animationDuration) > 0;

    if (!hasAnimation) {
      this.content.classList.add('hidden');
    }

    this.closeSubmenus();
    this.removeGlobalListeners();

    if (returnFocus) {
      this.trigger.focus({ preventScroll: true });
    }
  }

  private removeGlobalListeners(): void {
    document.removeEventListener('click', this.handleDocumentClick, true);
    document.removeEventListener('keydown', this.handleDocumentKeydown);
  }
}

if (!customElements.get('wpm-dropdown-menu')) {
  customElements.define('wpm-dropdown-menu', DropdownMenu);
}

export type { DropdownMenu };
