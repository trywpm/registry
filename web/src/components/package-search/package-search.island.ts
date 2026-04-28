class PackageSearchElement extends HTMLElement {
  private searchInput: HTMLInputElement | null = null;

  private debounceTimer: number | null = null;
  private abortController: AbortController | null = null;

  connectedCallback(): void {
    setTimeout(() => {
      this.init();
    }, 0);
  }

  disconnectedCallback(): void {
    this.abortController?.abort();
    this.abortController = null;

    if (this.debounceTimer != null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private init(): void {
    this.abortController?.abort();
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    this.addEventListener(
      'click',
      (e: Event) => {
        if (!(e.target instanceof HTMLElement)) {
          return;
        }

        const typeItem = e.target.closest<HTMLElement>('[data-type-value]');

        if (typeItem) {
          const typeKey = typeItem.getAttribute('data-type-value');
          if (typeKey) {
            this.handleTypeChange(typeKey);
          }
        }
      },
      { signal },
    );

    this.searchInput = this.querySelector<HTMLInputElement>('[data-slot="search-input"]');

    if (this.searchInput) {
      // Auto-focus input and place cursor at the end to keep typing smooth across SSR reloads
      if (this.searchInput.value && document.activeElement !== this.searchInput) {
        this.searchInput.focus();
        const val = this.searchInput.value;
        this.searchInput.value = '';
        this.searchInput.value = val;
      }

      this.searchInput.addEventListener(
        'input',
        (e: Event) => {
          if (!(e.target instanceof HTMLInputElement)) {
            return;
          }

          this.handleSearch(e.target.value, e.target);
        },
        { signal },
      );
    }
  }

  private handleSearch(value: string, inputTarget: HTMLInputElement): void {
    if (this.debounceTimer != null) {
      window.clearTimeout(this.debounceTimer);
    }

    const trimmedValue = value.trim();

    this.debounceTimer = window.setTimeout(() => {
      const currentParams = new URLSearchParams(window.location.search);
      const currentQuery = currentParams.get('q') || '';

      if (trimmedValue !== currentQuery) {
        inputTarget.disabled = true;

        const url = new URL(window.location.pathname, window.location.origin);
        const currentType = currentParams.get('type') || 'plugin';

        url.searchParams.set('type', currentType);
        if (trimmedValue.length > 0) {
          url.searchParams.set('q', trimmedValue);
        }

        window.location.href = url.toString();
      }
    }, 800);
  }

  private handleTypeChange(typeKey: string): void {
    const url = new URL(window.location.pathname, window.location.origin);
    const currentParams = new URLSearchParams(window.location.search);
    const currentQuery = currentParams.get('q');

    url.searchParams.set('type', typeKey);
    if (currentQuery) {
      url.searchParams.set('q', currentQuery);
    }

    window.location.href = url.toString();
  }
}

if (!customElements.get('wpm-package-search')) {
  customElements.define('wpm-package-search', PackageSearchElement);
}

export type { PackageSearchElement };
