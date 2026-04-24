import type { Placement } from '@floating-ui/dom';
import { computePosition, autoUpdate, flip, shift, offset, size } from '@floating-ui/dom';

let instanceCounter = 0;

const activeScrollContainers = new Set<HTMLElement>();

const preventGlobalScroll = (e: Event) => {
  const path = e.composedPath();

  if (path.length > 0) {
    for (const el of path) {
      if (!(el instanceof HTMLElement)) {
        continue;
      }

      if (activeScrollContainers.has(el)) {
        return;
      }
    }
  }

  if (e.cancelable) {
    e.preventDefault();
  }
};

const preventGlobalKeyScroll = (e: KeyboardEvent) => {
  const keys = ['ArrowUp', 'ArrowDown', ' ', 'PageUp', 'PageDown', 'Home', 'End'];
  if (!keys.includes(e.key)) {
    return;
  }

  const path = e.composedPath();
  for (const el of path) {
    if (!(el instanceof HTMLElement)) {
      continue;
    }

    if (activeScrollContainers.has(el)) {
      return;
    }
  }

  if (e.cancelable) {
    e.preventDefault();
  }
};

const lockScroll = (containerEl: HTMLElement) => {
  if (activeScrollContainers.size === 0) {
    window.addEventListener('wheel', preventGlobalScroll, { passive: false });
    window.addEventListener('touchmove', preventGlobalScroll, { passive: false });
    window.addEventListener('keydown', preventGlobalKeyScroll, { passive: false });
  }

  activeScrollContainers.add(containerEl);
};

const unlockScroll = (containerEl: HTMLElement) => {
  activeScrollContainers.delete(containerEl);

  if (activeScrollContainers.size === 0) {
    window.removeEventListener('wheel', preventGlobalScroll);
    window.removeEventListener('touchmove', preventGlobalScroll);
    window.removeEventListener('keydown', preventGlobalKeyScroll);
  }
};

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
  private localEventsController: AbortController | null = null;

  private pendingFocusIndex: number | null = null;

  private cachedAlign: string = 'center';
  private cachedSideOffset: number = 4;

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

    const hasRequiredElements =
      this.querySelector(
        '[data-slot="dropdown-menu-trigger"], [data-slot="dropdown-menu-sub-trigger"]',
      ) && this.querySelector('[data-slot="dropdown-menu-content"]');

    if (hasRequiredElements) {
      this.init();
    } else {
      this.childObserver = new MutationObserver(() => {
        const trigger = this.querySelector(
          '[data-slot="dropdown-menu-trigger"], [data-slot="dropdown-menu-sub-trigger"]',
        );
        const content = this.querySelector('[data-slot="dropdown-menu-content"]');

        if (trigger && content) {
          this.childObserver?.disconnect();
          this.childObserver = null;
          if (this.isConnected) {
            this.init();
          }
        }
      });

      this.childObserver.observe(this, { childList: true, subtree: true });
    }
  }

  disconnectedCallback(): void {
    this.removeGlobalListeners();

    this.localEventsController?.abort();
    this.localEventsController = null;

    if (this.isOpen && this.content) {
      unlockScroll(this.content);
    }

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

    this.localEventsController?.abort();
    this.localEventsController = new AbortController();
    const { signal } = this.localEventsController;

    this.trigger.addEventListener(
      'click',
      (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggle();
      },
      { signal },
    );

    this.trigger.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        if (!this.isSub) {
          if (['Enter', ' ', 'ArrowDown'].includes(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            this.open(0);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            this.open(-1);
          }
        } else if (['Enter', ' ', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          this.open(0);
        }
      },
      { signal },
    );

    this.content.addEventListener(
      'animationend',
      () => {
        if (this.content?.getAttribute('data-state') === 'closed') {
          this.content.classList.add('hidden');
        }
      },
      { signal },
    );

    this.content.addEventListener(
      'click',
      (e: MouseEvent) => {
        this.handleContentClick(e);
      },
      { signal },
    );

    this.content.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        this.handleContentKeydown(e);
      },
      { signal },
    );

    this.content.addEventListener(
      'pointermove',
      (e: PointerEvent) => {
        if (e.pointerType === 'touch') {
          return;
        }
        if (e.movementX === 0 && e.movementY === 0) {
          return;
        }
        this.handleContentHover(e);
      },
      { signal },
    );

    this.content.addEventListener(
      'pointerenter',
      (e: PointerEvent) => {
        if (e.pointerType === 'touch') {
          return;
        }
        if (this.isSub) {
          this.dispatchEvent(new CustomEvent('wpm-cancel-close', { bubbles: true }));
        }
      },
      { signal },
    );

    this.addEventListener(
      'wpm-cancel-close',
      (e: Event) => {
        if (e.target !== this && this.hoverTimer) {
          window.clearTimeout(this.hoverTimer);
        }
      },
      { signal },
    );

    this.addEventListener(
      'wpm-dropdown-close',
      (e: Event) => {
        if (e.target !== this) {
          this.close(true);
        }
      },
      { signal },
    );
  }

  private updatePosition(): void {
    if (!this.trigger || !this.content) {
      return;
    }

    let desiredPlacement: Placement = 'bottom';
    if (this.cachedAlign === 'start') {
      desiredPlacement = 'bottom-start';
    } else if (this.cachedAlign === 'end') {
      desiredPlacement = 'bottom-end';
    }

    if (this.isSub) {
      desiredPlacement = 'right-start';
    }

    void computePosition(this.trigger, this.content, {
      placement: desiredPlacement,
      strategy: 'fixed',
      middleware: [
        offset(this.cachedSideOffset),
        flip(),
        shift({ padding: 8 }),
        size({
          padding: 8,
          apply: ({ rects, availableHeight, elements }) => {
            elements.floating.style.setProperty(
              '--wpm-dropdown-menu-content-available-height',
              `${availableHeight}px`,
            );

            elements.floating.style.setProperty(
              '--wpm-dropdown-menu-trigger-width',
              `${rects.reference.width}px`,
            );
          },
        }),
      ],
    }).then(({ x, y, placement }) => {
      if (!this.content) {
        return;
      }

      const [side, alignment] = placement.split('-');

      let originX = 'center';
      let originY = 'center';

      if (side === 'bottom') {
        originY = 'top';
      } else if (side === 'top') {
        originY = 'bottom';
      } else if (side === 'left') {
        originX = 'right';
      } else if (side === 'right') {
        originX = 'left';
      }

      if (alignment === 'start') {
        if (side === 'top' || side === 'bottom') {
          originX = 'left';
        } else {
          originY = 'top';
        }
      } else if (alignment === 'end') {
        if (side === 'top' || side === 'bottom') {
          originX = 'right';
        } else {
          originY = 'bottom';
        }
      }

      Object.assign(this.content.style, {
        top: `${Math.round(y)}px`,
        left: `${Math.round(x)}px`,
        position: 'fixed',
      });

      this.content.style.setProperty(
        '--wpm-dropdown-menu-content-transform-origin',
        `${originX} ${originY}`,
      );

      this.content.setAttribute('data-side', side);

      if (this.content.style.visibility === 'hidden') {
        this.content.style.visibility = '';

        if (this.pendingFocusIndex != null && this.items[this.pendingFocusIndex]) {
          const targetItem = this.items[this.pendingFocusIndex];

          targetItem.focus({ preventScroll: true });
          targetItem.scrollIntoView({ block: 'nearest' });
          this.pendingFocusIndex = null;
        }
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
    if (!this.isOpen) {
      return;
    }

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
        sub?.open(null);
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
      case 'ArrowLeft':
        if (this.isSub) {
          e.preventDefault();
          e.stopPropagation();
          this.close(true);
        }
        break;
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
    if (this.items.length === 0) {
      return;
    }

    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) {
      nextIndex = this.items.length - 1;
    }

    if (nextIndex >= this.items.length) {
      nextIndex = 0;
    }

    this.closeSubmenus();

    const nextItem = this.items[nextIndex];

    nextItem.focus({ preventScroll: true });
    nextItem.scrollIntoView({ block: 'nearest' });
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
      const hasOpenSubmenu = this.getActiveSubmenus().some((sub) => sub.isOpen);
      if (!hasOpenSubmenu) {
        this.close(true);
      }
    } else if (e.key === 'Tab') {
      this.close(false);
    }
  }

  private toggle(): void {
    if (this.isOpen) {
      this.close(false);
    } else {
      this.trigger?.focus({ preventScroll: true });
      this.open(null);
    }
  }

  public open(focusIndex: number | null = null): void {
    if (!this.content || !this.trigger) {
      return;
    }

    if (!this.isOpen) {
      this.isOpen = true;

      this.cachedAlign = this.content.getAttribute('data-align') || 'center';
      this.cachedSideOffset = parseInt(this.content.getAttribute('data-side-offset') || '4', 10);

      lockScroll(this.content);

      this.lastHoverTarget = null;
      this.content.style.overflow = '';
      this.content.style.overscrollBehavior = 'contain';

      this.content.style.visibility = 'hidden';
      this.content.classList.remove('hidden');

      this.cleanupFloating = autoUpdate(this.trigger, this.content, this.updatePosition);

      this.trigger.setAttribute('data-state', 'open');
      this.trigger.setAttribute('aria-expanded', 'true');
      this.content.setAttribute('data-state', 'open');

      this.refreshItems();

      document.addEventListener('click', this.handleDocumentClick, true);
      document.addEventListener('keydown', this.handleDocumentKeydown);
    }

    let actualFocusIndex = focusIndex;
    if (actualFocusIndex === -1 && this.items.length > 0) {
      actualFocusIndex = this.items.length - 1;
    }

    if (actualFocusIndex != null) {
      if (this.content.style.visibility === 'hidden') {
        this.pendingFocusIndex = actualFocusIndex;
      } else if (this.items[actualFocusIndex]) {
        const targetItem = this.items[actualFocusIndex];
        targetItem.focus({ preventScroll: true });
        targetItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  public close(returnFocus: boolean = false): void {
    if (!this.isOpen || !this.content || !this.trigger) {
      return;
    }
    this.isOpen = false;

    unlockScroll(this.content);

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
