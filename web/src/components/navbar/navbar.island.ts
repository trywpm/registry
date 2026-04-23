class Navbar extends HTMLElement {
  private isOpen: boolean = false;
  private hasHero: boolean = false;
  private header: HTMLElement | null = null;
  private mobileMenu: HTMLElement | null = null;
  private toggles: NodeListOf<HTMLElement> | null = null;
  private lines: NodeListOf<HTMLElement> | null = null;

  private isScrolled: boolean = false;
  private toggleRafId: number | null = null;

  connectedCallback() {
    this.lines = this.querySelectorAll('[data-line-1], [data-line-2]');
    this.header = this.querySelector('[data-header]');
    this.hasHero = this.getAttribute('data-has-hero') === 'true';
    this.toggles = this.querySelectorAll('[data-menu-toggle]');
    this.mobileMenu = this.querySelector('[data-mobile-menu]');

    this.toggles.forEach((btn) => {
      btn.addEventListener('click', this.handleToggleClick);
    });

    if (this.hasHero) {
      window.addEventListener('scroll', this.handleScroll, { passive: true });
      setTimeout(() => this.handleScroll(), 0);
    }
  }

  private handleToggleClick = () => {
    this.toggleMenu();
  };

  private toggleMenu() {
    this.isOpen = !this.isOpen;

    const state = this.isOpen ? 'open' : 'closed';
    const overflow = this.isOpen ? 'hidden' : '';

    if (this.toggleRafId != null) {
      cancelAnimationFrame(this.toggleRafId);
    }

    this.toggleRafId = requestAnimationFrame(() => {
      this.setAttribute('data-state', state);

      if (this.mobileMenu) {
        this.mobileMenu.setAttribute('data-state', state);
        document.body.style.overflow = overflow;
      }

      this.lines?.forEach((line) => {
        line.setAttribute('data-state', state);
      });

      this.toggleRafId = null;
    });
  }

  private handleScroll = () => {
    if (!this.header) {
      return;
    }

    const shouldBeScrolled = window.scrollY > 0;
    if (shouldBeScrolled !== this.isScrolled) {
      this.isScrolled = shouldBeScrolled;

      requestAnimationFrame(() => {
        if (this.isScrolled) {
          this.header?.classList.remove('border-b-transparent');
        } else {
          this.header?.classList.add('border-b-transparent');
        }
      });
    }
  };

  disconnectedCallback() {
    if (this.hasHero) {
      window.removeEventListener('scroll', this.handleScroll);
    }

    this.toggles?.forEach((btn) => {
      btn.removeEventListener('click', this.handleToggleClick);
    });

    if (this.toggleRafId != null) {
      cancelAnimationFrame(this.toggleRafId);
    }
  }
}

if (!customElements.get('wpm-navbar')) {
  customElements.define('wpm-navbar', Navbar);
}
