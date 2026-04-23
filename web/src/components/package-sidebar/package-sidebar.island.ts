class PackageSidebar extends HTMLElement {
  private codeNode: HTMLElement | null = null;
  private copyBtn: HTMLButtonElement | null = null;
  private checkIcon: HTMLElement | null = null;

  private copyTimeout: number | null = null;
  private handleCopyBound = this.handleCopy.bind(this);

  connectedCallback(): void {
    requestAnimationFrame(() => {
      this.init();
    });
  }

  disconnectedCallback(): void {
    if (this.copyBtn) {
      this.copyBtn.removeEventListener('click', this.handleCopyBound);
    }

    if (this.copyTimeout != null) {
      window.clearTimeout(this.copyTimeout);
    }
  }

  private init(): void {
    this.codeNode = this.querySelector<HTMLElement>('[data-target="command-text"]');
    this.copyBtn = this.querySelector<HTMLButtonElement>('[data-target="copy-btn"]');
    this.checkIcon = this.querySelector<HTMLElement>('[data-icon="check"]');

    if (this.copyBtn) {
      this.copyBtn.addEventListener('click', this.handleCopyBound);
    }
  }

  private async handleCopy(): Promise<void> {
    if (!this.codeNode || !this.checkIcon) {
      return;
    }

    const commandText = this.codeNode.textContent || '';

    try {
      await navigator.clipboard.writeText(commandText);

      if (this.copyTimeout != null) {
        window.clearTimeout(this.copyTimeout);
      }

      this.checkIcon.classList.remove('hidden');

      this.copyTimeout = window.setTimeout(() => {
        if (this.checkIcon) {
          this.checkIcon.classList.add('hidden');
        }

        this.copyTimeout = null;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy command:', err);
    }
  }
}

if (!customElements.get('wpm-package-sidebar')) {
  customElements.define('wpm-package-sidebar', PackageSidebar);
}
