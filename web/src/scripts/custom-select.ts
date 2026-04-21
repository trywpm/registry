class CustomSelect extends HTMLElement {
  connectedCallback() {
    // Wait for the HTML DOM elements to finish rendering
    queueMicrotask(() => this.init());
  }

  init() {
    this.trigger = this.querySelector('[data-slot="select-trigger"]');
    this.content = this.querySelector('[data-slot="select-content"]');
    this.valueNode = this.querySelector('[data-slot="select-value"]');
    this.hiddenInput = this.querySelector('[data-slot="select-hidden-input"]');

    // Portal Magic: Move content to body to break out of 'overflow:hidden' and 'z-index'
    if (this.content && this.content.parentElement === this) {
      document.body.appendChild(this.content);
    }

    this.items = [
      ...(this.content ? this.content.querySelectorAll('[data-slot="select-item"]') : []),
    ];
    this.isOpen = false;

    // 1. Set Initial Value SILENTLY
    const defaultVal = this.getAttribute('data-default-value');
    if (defaultVal) {
      const activeItem = this.items.find((i) => i.getAttribute('data-value') === defaultVal);
      if (activeItem) {
        this._updateDOMState(activeItem);
      }
    }

    if (!this.trigger || !this.content) {
      return;
    }

    // Bind instance methods
    this._handleDocumentClick = this._handleDocumentClick.bind(this);
    this._reposition = this._reposition.bind(this);

    // 2. Event Listeners

    this.trigger.addEventListener('pointerdown', (e) => {
      // 1. Force the button to take focus on click (fixes Safari/Mac quirk)
      this.trigger.focus({ preventScroll: true });
    });

    this.trigger.addEventListener('click', (e) => {
      e.preventDefault();
      this.toggle();
    });

    this.trigger.addEventListener('keydown', (e) => this._handleTriggerKey(e));

    this.items.forEach((item, index) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!item.hasAttribute('data-disabled')) {
          this.selectItem(item);
        }
      });
      item.addEventListener('keydown', (e) => this._handleItemKey(e, index));
      item.addEventListener('mouseenter', () => {
        if (!item.hasAttribute('data-disabled')) {
          // Fixes page scroll shift!
          item.focus({ preventScroll: true });
        }
      });
    });

    // 3. Smooth Close Animation
    this.content.addEventListener('animationend', () => {
      if (this.content.getAttribute('data-state') === 'closed') {
        this.content.classList.add('hidden');
      }
    });
  }

  disconnectedCallback() {
    // Clean up the portal if the parent is removed from DOM (e.g. SPA navigation)
    if (this.content && this.content.parentNode === document.body) {
      document.body.removeChild(this.content);
    }
    this._removeGlobalListeners();
  }

  _reposition() {
    if (!this.isOpen || !this.trigger || !this.content) {
      return;
    }

    // Calculates absolute positioning just like Radix Popper
    const rect = this.trigger.getBoundingClientRect();
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollX = window.scrollX || document.documentElement.scrollLeft;

    this.content.style.top = `${rect.bottom + scrollY + 4}px`;
    this.content.style.left = `${rect.left + scrollX}px`;
    this.content.style.width = `${rect.width}px`;
    this.content.style.setProperty('--radix-select-trigger-width', `${rect.width}px`);
  }

  _handleDocumentClick(e) {
    // Make sure click was outside BOTH the trigger and the newly portaled content
    if (this.isOpen && !this.contains(e.target) && !this.content.contains(e.target)) {
      this.close();
    }
  }

  _addGlobalListeners() {
    document.addEventListener('click', this._handleDocumentClick);
    window.addEventListener('resize', this._reposition);
    // Use capture phase for scrolling so we catch scrolls inside inner divs
    window.addEventListener('scroll', this._reposition, true);
  }

  _removeGlobalListeners() {
    document.removeEventListener('click', this._handleDocumentClick);
    window.removeEventListener('resize', this._reposition);
    window.removeEventListener('scroll', this._reposition, true);
  }

  toggle() {
    if (this.hasAttribute('data-disabled')) {
      return;
    }
    this.isOpen ? this.close(true) : this.open();
  }

  open() {
    this.isOpen = true;

    this.content.classList.remove('hidden');
    this._reposition();
    void this.content.offsetWidth; // Force DOM reflow

    this.trigger.setAttribute('data-state', 'open');
    this.trigger.setAttribute('aria-expanded', 'true');
    this.content.setAttribute('data-state', 'open');

    this._addGlobalListeners();

    // Focus active or first item safely
    const selected =
      this.items.find((i) => i.getAttribute('data-state') === 'checked') ||
      this.items.find((i) => !i.hasAttribute('data-disabled'));

    if (selected) {
      // Fixes page scroll shift!
      selected.focus({ preventScroll: true });
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  close(returnFocus = false) {
    this.isOpen = false;
    this.trigger.setAttribute('data-state', 'closed');
    this.trigger.setAttribute('aria-expanded', 'false');
    this.content.setAttribute('data-state', 'closed');

    this._removeGlobalListeners();

    if (returnFocus) {
      this.trigger.focus({ preventScroll: true });
    }
  }

  selectItem(item) {
    this._updateDOMState(item);
    this.close(true);

    const val = item.getAttribute('data-value');
    this.dispatchEvent(new CustomEvent('change', { detail: { value: val } }));
    if (this.hiddenInput) {
      this.hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  _updateDOMState(item) {
    const val = item.getAttribute('data-value');
    const textNode = item.querySelector('[data-slot="select-item-text"]');
    const text = textNode ? textNode.textContent.trim() : item.textContent.trim();

    if (this.valueNode) {
      this.valueNode.textContent = text;
      this.valueNode.removeAttribute('data-placeholder');
      this.trigger.removeAttribute('data-placeholder');
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

  // --- Keyboard Nav ---
  _handleTriggerKey(e) {
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      this.open();
    }
  }

  _handleItemKey(e, index) {
    if (['Enter', ' '].includes(e.key)) {
      e.preventDefault();
      this.selectItem(this.items[index]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.close(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this._focusNext(index, 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this._focusNext(index, -1);
    }
  }

  _focusNext(currentIndex, dir) {
    let next = currentIndex + dir;
    while (next >= 0 && next < this.items.length) {
      if (!this.items[next].hasAttribute('data-disabled')) {
        // Fixes page scroll shift!
        this.items[next].focus({ preventScroll: true });
        this.items[next].scrollIntoView({ block: 'nearest' });
        return;
      }
      next += dir;
    }
  }
}

if (typeof window !== 'undefined' && !customElements.get('custom-select')) {
  customElements.define('custom-select', CustomSelect);
}
