import { Buffer } from 'node:buffer';
import { DurableObject } from 'cloudflare:workers';

import postgres from 'postgres';
import { KmsClient } from '@wpm/kms';

import type { Sql } from 'postgres';
import type { Package } from '@wpm/manifest';

export class Publish extends DurableObject {
  private _db: Sql | undefined;
  private kms: KmsClient | undefined;

  get db(): Sql {
    this._db ??= postgres(this.env.pg.connectionString, {
      max: 1,
      fetch_types: false,
      idle_timeout: 15,
      connect_timeout: 10,
    });

    return this._db;
  }

  async publish(request: Request, manifest: Package, data: { userId: string; packageId: string }) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const body = request.body;
      if (!body) {
        throw new Error('missing request body');
      }

      const s3Key = `${manifest.visibility}/${manifest.name}/${manifest.version}.tar.zst`;

      // === Upload the tarball to R2 ===

      const fls = new FixedLengthStream(manifest.dist.packedSize);
      try {
        await Promise.all([
          body.pipeTo(fls.writable),
          this.env.tarball.put(s3Key, fls.readable, {
            sha256: Buffer.from(manifest.dist.digest.slice(7)), // Remove "sha256:" prefix
          }),
        ]);
      } catch (err) {
        await this.env.tarball.delete(s3Key);
        throw err;
      }

      // === Sign the manifest ===

      try {
        // @ts-expect-error -- adding signatures to manifest
        manifest.dist.signatures = [
          {
            sig: await this.sign(`${manifest.name}:${manifest.version}:${manifest.dist.digest}`),
            keyid: '',
          },
        ];
      } catch (err) {
        await this.env.tarball.delete(s3Key);
        throw err;
      }

      // === Commit to DB ===

      try {
        await this.db.begin(async (sql) => {
          await sql`
            insert into
              "package_version" (
                "description",
                "version",
                "requires",
                "license",
                "homepage",
                "tags",
                "team",
                "dependencies",
                "devDependencies",
                "released_by",
                "dist",
                "_wpm",
                "yanked",
                "package_id"
              )
            values
              (
                ${manifest.description ?? null},
                ${manifest.version},
                ${sql.json(manifest.requires ?? null)},
                ${manifest.license ?? null},
                ${manifest.homepage ?? null},
                ${manifest.tags ?? null},
                ${manifest.team ?? null},
                ${sql.json(manifest.dependencies ?? null)},
                ${sql.json(manifest.devDependencies ?? null)},
                ${data.userId},
                ${sql.json(manifest.dist)},
                ${manifest._wpm},
                ${false},
                ${data.packageId}
              )
          `;

          if (manifest.tag === '') {
            manifest.tag = 'latest';
          }

          if (manifest.tag !== 'untagged') {
            await sql`
              insert into
                "package_dist_tag" ("tag", "package_id", "version")
              values
                (${manifest.tag}, ${data.packageId}, ${manifest.version})
              on conflict ("tag", "package_id") do update
              set
                "version" = excluded."version"
            `;
          }
        });
      } catch (err) {
        await this.env.tarball.delete(s3Key);
        throw err;
      }
    });
  }

  async alarm() {}

  private async sign(message: string) {
    this.kms ??= new KmsClient({
      region: this.env.AWS_REGION,
      accessKeyId: this.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: this.env.AWS_SECRET_ACCESS_KEY,
      endpoint: this.env.AWS_ENDPOINT_URL ? this.env.AWS_ENDPOINT_URL : undefined,
    });

    const res = await this.kms.sign({
      KeyId: this.env.PAT_HMAC_KEY,
      Message: Buffer.from(message),
      MessageType: 'RAW',
      SigningAlgorithm: 'ECDSA_SHA_256',
    });

    if (res.KeyId !== this.env.PAT_HMAC_KEY) {
      throw new Error('Invalid key ID');
    }

    return Buffer.from(res.Signature).toString('base64');
  }
}
