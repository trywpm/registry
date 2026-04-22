type Theme = 'light' | 'dark' | 'system';

class ThemeToggle extends HTMLElement {
  private theme: Theme = 'system';
  private cycleBtn: HTMLButtonElement | null = null;

  connectedCallback() {
    this.cycleBtn = this.querySelector('button[data-theme-cycle]');

    const saved = localStorage.getItem('theme') as Theme | null;
    this.theme = saved || 'system';

    this.cycleBtn?.addEventListener('click', () => {
      const isDark = document.documentElement.classList.contains('dark');
      const nextTheme: Theme = isDark ? 'light' : 'dark';

      this.applyTheme(nextTheme);
    });

    this.updateAttributes();
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

    this.updateAttributes();
  }

  private updateAttributes() {
    this.setAttribute('data-current-theme', this.theme);
  }
}

if (!customElements.get('wpm-theme-toggle')) {
  customElements.define('wpm-theme-toggle', ThemeToggle);
}
