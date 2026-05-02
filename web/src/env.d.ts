type WpmScrollLockState = {
  styleTag: HTMLStyleElement | null;
  activeContainers: Set<HTMLElement>;
  originalContainerStyles: WeakMap<
    HTMLElement,
    { touchAction: string; overscrollBehavior: string }
  >;
};

interface Window {
  __internal_ClerkUICtor?: ClerkUIConstructor;
  __WPM_SCROLL_LOCK_STATE__?: WpmScrollLockState;
}

declare module 'virtual:client-manifest' {
  const manifest: Record<
    string,
    {
      file?: string;
    }
  >;
  export default manifest;
}
