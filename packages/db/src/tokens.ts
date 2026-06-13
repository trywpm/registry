import { Base } from './base';

export class Tokens extends Base {
  async updateLastUsed(tokenHash: string) {
    await this.db`
      UPDATE "token"
      SET "last_used" = now()
      WHERE "token_hash" = ${tokenHash}
    `;
  }
}
