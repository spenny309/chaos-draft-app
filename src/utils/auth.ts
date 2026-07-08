type PasswordResetEmailResult =
  | { ok: true; email: string }
  | { ok: false; message: string };

export function preparePasswordResetEmail(email: string): PasswordResetEmailResult {
  const trimmedEmail = email.trim();

  if (!trimmedEmail) {
    return {
      ok: false,
      message: 'Enter your email address to reset your password.',
    };
  }

  return { ok: true, email: trimmedEmail };
}
