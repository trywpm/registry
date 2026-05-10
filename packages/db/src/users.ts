import type { UserStatus } from '@wpm/util/constants';

import type { UserId, TokenId } from './types';

import { Base } from './base';

export type UserWithToken = {
  email: string;
  status: UserStatus;
  scopes: string[];
  expiry: string | null;
  user_id: UserId;
  username: string;
  token_id: TokenId;
  allowed_cidrs: string[] | null;
};

export class Users extends Base {
  async getByToken(tokenHash: string) {
    return this.cached<UserWithToken>(
      `user:by-token:${tokenHash}`,
      async () => {
        const [row] = await this.db<[UserWithToken?]>`
          SELECT
            u.id AS user_id,
            u.email,
            u.username,
            u.status,
            t.id AS token_id,
            t.scopes,
            t.expiry,
            t.allowed_cidrs
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
