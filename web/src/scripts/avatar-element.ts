// avatar-element.ts
class UiAvatar extends HTMLElement {
  connectedCallback() {
    const img = this.querySelector('img[data-slot="avatar-image"]') as HTMLImageElement | null;
    const fallback = this.querySelector('[data-slot="avatar-fallback"]') as HTMLElement | null;

    if (!img) {
      return;
    }

    let delayTimeout: number;
    const delayMs = fallback?.getAttribute('data-delay-ms');

    const showFallback = () => {
      if (!fallback) {
        return;
      }
      if (delayMs) {
        fallback.style.display = 'none';
        delayTimeout = window.setTimeout(
          () => {
            fallback.style.display = '';
          },
          parseInt(delayMs, 10),
        );
      } else {
        fallback.style.display = '';
      }
    };

    const hideFallback = () => {
      if (delayTimeout) {
        window.clearTimeout(delayTimeout);
      }
      if (fallback) {
        fallback.style.display = 'none';
      }
    };

    const handleLoad = () => {
      img.style.display = ''; // Show image
      hideFallback(); // Hide fallback
    };

    const handleError = () => {
      img.style.display = 'none'; // Hide image
      showFallback(); // Show fallback
    };

    // Determine initial state based on cache/hydration
    if (img.complete && img.naturalWidth > 0) {
      handleLoad();
    } else if (img.complete && img.naturalWidth === 0) {
      handleError();
    } else {
      // Still loading
      img.style.display = 'none';
      showFallback();
      img.addEventListener('load', handleLoad);
      img.addEventListener('error', handleError);
    }
  }
}

// Register the custom element if running in the browser
if (typeof window !== 'undefined' && !customElements.get('ui-avatar')) {
  customElements.define('ui-avatar', UiAvatar);
}
