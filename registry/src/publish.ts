import { DurableObject } from 'cloudflare:workers';

import { Logger } from '@wpm/logger';
import { canUser } from '@wpm/rbac';
import { Registry } from '@wpm/db';

import type { UserId } from '@wpm/types';
import type { Package } from '@wpm/manifest';
import type { PublishState } from '@wpm/db';

import { getPresigner } from '@/lib/presigner';

type PublishOptions = {
  userId: UserId;
  requestId: string;
};

let gfmReady: Promise<unknown> | undefined;

export class Publish extends DurableObject {
  private _repos: Registry | undefined;
  private _logger: Logger | undefined;

  get repos(): Registry {
    this._repos ??= new Registry(this.env.cache, this.env.pg.connectionString);
    return this._repos;
  }

  get logger(): Logger {
    this._logger ??= new Logger(this.env.APP_ENV === 'development' ? 10 : 30, '');
    return this._logger;
  }

  /** Serialize and run a publish: validate, promote the tarball, sign, commit. */
  async publish(manifest: Package, stagingKey: string, opts: PublishOptions): Promise<Response> {
    const logger = this.logger.child({
      userId: opts.userId,
      package: manifest.name,
      version: manifest.version,
      component: 'PublishDO',
      requestId: opts.requestId,
    });

    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        return await this.runPublish(manifest, stagingKey, opts, logger);
      } finally {
        // The Postgres connection opened during runPublish is tied to this
        // invocation's I/O context. Reusing it in a subsequent invocation can
        // cause queries to hang (writes succeed, but responses never arrive),
        // eventually triggering the 30s blockConcurrencyWhile reset. Close the
        // connection here so each publish starts with a fresh connection,
        // matching the per-request lifecycle used by the main worker's
        // RequestContext.
        await this._repos?.end();
      }
    });
  }

  /** Validate, promote the staged tarball to its final key, sign, and commit. */
  private async runPublish(
    manifest: Package,
    stagingKey: string,
    opts: PublishOptions,
    logger: Logger,
  ): Promise<Response> {
    let state: PublishState | null;
    try {
      state = await this.repos.packages.getPublishState(
        manifest.name,
        manifest.version,
        opts.userId,
      );
    } catch (err) {
      logger.error('failed to load publish state', { err });
      return Response.json({ error: 'internal server error' }, { status: 500 });
    }

    const validationError = this.validatePublishRequest(state, manifest);
    if (validationError) {
      return validationError;
    }

    logger.info('Starting package publish');

    const finalKey = `${manifest.visibility}-packages/${manifest.name}/${manifest.version}.tar.zst`;

    try {
      const res = await getPresigner(this.env).copy({
        to: finalKey,
        from: stagingKey,
        rename: true,
        expiresIn: 60,
        retries: 1,
        timeoutMs: 10_000,
      });

      if (!res.ok) {
        logger.error('failed to promote tarball', {
          finalKey,
          stagingKey,
          status: res.status,
          statusText: res.statusText,
        });
        return Response.json({ error: 'internal server error' }, { status: 500 });
      }
    } catch (err) {
      logger.error('failed to promote tarball', { finalKey, stagingKey, err });
      return Response.json({ error: 'internal server error' }, { status: 500 });
    }

    try {
      const { signManifest } = await import('@/lib/sign-manifest');
      await signManifest(this.env, manifest);
    } catch (err) {
      logger.error('failed to sign manifest', { err });
      return Response.json({ error: 'internal server error' }, { status: 500 });
    }

    try {
      const result = state
        ? await this.repos.packages.insertVersion(manifest, opts.userId, state.id)
        : await this.repos.packages.createWithVersion(manifest, opts.userId);

      if (!result.committed) {
        const fresh = await this.repos.packages.getPublishState(
          manifest.name,
          manifest.version,
          opts.userId,
        );

        const verdict = this.validatePublishRequest(fresh, manifest);
        if (verdict) {
          return verdict;
        }

        logger.error('publish commit conflicted', { created: result.created });

        return Response.json(
          { error: `${manifest.name}@${manifest.version} already exists` },
          { status: 409 },
        );
      }
    } catch (err) {
      // Do NOT delete the promoted tarball here. If insertVersion fails, we cannot
      // determine whether the commit actually succeeded. Deleting the tarball risks
      // orphaning a committed version (DB row with no tarball), which is forbidden.
      //
      // A tarball with no committed DB row is acceptable and will be cleaned up by
      // the reconciliation sweep.
      logger.error('Failed to publish package', { err });
      return Response.json({ error: 'internal server error' }, { status: 500 });
    }

    if (manifest.readme) {
      try {
        const [{ default: mod }, { init, render }] = await Promise.all([
          import('gfm-wasm/wasm'),
          import('gfm-wasm'),
        ]);
        await (gfmReady ??= init(mod));
        await this.env.readme.put(`${manifest.name}.html`, render(manifest.readme));
      } catch (err) {
        logger.error('Failed to upload readme', { err });
      }
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
