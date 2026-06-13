export class ChecksumMismatchError extends Error {
  override readonly name = 'ChecksumMismatchError';

  constructor(key: string) {
    super(`checksum mismatch: uploaded bytes for ${key} do not match the expected digest`);
  }
}
