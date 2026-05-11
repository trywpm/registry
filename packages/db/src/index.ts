import type { Sql } from 'postgres';

import { Users } from './users';
import { Tokens } from './tokens';
import { Packages } from './packages';

export class Registry {
  private _users?: Users;
  private _tokens?: Tokens;
  private _packages?: Packages;

  constructor(
    private readonly db: () => Sql,
    private readonly kv: KVNamespace,
  ) {}

  get users() {
    this._users ??= new Users(this.db(), this.kv);
    return this._users;
  }

  get packages() {
    this._packages ??= new Packages(this.db(), this.kv);
    return this._packages;
  }

  get tokens() {
    this._tokens ??= new Tokens(this.db(), this.kv);
    return this._tokens;
  }
}

// export types
export type { UserWithToken } from './users';
