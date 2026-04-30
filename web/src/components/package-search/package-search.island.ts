class PackageSearchElement extends HTMLElement {
  private abortController: AbortController | null = null;

  connectedCallback(): void {
    setTimeout(() => {
      this.init();
    }, 0);
  }

  disconnectedCallback(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  private init(): void {
    this.abortController?.abort();
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    this.addEventListener(
      'wpm-select-action',
      (e: Event) => {
        if (!(e instanceof CustomEvent) || !e.detail || e.detail.item === undefined) {
          return;
        }

        if (!(e.detail.item instanceof HTMLElement)) {
          return;
        }

        const typeVal = e.detail.item.getAttribute('data-type-value');
        if (typeVal) {
          this.handleTypeChange(typeVal);
        }
      },
      { signal },
    );
  }

  private handleTypeChange(typeVal: string): void {
    const url = new URL(window.location.href);
    const searchInput = this.querySelector<HTMLInputElement>('[data-slot="search-input"]');

    if (searchInput && searchInput.value.trim() !== '') {
      url.searchParams.set('q', searchInput.value.trim());
    } else {
      url.searchParams.delete('q');
    }

    if (typeVal === 'all') {
      url.searchParams.delete('type');
    } else {
      url.searchParams.set('type', typeVal);
    }

    url.searchParams.delete('cursor');
    window.location.href = url.toString();
  }
}

if (!customElements.get('wpm-package-search')) {
  customElements.define('wpm-package-search', PackageSearchElement);
}

export type { PackageSearchElement };
