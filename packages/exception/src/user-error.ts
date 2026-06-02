export class UserError extends Error {
  override readonly name = 'UserError';

  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
