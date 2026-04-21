// client.ts (or wherever you bundle your client-side scripts)

class ThemeToggle extends HTMLElement {
  connectedCallback() {
    // Select all buttons inside this element
    this.buttons = this.querySelectorAll('button[data-theme]');

    // Read the current theme, fallback to system
    this.theme = localStorage.getItem('theme') || 'system';

    // Attach click listeners to all buttons
    this.buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const newTheme = btn.getAttribute('data-theme');
        if (newTheme) this.applyTheme(newTheme);
      });
    });

    // Run once on load to sync the active button UI
    this.applyTheme(this.theme);
  }

  applyTheme(newTheme) {
    this.theme = newTheme;
    const root = document.documentElement;

    // 1. Update the document classes
    root.classList.remove('light', 'dark');

    if (newTheme === 'system') {
      localStorage.removeItem('theme');
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
      root.classList.add(systemTheme);
    } else {
      localStorage.setItem('theme', newTheme);
      root.classList.add(newTheme);
    }

    // 2. Update the buttons' "active" UI state
    this.updateUI();
  }

  updateUI() {
    this.buttons.forEach((btn) => {
      const btnTheme = btn.getAttribute('data-theme');
      const isActive = this.theme === btnTheme;

      if (isActive) {
        // Add active classes
        btn.classList.add('bg-background', 'shadow-sm', 'text-foreground');
        btn.classList.remove('text-muted-foreground', 'hover:text-foreground');
      } else {
        // Remove active classes
        btn.classList.remove('bg-background', 'shadow-sm', 'text-foreground');
        btn.classList.add('text-muted-foreground', 'hover:text-foreground');
      }
    });
  }
}

// Register the web component
customElements.define('theme-toggle', ThemeToggle);
