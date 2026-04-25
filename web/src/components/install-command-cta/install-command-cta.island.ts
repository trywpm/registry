import type { Select } from '@/components/select/select.island';

const WPM_SELECT_TAG = 'wpm-select';

class InstallCommandCta extends HTMLElement {
  private commands: Record<string, string> = {};

  private selectEl: Select | null = null;
  private prefixNode: HTMLElement | null = null;
  private codeNode: HTMLElement | null = null;
  private copyBtn: HTMLButtonElement | null = null;

  private copyTimeout: number | null = null;

  private handleCopyBound = this.handleCopy.bind(this);
  private handleSelectChangeBound = this.handleSelectChange.bind(this);

  connectedCallback(): void {
    void customElements.whenDefined(WPM_SELECT_TAG).then(() => {
      this.init();
    });
  }

  disconnectedCallback(): void {
    if (this.selectEl) {
      this.selectEl.removeEventListener('change', this.handleSelectChangeBound);
    }
    if (this.copyBtn) {
      this.copyBtn.removeEventListener('click', this.handleCopyBound);
    }
    this.clearTimeout();
  }

  private init(): void {
    try {
      this.commands = JSON.parse(this.getAttribute('data-commands') || '{}');
    } catch (e) {
      this.commands = {};
      console.error('Failed to parse data-commands:', e);
    }

    this.selectEl = this.querySelector(WPM_SELECT_TAG);
    this.prefixNode = this.querySelector('[data-target="prompt-prefix"]');
    this.codeNode = this.querySelector('[data-target="command-text"]');
    this.copyBtn = this.querySelector('[data-target="copy-btn"]');

    if (this.selectEl) {
      this.selectEl.addEventListener('change', this.handleSelectChangeBound);
    }

    if (this.copyBtn) {
      this.copyBtn.addEventListener('click', this.handleCopyBound);
    }
  }

  private handleSelectChange(e: Event): void {
    if (e instanceof CustomEvent) {
      this.updateCommand(e.detail.value);
    }
  }

  private updateCommand(os: string): void {
    if (!this.commands[os]) {
      return;
    }

    if (this.prefixNode) {
      this.prefixNode.textContent = os === 'windows' ? '>' : '$';
    }

    if (this.codeNode) {
      this.codeNode.textContent = this.commands[os];
    }
  }

  private clearTimeout(): void {
    if (this.copyTimeout != null) {
      window.clearTimeout(this.copyTimeout);
      this.copyTimeout = null;
    }
  }

  private async handleCopy(): Promise<void> {
    if (!this.codeNode || !this.copyBtn) {
      return;
    }

    const commandText = this.codeNode.textContent || '';

    try {
      await navigator.clipboard.writeText(commandText);
      this.clearTimeout();

      this.copyBtn.setAttribute('data-copied', 'true');
      this.copyBtn.setAttribute('aria-label', 'Copied to clipboard');

      this.copyTimeout = window.setTimeout(() => {
        if (this.copyBtn) {
          this.copyBtn.setAttribute('data-copied', 'false');
          this.copyBtn.setAttribute('aria-label', 'Copy installation command');
        }
        this.clearTimeout();
      }, 2000);
    } catch (err) {
      console.error('Failed to copy command:', err);
    }
  }
}

if (!customElements.get('wpm-install-command-cta')) {
  customElements.define('wpm-install-command-cta', InstallCommandCta);
}
