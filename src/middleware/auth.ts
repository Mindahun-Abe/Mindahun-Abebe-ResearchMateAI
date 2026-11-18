import { Request, Response, NextFunction } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getOrCreateUser } from '../db/users.ts';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUserRole?: string;
  dbUserStatus?: string;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

export const optionalAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1];
    try {
      req.user = await adminAuth.verifyIdToken(token);
    } catch {
      // Optional auth ignores expired/malformed token and treats request as anonymous
    }
  }
  next();
};

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user?.uid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const userRow = await getOrCreateUser(
      req.user.uid,
      req.user.email || '',
      req.user.name,
      { emailVerified: Boolean(req.user.email_verified) }
    );
    req.dbUserRole = userRow.role;
    req.dbUserStatus = userRow.status;

    if (userRow.status === 'suspended') {
      return res.status(403).json({ error: 'Account suspended' });
    }
    if (userRow.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Administrator role required' });
    }
    next();
  } catch (error) {
    console.error('Admin verification failed:', error);
    return res.status(500).json({ error: 'Authorization check failed' });
  }
};
