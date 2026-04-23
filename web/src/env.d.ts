declare module 'virtual:client-manifest' {
  const manifest: Record<
    string,
    {
      file?: string;
    }
  >;
  export default manifest;
}
