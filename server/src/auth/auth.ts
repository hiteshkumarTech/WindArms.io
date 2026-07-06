import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const DEV_SECRET = 'windarms-dev-secret-change-me';
const SECRET = process.env.JWT_SECRET ?? DEV_SECRET;
const TOKEN_LIFETIME = '7d';

if (SECRET === DEV_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('[auth] WARNING: JWT_SECRET is not set — using the dev secret in production!');
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(userId: string): string {
  return jwt.sign({}, SECRET, { subject: userId, expiresIn: TOKEN_LIFETIME });
}

/** Returns the user id from a valid token, or null. */
export function verifyToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, SECRET);
    if (typeof decoded === 'object' && decoded !== null && typeof decoded.sub === 'string') {
      return decoded.sub;
    }
    return null;
  } catch {
    return null;
  }
}

/** Extracts a bearer token from an Authorization header. */
export function bearerToken(header: string | undefined): string | null {
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}
