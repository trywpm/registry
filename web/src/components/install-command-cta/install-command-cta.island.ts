import type { Select } from '@/components/select/select.island';

const WPM_SELECT_TAG = 'wpm-select';

class InstallCommandCta extends HTMLElement {
  private commands: Record<string, string> = {};

  private selectEl: Select | null = null;
  private prefixNode: HTMLElement | null = null;
  private codeNode: HTMLElement | null = null;
  private copyBtn: HTMLButtonElement | null = null;
  private copyIcon: HTMLElement | null = null;
  private checkIcon: HTMLElement | null = null;

  private copyTimeout: number | null = null;

  private handleCopyBound = this.handleCopy.bind(this);
  private handleSelectChangeBound = this.handleSelectChange.bind(this);

  connectedCallback(): void {
    requestAnimationFrame(() => {
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
    if (this.copyTimeout != null) {
      window.clearTimeout(this.copyTimeout);
    }
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
    this.copyIcon = this.querySelector('[data-icon="copy"]');
    this.checkIcon = this.querySelector('[data-icon="check"]');

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

  private async handleCopy(): Promise<void> {
    if (!this.codeNode || !this.copyIcon || !this.checkIcon) {
      return;
    }

    const commandText = this.codeNode.textContent || '';

    try {
      await navigator.clipboard.writeText(commandText);

      if (this.copyTimeout != null) {
        window.clearTimeout(this.copyTimeout);
      }

      this.copyIcon.classList.replace('scale-100', 'scale-90');
      this.copyIcon.classList.replace('opacity-100', 'opacity-0');

      this.checkIcon.classList.replace('scale-90', 'scale-100');
      this.checkIcon.classList.replace('opacity-0', 'opacity-100');

      this.copyTimeout = window.setTimeout(() => {
        if (!this.copyIcon || !this.checkIcon) {
          return;
        }

        this.copyIcon.classList.replace('scale-90', 'scale-100');
        this.copyIcon.classList.replace('opacity-0', 'opacity-100');

        this.checkIcon.classList.replace('scale-100', 'scale-90');
        this.checkIcon.classList.replace('opacity-100', 'opacity-0');

        this.copyTimeout = null;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy command:', err);
    }
  }
}

if (!customElements.get('wpm-install-command-cta')) {
  customElements.define('wpm-install-command-cta', InstallCommandCta);
}
