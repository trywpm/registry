import { shadcn } from '@clerk/ui/themes';

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

window.addEventListener('load', async () => {
  if (!window.Clerk) {
    throw new Error('auth sdk not loaded');
  }

  await window.Clerk.load({
    ui: { ClerkUI: window.__internal_ClerkUICtor },
    appearance: {
      theme: shadcn,
      elements: {
        cardBox: '!shadow-none md:min-w-md',
      },
    },
  });

  const spinner = document.getElementById('clerk-spinner');
  const signUpContainer = document.getElementById('sign-up-container');
  const signInContainer = document.getElementById('sign-in-container');
  const waitlistContainer = document.getElementById('waitlist-container');

  if (signUpContainer instanceof HTMLDivElement) {
    handleSpinnerTransition(signUpContainer, spinner);

    window.Clerk.mountSignUp(signUpContainer, {
      routing: 'hash',
      signInUrl: '/login',
      waitlistUrl: '/waitlist',
    });
  }

  if (signInContainer instanceof HTMLDivElement) {
    handleSpinnerTransition(signInContainer, spinner);

    window.Clerk.mountSignIn(signInContainer, {
      routing: 'hash',
      signUpUrl: '/signup',
      waitlistUrl: '/waitlist',
    });
  }

  if (waitlistContainer instanceof HTMLDivElement) {
    handleSpinnerTransition(waitlistContainer, spinner);

    window.Clerk.mountWaitlist(waitlistContainer, {
      signInUrl: '/login',
    });
  }
});
