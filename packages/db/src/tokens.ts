import { Base } from './base';

export class Tokens extends Base {
  async updateLastUsed(tokenHash: string) {
    const sql = await this.sql();
    await sql`
      UPDATE "token"
      SET "last_used" = now()
      WHERE "token_hash" = ${tokenHash}
    `;
  }
}
