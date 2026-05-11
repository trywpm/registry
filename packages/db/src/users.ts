import type { UserStatus } from '@wpm/util/constants';

import type { UserId, TokenId } from './types';

import { Base } from './base';

export type UserWithToken = {
  userId: UserId;
  email: string;
  username: string;
  status: UserStatus;

  tokenId: TokenId;
  tokenScopes: string[];
  tokenExpiry?: Date;
  tokenCidrs?: string[];
};

export class Users extends Base {
  async getByToken(tokenHash: string) {
    return this.cached<UserWithToken>(
      `user:by-token:${tokenHash}`,
      async () => {
        const [row] = await this.db<[UserWithToken?]>`
          SELECT
            u.id AS userId,
            u.email,
            u.username,
            u.status,
            t.id AS tokenId,
            t.scopes as tokenScopes,
            t.expiry AS tokenExpiry,
            t.allowed_cidrs AS tokenCidrs
          FROM "public"."users" u
          INNER JOIN "public"."token" t ON u.id = t.user_id
          WHERE t.token_hash = ${tokenHash}
        `;

        return row ?? null;
      },

      // @todo: don't cache ephemeral tokens at all once oidc is implemented
      { ttl: 604800, cacheNull: true }, // 7 days
    );
  }
}
