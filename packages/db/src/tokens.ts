import type { TokenId } from '@wpm/types';

import { Base } from './base';

export class Tokens extends Base {
  async updateLastUsed(tokenHash: string) {
    await this.db`
      UPDATE "public"."token"
      SET "last_used" = now()
      WHERE "token_hash" = ${tokenHash}
    `;
  }

  async deleteByHash(tokenHash: string) {
    await this.invalidate(`user:by-token:${tokenHash}`);

    await this.db`
      DELETE FROM "public"."token"
      WHERE "token_hash" = ${tokenHash}
    `;
  }

  async deleteById(tokenId: TokenId) {
    const [row] = await this.db<[{ token_hash: string }?]>`
      SELECT "token_hash"
      FROM "public"."token"
      WHERE "id" = ${tokenId}
    `;

    if (!row) {
      return;
    }

    await this.invalidate(`user:by-token:${row.token_hash}`);

    await this.db`
      DELETE FROM "public"."token"
      WHERE "id" = ${tokenId}
    `;
  }
}
