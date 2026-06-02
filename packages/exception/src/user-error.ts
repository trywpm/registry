type ErrorStatus = 400 | 401 | 403 | 404 | 413 | 422;

export class UserError extends Error {
  override readonly name = 'UserError';

  readonly status: ErrorStatus;

  constructor(message: string, status: ErrorStatus = 400) {
    super(message);
    this.status = status;
  }
}
