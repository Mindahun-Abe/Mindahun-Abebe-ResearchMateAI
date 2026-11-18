import { and, desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import { researchNotes, researchSnapshots, users } from './schema.ts';

const BOOTSTRAP_ADMIN_EMAIL = 'mindahun77@gmail.com';

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string,
  options?: { emailVerified?: boolean; touchLogin?: boolean }
) {
  try {
    const cleanEmail = (email || '').trim().toLowerCase();
    const isBootstrapAdmin =
      cleanEmail === BOOTSTRAP_ADMIN_EMAIL && Boolean(options?.emailVerified);

    const existingRows = await db.select().from(users).where(eq(users.uid, uid));
    const existing = existingRows[0];

    if (existing) {
      const updateSet: Record<string, unknown> = {
        email: email || existing.email,
        updatedAt: new Date(),
      };
      if (displayName) updateSet.displayName = displayName.slice(0, 120);
      if (options?.emailVerified !== undefined) {
        updateSet.emailVerified = options.emailVerified;
      }
      if (options?.touchLogin) {
        updateSet.lastLoginAt = new Date();
      }
      if (isBootstrapAdmin && existing.role !== 'admin') {
        updateSet.role = 'admin';
      }

      const updated = await db
        .update(users)
        .set(updateSet)
        .where(eq(users.uid, uid))
        .returning();
      return updated[0];
    }

    const result = await db
      .insert(users)
      .values({
        uid,
        email: email || `${uid}@researcher.local`,
        displayName: (displayName || email.split('@')[0] || 'Researcher').slice(0, 120),
        role: isBootstrapAdmin ? 'admin' : 'researcher',
        status: 'active',
        planCode: 'free',
        aiCreditsBalance: 50,
        aiCreditsUsed: 0,
        storageUsedBytes: 0,
        emailVerified: Boolean(options?.emailVerified),
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Could not synchronize user profile. Please try again later.', { cause: error });
  }
}

export async function listUserNotes(uid: string) {
  try {
    return await db
      .select({
        id: researchNotes.id,
        projectId: researchNotes.projectId,
        title: researchNotes.title,
        content: researchNotes.content,
        category: researchNotes.category,
        createdAt: researchNotes.createdAt,
      })
      .from(researchNotes)
      .innerJoin(users, eq(researchNotes.userId, users.id))
      .where(eq(users.uid, uid))
      .orderBy(desc(researchNotes.createdAt));
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Could not load saved research notes. Please try again later.', { cause: error });
  }
}

export async function createUserNote(
  uid: string,
  email: string,
  payload: { projectId: string; title: string; content: string; category?: string }
) {
  try {
    const user = await getOrCreateUser(uid, email);
    const inserted = await db
      .insert(researchNotes)
      .values({
        userId: user.id,
        projectId: payload.projectId,
        title: payload.title.slice(0, 200),
        content: payload.content.slice(0, 8000),
        category: (payload.category || 'Synthesis Memo').slice(0, 80),
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Could not save research note. Please try again later.', { cause: error });
  }
}

export async function deleteUserNote(uid: string, noteId: number) {
  try {
    const userRows = await db.select().from(users).where(eq(users.uid, uid));
    const user = userRows[0];
    if (!user) return false;
    await db
      .delete(researchNotes)
      .where(and(eq(researchNotes.id, noteId), eq(researchNotes.userId, user.id)));
    return true;
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Could not delete research note. Please try again later.', { cause: error });
  }
}

export async function listUserSnapshots(uid: string) {
  try {
    return await db
      .select({
        id: researchSnapshots.id,
        projectId: researchSnapshots.projectId,
        projectTitle: researchSnapshots.projectTitle,
        includedCount: researchSnapshots.includedCount,
        totalCount: researchSnapshots.totalCount,
        summary: researchSnapshots.summary,
        createdAt: researchSnapshots.createdAt,
      })
      .from(researchSnapshots)
      .innerJoin(users, eq(researchSnapshots.userId, users.id))
      .where(eq(users.uid, uid))
      .orderBy(desc(researchSnapshots.createdAt));
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Could not load review snapshots. Please try again later.', { cause: error });
  }
}

export async function createUserSnapshot(
  uid: string,
  email: string,
  payload: {
    projectId: string;
    projectTitle: string;
    includedCount: number;
    totalCount: number;
    summary: string;
  }
) {
  try {
    const user = await getOrCreateUser(uid, email);
    const inserted = await db
      .insert(researchSnapshots)
      .values({
        userId: user.id,
        projectId: payload.projectId,
        projectTitle: payload.projectTitle.slice(0, 240),
        includedCount: Math.max(0, Math.floor(payload.includedCount || 0)),
        totalCount: Math.max(0, Math.floor(payload.totalCount || 0)),
        summary: payload.summary.slice(0, 2000),
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Could not save review snapshot. Please try again later.', { cause: error });
  }
}
