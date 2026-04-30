class PackageSearchElement extends HTMLElement {
  private searchInput: HTMLInputElement | null = null;
  private abortController: AbortController | null = null;

  connectedCallback(): void {
    setTimeout(() => {
      this.searchInput = this.querySelector<HTMLInputElement>('input[data-slot="search-input"]');

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

    this.searchInput?.addEventListener(
      'input',
      (e: Event) => {
        if (!(e.target instanceof HTMLInputElement)) {
          return;
        }

        const inputLen = e.target.value.trim().length;
        if (inputLen >= 3 || inputLen === 0) {
          this.dispatchEvent(
            new CustomEvent('wpm-package-search-trigger', {
              bubbles: true,
            }),
          );
        }
      },
      { signal },
    );

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

    if (this.searchInput && this.searchInput.value.trim() !== '') {
      url.searchParams.set('q', this.searchInput.value.trim());
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
