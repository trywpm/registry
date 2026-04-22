class PackageSidebar extends HTMLElement {
  connectedCallback() {
    requestAnimationFrame(() => {
      this.init();
    });
  }

  init() {
    this.code = this.querySelector('[data-target="command-text"]');
    this.copyBtn = this.querySelector('[data-target="copy-btn"]');
    this.checkIcon = this.querySelector('[data-icon="check"]');

    // 2. Attach copy button logic
    if (this.copyBtn) {
      this.copyBtn.addEventListener('click', () => this.handleCopy());
    }
  }

  async handleCopy() {
    if (!this.code || !this.checkIcon) {
      return;
    }

    const commandText = this.code.textContent;

    try {
      await navigator.clipboard.writeText(commandText);

      this.checkIcon.classList.remove('hidden');

      // Revert BACK to "Copy" after 2 seconds
      setTimeout(() => {
        this.checkIcon.classList.add('hidden');
      }, 2000);
    } catch (err) {
      console.error('Failed to copy command:', err);
    }
  }
}

// Register the web component
if (!customElements.get('package-sidebar')) {
  customElements.define('package-sidebar', PackageSidebar);
}
