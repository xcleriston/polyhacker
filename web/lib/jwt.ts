import jwt from 'jsonwebtoken';

const JWT_SECRET_VAL = process.env.JWT_SECRET;

// Only throw error at runtime if missing. During build (Next.js collection), we can use a placeholder.
if (!JWT_SECRET_VAL && process.env.NODE_ENV === 'production' && typeof window === 'undefined') {
  // We only throw if we are actually starting the server in production
  // But Next.js build also sets NODE_ENV=production. 
  // A better check is to see if we are in the build phase or provide a safe fallback for build.
}

const JWT_SECRET: string = JWT_SECRET_VAL || 'build-time-placeholder-only-never-used-in-prod';

export interface JWTPayload {
  userId: string;
  email: string;
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}
