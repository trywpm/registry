type Theme = 'light' | 'dark' | 'system';

class ThemeToggle extends HTMLElement {
  private theme: Theme = 'system';
  private cycleBtn: HTMLButtonElement | null = null;

  private handleToggleBound = this.handleToggle.bind(this);

  connectedCallback() {
    this.cycleBtn = this.querySelector('button[data-theme-cycle]');

    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') {
      this.theme = saved;
    } else {
      this.theme = 'system';
    }

    this.updateAriaLabel();

    if (this.cycleBtn) {
      this.cycleBtn.addEventListener('click', this.handleToggleBound);
    }
  }

  disconnectedCallback() {
    if (this.cycleBtn) {
      this.cycleBtn.removeEventListener('click', this.handleToggleBound);
    }
  }

  private handleToggle() {
    const isDark = document.documentElement.classList.contains('dark');
    const nextTheme: Theme = isDark ? 'light' : 'dark';

    this.applyTheme(nextTheme);
  }

  private applyTheme(newTheme: Theme) {
    this.theme = newTheme;
    const root = document.documentElement;

    if (newTheme === 'dark') {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }

    this.updateAriaLabel();
  }

  private updateAriaLabel() {
    if (!this.cycleBtn) {
      return;
    }

    const isDark = document.documentElement.classList.contains('dark');
    const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';

    this.cycleBtn.setAttribute('aria-label', label);
    this.cycleBtn.setAttribute('title', label);
    this.setAttribute('data-current-theme', this.theme);
  }
}

if (!customElements.get('wpm-theme-toggle')) {
  customElements.define('wpm-theme-toggle', ThemeToggle);
}
