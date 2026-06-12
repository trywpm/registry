import type { Sql } from 'postgres';

import postgres from 'postgres';

import { Users } from './users';
import { Tokens } from './tokens';
import { Packages } from './packages';

export class Registry {
  #sql: Sql | undefined;

  private _users?: Users;
  private _tokens?: Tokens;
  private _packages?: Packages;

  constructor(
    private readonly kv: KVNamespace,
    private readonly conStr: string,
  ) {}
  private readonly db = (): Sql =>
    (this.#sql ??= postgres(this.conStr, {
      max: 1,
      fetch_types: false,
      idle_timeout: 15,
      connect_timeout: 10,
    }));

  get users() {
    this._users ??= new Users(this.db, this.kv);
    return this._users;
  }

  get packages() {
    this._packages ??= new Packages(this.db, this.kv);
    return this._packages;
  }

  get tokens() {
    this._tokens ??= new Tokens(this.db, this.kv);
    return this._tokens;
  }
}

// export types
export type { UserWithToken } from './users';
export type { PublishState } from './packages';
