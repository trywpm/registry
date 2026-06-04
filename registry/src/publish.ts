import { Buffer } from 'node:buffer';
import { DurableObject } from 'cloudflare:workers';

import mod from 'gfm-wasm/wasm';
import postgres from 'postgres';
import { Logger } from '@wpm/logger';
import { canUser } from '@wpm/rbac';
import { Registry } from '@wpm/db';
import { KmsClient } from '@wpm/kms';
import { init, render } from 'gfm-wasm';

import type { Sql } from 'postgres';
import type { UserId } from '@wpm/types';
import type { Package } from '@wpm/manifest';

type PublishOptions = {
  userId: UserId;
  requestId: string;
};

type ExistingPackage = Awaited<ReturnType<Registry['packages']['getOrInsert']>>;

const LEASE_MS = 5 * 60 * 1000; // a crashed lock frees itself after 5 minutes

const gfmReady = init(mod);

export class Publish extends DurableObject {
  private _db: Sql | undefined;
  private kms: KmsClient | undefined;
  private _repos: Registry | undefined;
  private _logger: Logger | undefined;

  get repos(): Registry {
    const getDb = (): Sql => {
      this._db ??= postgres(this.env.pg.connectionString, {
        max: 1,
        fetch_types: false,
        idle_timeout: 15,
        connect_timeout: 10,
      });

      return this._db;
    };

    this._repos ??= new Registry(getDb, this.env.cache);
    return this._repos;
  }

  get logger(): Logger {
    this._logger ??= new Logger(this.env.APP_ENV === 'development' ? 10 : 30, '');
    return this._logger;
  }

  /** Handle publish requests with a distributed lock to prevent concurrent publishes. */
  async publish(
    manifest: Package,
    tarballStream: ReadableStream,
    opts: PublishOptions,
  ): Promise<Response> {
    const logger = this.logger.child({
      userId: opts.userId,
      package: manifest.name,
      version: manifest.version,
      component: 'PublishDO',
      requestId: opts.requestId,
    });

    return this.withLock(logger, manifest.name, () =>
      this.runPublish(manifest, tarballStream, opts, logger),
    );
  }

  /** Acquire a lock to ensure only one said operation can run at a time */
  private async withLock(
    logger: Logger,
    subject: string,
    work: () => Promise<Response>,
  ): Promise<Response> {
    const now = Date.now();

    const lockedAt = await this.ctx.storage.get<number>('state');
    if (lockedAt && now - lockedAt < LEASE_MS) {
      logger.warn('publish rejected, another publish in progress', {
        lockAgeMs: now - lockedAt,
      });

      return Response.json(
        { error: `${subject} is already being published, retry shortly` },
        { status: 409 },
      );
    }

    await this.ctx.storage.put('state', now);

    try {
      return await work();
    } finally {
      if (this._db) {
        const db = this._db;
        this._db = undefined;
        this._repos = undefined;
        await db.end().catch(() => {});
      }
      await this.ctx.storage.delete('state');
    }
  }

  /** Publish a package with the given manifest and tarball. */
  private async runPublish(
    manifest: Package,
    tarballStream: ReadableStream,
    opts: PublishOptions,
    logger: Logger,
  ): Promise<Response> {
    const existing = await this.repos.packages.getOrInsert(
      manifest.name,
      manifest.version,
      manifest.type,
      manifest.visibility,
      opts.userId,
    );
    if (!existing.id) {
      throw new Error('package id should be defined after getOrInsert');
    }

    const validationError = this.validatePublishRequest(existing, manifest);
    if (validationError) {
      return validationError;
    }

    logger.info('Starting package publish');

    const s3Key = `${manifest.visibility}/${manifest.name}/${manifest.version}.tar.zst`;
    const upload = this.uploadTarball(s3Key, tarballStream, manifest);

    try {
      logger.debug('uploading tarball', {
        s3Key,
        digest: manifest.dist.digest,
        packedSize: manifest.dist.packedSize,
      });

      // upload the tarball first and sign the manifest in parallel.
      await Promise.all([upload, this.signManifest(manifest)]);

      // commit the new version to the database.
      await this.repos.packages.insertVersion(manifest, opts.userId, existing.id);
    } catch (err) {
      await upload.catch(() => {});
      await this.env.tarball.delete(s3Key).catch(() => {});

      logger.error('Failed to publish package', { err });

      return Response.json({ error: 'internal server error' }, { status: 500 });
    }

    // readme upload - if it fails, we don't want to fail the whole publish
    // since it's not critical and can be retried separately.
    if (manifest.readme) {
      try {
        await gfmReady;
        await this.env.readme.put(`${manifest.name}.html`, render(manifest.readme));
      } catch (err) {
        logger.error('Failed to upload readme', { err });
      }
    }

    logger.info('Package published successfully');

    return new Response(null, { status: 201 });
  }

  /** Validate the publish request against the existing package. */
  private validatePublishRequest(
    existing: ExistingPackage,
    manifest: Package,
  ): Response | undefined {
    // user without a role on the package can't publish
    if (!existing.role) {
      return Response.json({ error: 'not found' }, { status: 404 });
    }

    // user must have publish permission to publish
    if (!canUser(existing.role, 'publish', 'package')) {
      return Response.json({ error: 'user is not authorized to publish package' }, { status: 403 });
    }

    // only active packages can have new versions
    if (existing.status !== 'active') {
      return Response.json(
        { error: `${manifest.name} is not accepting new versions` },
        { status: 403 },
      );
    }

    // package versions are immutable.
    if (existing.versionExists) {
      return Response.json(
        { error: `${manifest.name}@${manifest.version} already exists` },
        { status: 409 },
      );
    }

    // package type is immutable.
    if (existing.type !== manifest.type) {
      return Response.json(
        { error: `package type mismatch, expected ${existing.type}` },
        { status: 400 },
      );
    }

    // visibility can't be changed in publish request.
    //
    // user must explicitly update it from dashboard.
    if (existing.visibility !== manifest.visibility) {
      return Response.json(
        { error: `package visibility mismatch, expected ${existing.visibility}` },
        { status: 400 },
      );
    }

    return undefined;
  }

  /** Stream tarball to object storage with strict content length and integrity checks. */
  private async uploadTarball(
    s3Key: string,
    tarballStream: ReadableStream,
    manifest: Package,
  ): Promise<void> {
    const fls = new FixedLengthStream(manifest.dist.packedSize);
    await Promise.all([
      tarballStream.pipeTo(fls.writable),
      this.env.tarball.put(s3Key, fls.readable, {
        sha256: Buffer.from(manifest.dist.digest.slice(7), 'base64'), // Remove "sha256:" prefix
      }),
    ]);
  }

  /** Sign the manifest with KMS and attach the signature to it. */
  private async signManifest(manifest: Package): Promise<void> {
    manifest.dist.signatures = [
      {
        sig: await this.sign(`${manifest.name}:${manifest.version}:${manifest.dist.digest}`),
        keyid: this.env.SIG_KEY_SPKI_FINGERPRINT, // SPKI fingerprint used to identify the public key for signature verification.
      },
    ];
  }

  /** Sign a message with KMS and return the signature. */
  private async sign(message: string): Promise<string> {
    this.kms ??= new KmsClient({
      region: this.env.AWS_REGION,
      accessKeyId: this.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: this.env.AWS_SECRET_ACCESS_KEY,
      endpoint: this.env.AWS_ENDPOINT_URL ? this.env.AWS_ENDPOINT_URL : undefined,
    });

    const res = await this.kms.sign({
      KeyId: this.env.SIG_KEY_ID,
      Message: Buffer.from(message),
      MessageType: 'RAW',
      SigningAlgorithm: 'ECDSA_SHA_256',
    });

    return Buffer.from(res.Signature).toString('base64');
  }
}
