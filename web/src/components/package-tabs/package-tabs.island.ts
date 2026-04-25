class PackageTabs extends HTMLElement {
  private tabs: HTMLAnchorElement[] = [];

  connectedCallback(): void {
    queueMicrotask(() => {
      this.init();
    });
  }

  disconnectedCallback(): void {
    this.removeEventListener('keydown', this.handleKeyDown);
  }

  private init(): void {
    this.tabs = [...this.querySelectorAll<HTMLAnchorElement>('[role="tab"]')];

    const activeTab = this.tabs.find((t) => t.getAttribute('aria-selected') === 'true');
    if (activeTab) {
      activeTab.scrollIntoView({
        block: 'nearest',
        inline: 'center',
        behavior: 'instant',
      });
    }

    this.addEventListener('keydown', this.handleKeyDown);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
      return;
    }

    if (
      !(document.activeElement instanceof HTMLAnchorElement) ||
      !this.tabs.includes(document.activeElement)
    ) {
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
