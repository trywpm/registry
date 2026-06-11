import { Buffer } from 'node:buffer';
import { DurableObject } from 'cloudflare:workers';

import mod from 'gfm-wasm/wasm';
import postgres from 'postgres';
import { Logger } from '@wpm/logger';
import { canUser } from '@wpm/rbac';
import { Registry } from '@wpm/db';
import { init, render } from 'gfm-wasm';

import type { Sql } from 'postgres';
import type { UserId } from '@wpm/types';
import type { Package } from '@wpm/manifest';
import type { PublishState } from '@wpm/db';

type PublishOptions = {
  userId: UserId;
  requestId: string;
};

type LockState = {
  id: string;
  ts: number;
};

const LEASE_MS = 5 * 60 * 1000;
const DEADLINE_MS = 60 * 1000;

const gfmReady = init(mod);

export class Publish extends DurableObject {
  private _db: Sql | undefined;
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
  async publish(manifest: Package, stagingKey: string, opts: PublishOptions): Promise<Response> {
    const logger = this.logger.child({
      userId: opts.userId,
      package: manifest.name,
      version: manifest.version,
      component: 'PublishDO',
      requestId: opts.requestId,
    });

    return this.withLock(logger, manifest.name, (lockId) =>
      this.runPublish(manifest, stagingKey, opts, lockId, logger),
    );
  }

  /** Acquire a lock to ensure only one said operation can run at a time */
  private async withLock(
    logger: Logger,
    subject: string,
    work: (lockId: string) => Promise<Response>,
  ): Promise<Response> {
    const now = Date.now();
    const lockId = crypto.randomUUID();

    const lock = await this.ctx.storage.get<LockState>('lock');
    if (lock && now - lock.ts < LEASE_MS) {
      logger.warn('publish rejected, another publish in progress', {
        lockAgeMs: now - lock.ts,
      });

      return Response.json(
        { error: `${subject} is already being published, retry shortly` },
        { status: 409 },
      );
    }

    await this.ctx.storage.put<LockState>('lock', { id: lockId, ts: now });

    const TIMED_OUT = Symbol('timed out');

    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;

    try {
      const result = await Promise.race([
        work(lockId),
        new Promise<typeof TIMED_OUT>((resolve) => {
          timer = setTimeout(() => resolve(TIMED_OUT), DEADLINE_MS);
        }),
      ]);

      if (result === TIMED_OUT) {
        timedOut = true;
        logger.error('publish exceeded deadline', { deadlineMs: DEADLINE_MS });
        return Response.json({ error: 'publish timed out, retry shortly' }, { status: 503 });
      }

      return result;
    } finally {
      clearTimeout(timer);

      if (!timedOut) {
        try {
          const current = await this.ctx.storage.get<LockState>('lock');
          if (current?.id === lockId) {
            await this.ctx.storage.delete('lock');
          }
        } catch (err) {
          logger.warn('failed to release publish lock', { err });
        }
      }
    }
  }

  private async ownsLock(lockId: string): Promise<boolean> {
    const current = await this.ctx.storage.get<LockState>('lock');
    return current?.id === lockId;
  }

  /** Validate, promote the staged tarball to its final key, and commit. */
  private async runPublish(
    manifest: Package,
    stagingKey: string,
    opts: PublishOptions,
    lockId: string,
    logger: Logger,
  ): Promise<Response> {
    const state = await this.repos.packages.getPublishState(
      manifest.name,
      manifest.version,
      opts.userId,
    );

    const validationError = this.validatePublishRequest(state, manifest);
    if (validationError) {
      return validationError;
    }

    logger.info('Starting package publish');

    const sha256 = Buffer.from(manifest.dist.digest.slice(7), 'base64'); // Remove "sha256:" prefix
    const finalKey = `${manifest.visibility}/${manifest.name}/${manifest.version}.tar.zst`;

    try {
      const staged = await this.env.tarball.get(stagingKey);
      if (!staged) {
        logger.error('staging object missing', { stagingKey });
        return Response.json({ error: 'internal server error' }, { status: 500 });
      }

      if (!(await this.ownsLock(lockId))) {
        logger.error('lost publish lock before promote', { lockId });
        return Response.json(
          { error: `${manifest.name} is already being published, retry shortly` },
          { status: 409 },
        );
      }

      await this.env.tarball.put(finalKey, staged.body, { sha256 });
    } catch (err) {
      logger.error('failed to promote tarball', { stagingKey, finalKey, err });
      return Response.json({ error: 'internal server error' }, { status: 500 });
    }

    if (!(await this.ownsLock(lockId))) {
      logger.error('lost publish lock before commit', { lockId });
      return Response.json(
        { error: `${manifest.name} is already being published, retry shortly` },
        { status: 409 },
      );
    }

    try {
      const result = state
        ? await this.repos.packages.insertVersion(manifest, opts.userId, state.id)
        : await this.repos.packages.createWithVersion(manifest, opts.userId);

      if (!result.committed) {
        if (!state && !result.created) {
          const fresh = await this.repos.packages.getPublishState(
            manifest.name,
            manifest.version,
            opts.userId,
          );

          const verdict = this.validatePublishRequest(fresh, manifest);
          if (verdict) {
            return verdict;
          }
        }

        logger.error('publish commit conflicted, this should not happen under the lock', {
          created: result.created,
        });

        return Response.json(
          { error: `${manifest.name}@${manifest.version} already exists` },
          { status: 409 },
        );
      }
    } catch (err) {
      logger.error('Failed to publish package', { err });
      return Response.json({ error: 'internal server error' }, { status: 500 });
    }

    if (manifest.readme) {
      const readme = manifest.readme;
      gfmReady
        .then(() => this.env.readme.put(`${manifest.name}.html`, render(readme)))
        .catch((err: unknown) => logger.error('Failed to upload readme', { err }));
    }

    logger.info('Package published successfully');

    return new Response(null, { status: 201 });
  }

  /** Validate the publish request against the authoritative package state. */
  private validatePublishRequest(
    state: PublishState | null,
    manifest: Package,
  ): Response | undefined {
    if (!state) {
      return undefined;
    }

    if (!state.role) {
      return Response.json({ error: 'not found' }, { status: 404 });
    }

    if (!canUser(state.role, 'publish', 'package')) {
      return Response.json({ error: 'user is not authorized to publish package' }, { status: 403 });
    }

    // only active packages can have new versions
    if (state.status !== 'active') {
      return Response.json(
        { error: `${manifest.name} is not accepting new versions` },
        { status: 403 },
      );
    }

    // package versions are immutable.
    if (state.versionExists) {
      return Response.json(
        { error: `${manifest.name}@${manifest.version} already exists` },
        { status: 409 },
      );
    }

    // package type is immutable.
    if (state.type !== manifest.type) {
      return Response.json(
        { error: `package type mismatch, expected ${state.type}` },
        { status: 400 },
      );
    }

    // visibility can't be changed in publish request.
    //
    // user must explicitly update it from dashboard.
    if (state.visibility !== manifest.visibility) {
      return Response.json(
        { error: `package visibility mismatch, expected ${state.visibility}` },
        { status: 400 },
      );
    }

    return undefined;
  }
}
