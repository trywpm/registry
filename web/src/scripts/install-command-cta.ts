class InstallCommandCta extends HTMLElement {
  connectedCallback() {
    // Wait for the next paint to ensure all child elements are fully parsed
    requestAnimationFrame(() => {
      this.init();
    });
  }

  init() {
    try {
      this.commands = JSON.parse(this.getAttribute('data-commands') || '{}');
    } catch (e) {
      this.commands = {};
    }

    this.currentOS = this.getAttribute('data-initial-os') || 'macos';

    this.select = this.querySelector('custom-select');
    // FIX: Renamed from this.prefix to this.prefixNode to avoid DOM property collision
    this.prefixNode = this.querySelector('[data-target="prompt-prefix"]');
    this.code = this.querySelector('[data-target="command-text"]');
    this.copyBtn = this.querySelector('[data-target="copy-btn"]');
    this.copyIcon = this.querySelector('[data-icon="copy"]');
    this.checkIcon = this.querySelector('[data-icon="check"]');

    // 1. Listen for the dropdown changing
    if (this.select) {
      this.select.addEventListener('change', (e) => {
        this.updateCommand(e.detail.value);
      });

      // Wait for the custom-select component to actually be defined before calling its methods
      customElements.whenDefined('custom-select').then(() => {
        this.detectClientOS();
      });
    }

    // 2. Attach copy button logic
    if (this.copyBtn) {
      this.copyBtn.addEventListener('click', () => this.handleCopy());
    }
  }

  detectClientOS() {
    const userAgent = navigator.userAgent || navigator.platform;
    let clientOS = 'linux';

    if (/Win/i.test(userAgent)) {
      clientOS = 'windows';
    } else if (/Mac/i.test(userAgent)) {
      clientOS = 'macos';
    }

    // If server rendered macOS but client is Windows, update it smoothly
    if (
      clientOS !== this.currentOS &&
      this.select &&
      typeof this.select.selectItem === 'function'
    ) {
      const itemToSelect = this.select.querySelector(`[data-value="${clientOS}"]`);
      if (itemToSelect) {
        this.select.selectItem(itemToSelect, true);
      }
    }
  }

  updateCommand(os) {
    if (!this.commands[os]) {
      return;
    }

    this.currentOS = os;
    if (this.prefixNode) {
      this.prefixNode.textContent = os === 'windows' ? '>' : '$';
    }
    if (this.code) {
      this.code.textContent = this.commands[os];
    }
  }

  async handleCopy() {
    if (!this.code || !this.copyIcon || !this.checkIcon) {
      return;
    }

    const commandText = this.code.textContent;

    try {
      await navigator.clipboard.writeText(commandText);

      // Animate TO "Check"
      this.copyIcon.classList.replace('scale-100', 'scale-90');
      this.copyIcon.classList.replace('opacity-100', 'opacity-0');

      this.checkIcon.classList.replace('scale-90', 'scale-100');
      this.checkIcon.classList.replace('opacity-0', 'opacity-100');

      // Revert BACK to "Copy" after 2 seconds
      setTimeout(() => {
        this.copyIcon.classList.replace('scale-90', 'scale-100');
        this.copyIcon.classList.replace('opacity-0', 'opacity-100');

        this.checkIcon.classList.replace('scale-100', 'scale-90');
        this.checkIcon.classList.replace('opacity-100', 'opacity-0');
      }, 2000);
    } catch (err) {
      console.error('Failed to copy command:', err);
    }
  }
}

// Register the web component
if (!customElements.get('install-command-cta')) {
  customElements.define('install-command-cta', InstallCommandCta);
}
