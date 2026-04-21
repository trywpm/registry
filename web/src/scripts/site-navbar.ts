class SiteNavbar extends HTMLElement {
  connectedCallback() {
    this.isOpen = false;
    this.hasHero = this.getAttribute('data-has-hero') === 'true';

    this.header = this.querySelector('[data-header]');
    this.mobileMenu = this.querySelector('[data-mobile-menu]');

    // We select ALL hamburger buttons (there's one in the header, one inside the mobile menu)
    this.toggles = this.querySelectorAll('[data-menu-toggle]');
    this.lines = this.querySelectorAll('[data-line-1], [data-line-2]');

    // Bind Click events
    this.toggles.forEach((btn) => {
      btn.addEventListener('click', () => this.toggleMenu());
    });

    // Bind Scroll event if hasHero is true
    if (this.hasHero) {
      window.addEventListener('scroll', () => this.handleScroll(), { passive: true });
      // Run once on load just in case user refreshes halfway down the page
      this.handleScroll();
    }
  }

  toggleMenu() {
    this.isOpen = !this.isOpen;

    // 1. Toggle Mobile Menu visibility
    if (this.isOpen) {
      this.mobileMenu.classList.remove('hidden');
      // Optional: Prevent background scrolling when menu is open
      document.body.style.overflow = 'hidden';
    } else {
      this.mobileMenu.classList.add('hidden');
      document.body.style.overflow = '';
    }

    // 2. Trigger the Tailwind animations on the hamburger lines
    this.lines.forEach((line) => {
      line.setAttribute('data-state', this.isOpen ? 'open' : 'closed');
    });
  }

  handleScroll() {
    if (window.scrollY > 0) {
      this.header.classList.remove('border-b-transparent');
    } else {
      this.header.classList.add('border-b-transparent');
    }
  }
}

// Register the web component
if (!customElements.get('site-navbar')) {
  customElements.define('site-navbar', SiteNavbar);
}
