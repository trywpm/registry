import { Clerk } from '@clerk/clerk-js';
import { shadcn } from '@clerk/ui/themes';

if (!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) {
  throw new Error('Add your VITE_CLERK_PUBLISHABLE_KEY to the .env file');
}

await new Promise<void>((resolve, reject) => {
  if (window.__internal_ClerkUICtor) {
    return resolve();
  }

  const script = document.getElementById('auth-ui-loader');

  if (!script) {
    return reject(new Error('Auth UI loader script not found'));
  }

  script.addEventListener('load', () => {
    resolve();
  });
  script.addEventListener('error', () => {
    reject(new Error('Failed to load auth ui module'));
  });
});

const clerk = new Clerk(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
await clerk.load({
  ui: { ClerkUI: window.__internal_ClerkUICtor },
  appearance: {
    theme: shadcn,
    elements: {
      cardBox: '!shadow-none',
    },
  },
});

function handleSpinnerTransition(container: HTMLElement, spinner: HTMLElement | null) {
  if (!spinner) {
    return;
  }

  const observer = new MutationObserver((_, obs) => {
    if (container.childNodes.length > 0) {
      obs.disconnect();

      spinner.classList.add('opacity-0');
      container.classList.remove('opacity-0');

      setTimeout(() => spinner.remove(), 200);
    }
  });

  observer.observe(container, { childList: true });
}

const spinner = document.getElementById('clerk-spinner');
const signUpContainer = document.getElementById('sign-up-container');
const signInContainer = document.getElementById('sign-in-container');

if (signUpContainer instanceof HTMLDivElement) {
  handleSpinnerTransition(signUpContainer, spinner);

  clerk.mountSignUp(signUpContainer, {
    routing: 'hash',
    signInUrl: '/login',
  });
}

if (signInContainer instanceof HTMLDivElement) {
  handleSpinnerTransition(signInContainer, spinner);

  clerk.mountSignIn(signInContainer, {
    routing: 'hash',
    signUpUrl: '/signup',
  });
}
