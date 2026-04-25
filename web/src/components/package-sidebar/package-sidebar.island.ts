class PackageSidebar extends HTMLElement {
  private copyTimeout: number | null = null;

  connectedCallback(): void {
    this.addEventListener('click', this.handleClick);
  }

  disconnectedCallback(): void {
    this.removeEventListener('click', this.handleClick);
    if (this.copyTimeout != null) {
      window.clearTimeout(this.copyTimeout);
    }
  }

  private handleClick = async (e: Event): Promise<void> => {
    if (!(e.target instanceof HTMLElement)) {
      return;
    }

    const copyBtn = e.target.closest<HTMLButtonElement>('[data-target="copy-btn"]');

    if (!copyBtn) {
      return;
    }

    const codeNode = this.querySelector<HTMLElement>('[data-target="command-text"]');
    const srFeedback = this.querySelector<HTMLElement>('[data-target="sr-feedback"]');

    if (!codeNode) {
      return;
    }

    try {
      if (!('clipboard' in navigator)) {
        return;
      }

      await navigator.clipboard.writeText(codeNode.textContent.trim() || '');

      if (this.copyTimeout != null) {
        window.clearTimeout(this.copyTimeout);
      }

      this.dataset.copied = 'true';

      if (srFeedback) {
        srFeedback.textContent = 'Command copied to clipboard';

        copyBtn.addEventListener(
          'blur',
          () => {
            srFeedback.textContent = '';
          },
          { once: true },
        );
      }

      this.copyTimeout = window.setTimeout(() => {
        this.copyTimeout = null;
        this.dataset.copied = 'false';
      }, 2000);
    } catch (err) {
      console.error('Failed to copy command:', err);
    }
  };
}

if (!customElements.get('wpm-package-sidebar')) {
  customElements.define('wpm-package-sidebar', PackageSidebar);
}
