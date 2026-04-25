class Avatar extends HTMLElement {
  private img: HTMLImageElement | null = null;
  private fallback: HTMLElement | null = null;
  private delayTimeout: number | null = null;

  private handleLoadBound = this.handleLoad.bind(this);
  private handleErrorBound = this.handleError.bind(this);

  connectedCallback(): void {
    this.img = this.querySelector<HTMLImageElement>('img[data-slot="avatar-image"]');
    this.fallback = this.querySelector<HTMLElement>('[data-slot="avatar-fallback"]');

    if (!this.hasAttribute('data-state')) {
      this.setAttribute('data-state', 'loading');
    }

    if (!this.img) {
      return;
    }
    this.init();
  }

  disconnectedCallback(): void {
    if (this.img) {
      this.img.removeEventListener('load', this.handleLoadBound);
      this.img.removeEventListener('error', this.handleErrorBound);
    }
    this.clearDelay();
  }

  private init(): void {
    if (!this.img) {
      return;
    }

    this.img.setAttribute('aria-hidden', 'true');
    if (this.fallback) {
      this.fallback.setAttribute('aria-hidden', 'true');
    }

    if (this.img.complete) {
      if (this.img.naturalWidth > 0) {
        this.handleLoad();
      } else {
        this.handleError();
      }
    } else {
      this.handleDelay();
      this.img.addEventListener('load', this.handleLoadBound);
      this.img.addEventListener('error', this.handleErrorBound);
    }
  }

  private handleDelay(): void {
    if (!this.fallback) {
      return;
    }

    const delayMsStr = this.fallback.getAttribute('data-delay-ms');
    const delayMs = delayMsStr ? parseInt(delayMsStr, 10) : 0;

    if (delayMs > 0) {
      this.setAttribute('data-fallback', 'delayed');

      this.delayTimeout = window.setTimeout(() => {
        this.removeAttribute('data-fallback');
      }, delayMs);
    }
  }

  private clearDelay(): void {
    if (this.delayTimeout != null) {
      window.clearTimeout(this.delayTimeout);
      this.delayTimeout = null;
    }
  }

  private handleLoad(): void {
    this.setAttribute('data-state', 'loaded');
    this.clearDelay();

    this.img?.removeAttribute('aria-hidden');
    this.fallback?.setAttribute('aria-hidden', 'true');
  }

  private handleError(): void {
    this.setAttribute('data-state', 'error');
    this.removeAttribute('data-fallback');
    this.clearDelay();

    this.img?.setAttribute('aria-hidden', 'true');
    this.fallback?.removeAttribute('aria-hidden');
  }
}

if (!customElements.get('wpm-avatar')) {
  customElements.define('wpm-avatar', Avatar);
}
