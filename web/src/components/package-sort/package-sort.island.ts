class PackageSort extends HTMLElement {
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

        const sortItem = e.target.closest<HTMLElement>('[data-sort-value]');

        if (sortItem) {
          const sortKey = sortItem.getAttribute('data-sort-value');
          if (sortKey) {
            this.handleSortChange(sortKey);
          }
        }
      },
      { signal },
    );

    this.searchInput = this.querySelector<HTMLInputElement>('[data-slot="search-input"]');

    if (this.searchInput) {
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
      if (trimmedValue.length >= 3) {
        const currentParams = new URLSearchParams(window.location.search);
        const currentQuery = currentParams.get('q') || '';

        if (trimmedValue !== currentQuery) {
          inputTarget.disabled = true;

          const url = new URL('/search', window.location.origin);
          url.searchParams.set('q', trimmedValue);

          window.location.href = url.toString();
        }
      }
    }, 800);
  }

  private handleSortChange(sortKey: string): void {
    const url = new URL(window.location.href);
    url.searchParams.set('sort', sortKey);
    url.searchParams.delete('page');
    window.location.href = url.toString();
  }
}

if (!customElements.get('wpm-package-sort')) {
  customElements.define('wpm-package-sort', PackageSort);
}

export type { PackageSort };
