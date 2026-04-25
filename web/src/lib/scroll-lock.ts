if (typeof window !== 'undefined') {
  window.__WPM_SCROLL_LOCK_STATE__ ??= {
    styleTag: null,
    activeContainers: new Set<HTMLElement>(),
    originalContainerStyles: new WeakMap(),
  };
}

const getState = (): WpmScrollLockState | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window.__WPM_SCROLL_LOCK_STATE__;
};

export const lockScroll = (containerEl: HTMLElement) => {
  const state = getState();
  if (!state) {
    return;
  }

  if (state.activeContainers.has(containerEl)) {
    return;
  }

  state.activeContainers.add(containerEl);

  state.originalContainerStyles.set(containerEl, {
    touchAction: containerEl.style.touchAction,
    overscrollBehavior: containerEl.style.overscrollBehavior,
  });

  if (state.activeContainers.size === 1) {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    state.styleTag = document.createElement('style');
    state.styleTag.id = 'wpm-scroll-lock';

    state.styleTag.textContent = `
      :root {
        --wpm-scrollbar-width: ${scrollbarWidth}px;
      }
      html {
        overscroll-behavior: none !important;
      }
      body {
        overflow: hidden !important;
        overscroll-behavior: none !important;
        touch-action: none !important;
        padding-right: var(--wpm-scrollbar-width) !important;
      }
      .wpm-lock-padding {
        padding-right: var(--wpm-scrollbar-width) !important;
      }
    `;

    document.head.appendChild(state.styleTag);
  }

  containerEl.style.touchAction = 'auto';
  containerEl.style.overscrollBehavior = 'contain';
};

export const unlockScroll = (containerEl: HTMLElement) => {
  const state = getState();
  if (!state) {
    return;
  }

  if (!state.activeContainers.has(containerEl)) {
    return;
  }

  state.activeContainers.delete(containerEl);

  const prevStyles = state.originalContainerStyles.get(containerEl);
  if (prevStyles) {
    containerEl.style.touchAction = prevStyles.touchAction;
    containerEl.style.overscrollBehavior = prevStyles.overscrollBehavior;
    state.originalContainerStyles.delete(containerEl);
  }

  if (state.activeContainers.size === 0 && state.styleTag) {
    state.styleTag.remove();
    state.styleTag = null;
  }
};
