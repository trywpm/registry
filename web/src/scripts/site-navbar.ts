class SiteNavbar extends HTMLElement {
  private isOpen: boolean = false;
  private hasHero: boolean = false;
  private header: HTMLElement | null = null;
  private mobileMenu: HTMLElement | null = null;
  private toggles: NodeListOf<HTMLElement> | null = null;
  private lines: NodeListOf<HTMLElement> | null = null;

  connectedCallback() {
    this.lines = this.querySelectorAll('[data-line-1], [data-line-2]');
    this.header = this.querySelector('[data-header]');
    this.hasHero = this.getAttribute('data-has-hero') === 'true';
    this.toggles = this.querySelectorAll('[data-menu-toggle]');
    this.mobileMenu = this.querySelector('[data-mobile-menu]');

    this.toggles.forEach((btn) => {
      btn.addEventListener('click', () => this.toggleMenu());
    });

    if (this.hasHero) {
      window.addEventListener('scroll', this.handleScroll, { passive: true });
      this.handleScroll();
    }
  }

  private toggleMenu() {
    this.isOpen = !this.isOpen;

    this.setAttribute('data-state', this.isOpen ? 'open' : 'closed');

    if (this.mobileMenu) {
      this.mobileMenu.setAttribute('data-state', this.isOpen ? 'open' : 'closed');
      document.body.style.overflow = this.isOpen ? 'hidden' : '';
    }

    requestAnimationFrame(() => {
      this.lines?.forEach((line) => {
        line.setAttribute('data-state', this.isOpen ? 'open' : 'closed');
      });
    });
  }

  private handleScroll = () => {
    if (!this.header) {
      return;
    }
    if (window.scrollY > 0) {
      this.header.classList.remove('border-b-transparent');
    } else {
      this.header.classList.add('border-b-transparent');
    }
  };

  disconnectedCallback() {
    window.removeEventListener('scroll', this.handleScroll);
  }
}

if (!customElements.get('site-navbar')) {
  customElements.define('site-navbar', SiteNavbar);
}
