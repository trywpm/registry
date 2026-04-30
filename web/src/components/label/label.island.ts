class LabelComponent extends HTMLElement {
  private handleMouseDownBound = this.handleMouseDown.bind(this);

  connectedCallback(): void {
    setTimeout(() => {
      this.addEventListener('mousedown', this.handleMouseDownBound);
    }, 0);
  }

  disconnectedCallback(): void {
    this.removeEventListener('mousedown', this.handleMouseDownBound);
  }

  private handleMouseDown(event: MouseEvent): void {
    if (!(event.target instanceof Element)) {
      return;
    }

    if (event.target.closest('button, input, select, textarea')) {
      return;
    }

    if (!event.defaultPrevented && event.detail > 1) {
      event.preventDefault();
    }
  }
}

if (!customElements.get('wpm-label')) {
  customElements.define('wpm-label', LabelComponent);
}
