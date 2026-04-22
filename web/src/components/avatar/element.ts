class Avatar extends HTMLElement {
  private img: HTMLImageElement | null = null;
  private fallback: HTMLElement | null = null;
  private delayTimeout: number | null = null;

  private handleLoadBound = this.handleLoad.bind(this);
  private handleErrorBound = this.handleError.bind(this);

  connectedCallback(): void {
    this.img = this.querySelector<HTMLImageElement>('img[data-slot="avatar-image"]');
    this.fallback = this.querySelector<HTMLElement>('[data-slot="avatar-fallback"]');

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

    if (this.img.complete) {
      if (this.img.naturalWidth > 0) {
        this.handleLoad();
      } else {
        this.handleError();
      }
    } else {
      this.img.style.display = 'none';
      this.showFallback();
      this.img.addEventListener('load', this.handleLoadBound);
      this.img.addEventListener('error', this.handleErrorBound);
    }
  }

  private showFallback(): void {
    if (!this.fallback) {
      return;
    }

    const delayMsStr = this.fallback.getAttribute('data-delay-ms');
    const delayMs = delayMsStr ? parseInt(delayMsStr, 10) : 0;

    if (delayMs > 0) {
      this.fallback.style.display = 'none';
      this.delayTimeout = window.setTimeout(() => {
        if (this.fallback) {
          this.fallback.style.display = '';
        }
      }, delayMs);
    } else {
      this.fallback.style.display = '';
    }
  }

  private hideFallback(): void {
    this.clearDelay();
    if (this.fallback) {
      this.fallback.style.display = 'none';
    }
  }

  private clearDelay(): void {
    if (this.delayTimeout != null) {
      window.clearTimeout(this.delayTimeout);
      this.delayTimeout = null;
    }
  }

  private handleLoad(): void {
    if (this.img) {
      this.img.style.display = '';
    }

    this.hideFallback();
  }

  private handleError(): void {
    if (this.img) {
      this.img.style.display = 'none';
    }

    this.showFallback();
  }
}

if (!customElements.get('wpm-avatar')) {
  customElements.define('wpm-avatar', Avatar);
}
