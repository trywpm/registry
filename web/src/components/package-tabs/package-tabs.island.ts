class PackageTabs extends HTMLElement {
  connectedCallback() {
    requestAnimationFrame(() => {
      const activeTab = this.querySelector('[aria-selected="true"]');
      if (activeTab) {
        activeTab.scrollIntoView({
          block: 'nearest',
          inline: 'center',
          behavior: 'smooth',
        });
      }
    });
  }
}

if (!customElements.get('wpm-package-tabs')) {
  customElements.define('wpm-package-tabs', PackageTabs);
}
