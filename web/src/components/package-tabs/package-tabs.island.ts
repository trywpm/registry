class PackageTabs extends HTMLElement {
  private tabs: HTMLAnchorElement[] = [];

  connectedCallback(): void {
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- window.requestIdleCallback is not available in all browsers, so we provide a fallback to setTimeout
    const idleCallback = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));

    idleCallback(() => {
      this.tabs = [...this.querySelectorAll<HTMLAnchorElement>('[role="tab"]')];

      const activeTab = this.tabs.find((tab) => tab.getAttribute('aria-selected') === 'true');
      if (activeTab) {
        activeTab.scrollIntoView({
          block: 'nearest',
          inline: 'center',
          behavior: 'instant',
        });
      }
    });

    this.addEventListener('keydown', this.handleKeyDown);
  }

  disconnectedCallback(): void {
    this.removeEventListener('keydown', this.handleKeyDown);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
      return;
    }

    if (!(document.activeElement instanceof HTMLAnchorElement)) {
      return;
    }

    const currentIndex = this.tabs.indexOf(document.activeElement);

    if (currentIndex === -1) {
      return;
    }

    e.preventDefault();

    let nextIndex = currentIndex;

    if (e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % this.tabs.length;
    } else {
      nextIndex = (currentIndex - 1 + this.tabs.length) % this.tabs.length;
    }

    document.activeElement.setAttribute('tabindex', '-1');

    const nextTab = this.tabs[nextIndex];
    nextTab.setAttribute('tabindex', '0');
    nextTab.focus();
    nextTab.scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: 'smooth',
    });
  };
}

if (!customElements.get('wpm-package-tabs')) {
  customElements.define('wpm-package-tabs', PackageTabs);
}
