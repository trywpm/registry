import { describe, expect, it } from 'vitest';

import { UserError } from './user-error';

describe('UserError', () => {
  it('is an Error with a user-facing message and status', () => {
    const err = new UserError('Invalid key ID');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(UserError);
    expect(err.name).toBe('UserError');
    expect(err.message).toBe('Invalid key ID');
    expect(err.status).toBe(400);
  });

  it('accepts a custom status', () => {
    expect(new UserError('Not found', 404).status).toBe(404);
  });
});
