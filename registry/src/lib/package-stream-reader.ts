const MAX_MANIFEST_SIZE = 512 * 1024; // 512 KB

/**
 * Reads a package upload stream using Length-Prefixed Framing.
 *
 * Instead of buffering heavy `multipart/form-data` into memory, the client
 * sends a continuous binary stream (`application/octet-stream`) in 3 parts:
 *
 * 1. [4 bytes]     - A 32-bit Big-Endian integer representing the JSON manifest size (N).
 * 2. [N bytes]     - The parsed JSON manifest.
 * 3. [The Rest]    - The raw .tar.zst tarball stream.
 *
 * This class uses a BYOB (Bring Your Own Buffer) reader to extract exactly
 * the manifest bytes with zero memory waste, leaving the internal stream cursor
 * resting perfectly on the first byte of the tarball to be piped to storage.
 */
export class PackageStreamReader {
  #stream;
  #reader;

  constructor(requestBody: ReadableStream) {
    this.#stream = requestBody;
    this.#reader = requestBody.getReader({ mode: 'byob' });
  }

  async #readExact(length: number) {
    let offset = 0;
    let buffer = new ArrayBuffer(length);

    while (offset < length) {
      const view = new Uint8Array(buffer, offset, length - offset);

      const { done, value } = await this.#reader.read(view);

      if (value) {
        buffer = value.buffer;
        offset += value.byteLength;
      }

      if (done) {
        if (offset < length) {
          throw new Error('Network stream ended abruptly before data could be fully read.');
        }
        break; // We have exactly what we need
      }
    }

    return new Uint8Array(buffer);
  }

  async getManifest() {
    try {
      const lengthBytes = await this.#readExact(4);
      const dataView = new DataView(
        lengthBytes.buffer,
        lengthBytes.byteOffset,
        lengthBytes.byteLength,
      );

      const manifestLength = dataView.getUint32(0, false); // Big Endian
      if (manifestLength > MAX_MANIFEST_SIZE) {
        throw new Error(`Manifest size (${manifestLength} bytes) exceeds the 512KB limit.`);
      }

      const manifestBytes = await this.#readExact(manifestLength);
      const manifestString = new TextDecoder().decode(manifestBytes);
      return JSON.parse(manifestString);
    } catch (error) {
      await this.#reader.cancel();
      throw error;
    }
  }

  getTarballStream() {
    this.#reader.releaseLock();
    return this.#stream;
  }
}
