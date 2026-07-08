import { describe, expect, it } from 'vitest';
import { preparePasswordResetEmail } from '../auth';

describe('preparePasswordResetEmail', () => {
  it('requires an email address before sending a password reset', () => {
    expect(preparePasswordResetEmail('   ')).toEqual({
      ok: false,
      message: 'Enter your email address to reset your password.',
    });
  });

  it('trims the email address before sending a password reset', () => {
    expect(preparePasswordResetEmail('  player@example.com  ')).toEqual({
      ok: true,
      email: 'player@example.com',
    });
  });
});
