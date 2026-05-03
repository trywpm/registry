type WpmScrollLockState = {
  styleTag: HTMLStyleElement | null;
  activeContainers: Set<HTMLElement>;
  originalContainerStyles: WeakMap<
    HTMLElement,
    { touchAction: string; overscrollBehavior: string }
  >;
};

interface Window {
  Clerk?: import('@clerk/clerk-js').Clerk;
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
