import bcrypt from "bcryptjs";

// GoTrue stored bcrypt hashes ($2a$…), so migrated users keep working and new
// sign-ups get the same format.
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return Promise.resolve(false);
  return bcrypt.compare(plain, hash);
}
