import { Buffer } from 'node:buffer';
import { DurableObject } from 'cloudflare:workers';

import mod from 'gfm-wasm/wasm';
import { Logger } from '@wpm/logger';
import { canUser } from '@wpm/rbac';
import { Registry } from '@wpm/db';
import { init, render } from 'gfm-wasm';

import type { UserId } from '@wpm/types';
import type { Package } from '@wpm/manifest';
import type { PublishState } from '@wpm/db';

type PublishOptions = {
  userId: UserId;
  requestId: string;
};

let gfmReady: ReturnType<typeof init> | undefined;

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

    return this.ctx.blockConcurrencyWhile(() =>
      this.runPublish(manifest, stagingKey, opts, logger),
    );
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

    const sha256 = Buffer.from(manifest.dist.digest.slice(7), 'base64'); // Remove "sha256:" prefix
    const finalKey = `${manifest.visibility}/${manifest.name}/${manifest.version}.tar.zst`;

    try {
      const staged = await this.env.tarball.get(stagingKey);
      if (!staged) {
        logger.error('staging object missing', { stagingKey });
        return Response.json({ error: 'internal server error' }, { status: 500 });
      }

      await this.env.tarball.put(finalKey, staged.body, { sha256 });
    } catch (err) {
      logger.error('failed to promote tarball', { stagingKey, finalKey, err });
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
      logger.error('Failed to publish package', { err });
      return Response.json({ error: 'internal server error' }, { status: 500 });
    }

    if (manifest.readme) {
      try {
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
