import { UserError } from '@wpm/exception';

const MAX_MANIFEST_SIZE = 256 * 1024; // 256 KB
const MAX_PACKAGE_SIZE = 128 * 1024 * 1024; // 128 MB

export const MAX_UPLOAD_SIZE = 4 + MAX_MANIFEST_SIZE + MAX_PACKAGE_SIZE; // 4 bytes for manifest length prefix + manifest + tarball = 128.25 MB

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
  #stream: ReadableStream;
  #reader: ReadableStreamBYOBReader;
  #manifestRead = false;

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
          throw new UserError('unexpected end of stream', 400);
        }
        break;
      }
    }

    return new Uint8Array(buffer);
  }

  async getManifest() {
    if (this.#manifestRead) {
      throw new Error('manifest has already been read');
    }

    try {
      const lengthBytes = await this.#readExact(4);
      const dataView = new DataView(
        lengthBytes.buffer,
        lengthBytes.byteOffset,
        lengthBytes.byteLength,
      );

      const manifestLength = dataView.getUint32(0, false); // Big Endian

      if (manifestLength === 0) {
        throw new UserError('manifest size cannot be zero', 400);
      }

      if (manifestLength > MAX_MANIFEST_SIZE) {
        throw new UserError('manifest exceeds size limit of 256KB', 413); // 413 Payload Too Large
      }

      const manifestBytes = await this.#readExact(manifestLength);

      let manifestString: string;
      try {
        manifestString = new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes);
      } catch {
        throw new UserError('manifest is not valid utf-8', 400);
      }

      let parsedManifest: unknown;
      try {
        parsedManifest = JSON.parse(manifestString);
      } catch {
        throw new UserError('manifest is not valid json', 400);
      }

      this.#manifestRead = true;
      return parsedManifest;
    } catch (error) {
      try {
        await this.#reader.cancel();
      } catch {
        // Ignore cancellation errors.
      }
      throw error;
    }
  }

  getTarballStream() {
    if (!this.#manifestRead) {
      throw new Error('you must call getManifest() before getting the tarball stream');
    }

    this.#reader.releaseLock();

    const { readable, writable } = new TransformStream();
    this.#stream.pipeTo(writable).catch(() => {});

    return readable;
  }
}
