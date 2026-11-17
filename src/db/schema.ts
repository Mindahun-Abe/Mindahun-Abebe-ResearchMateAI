import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').default('Researcher'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const researchNotes = pgTable('research_notes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  projectId: text('project_id').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  category: text('category').default('Synthesis Memo').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const researchSnapshots = pgTable('research_snapshots', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  projectId: text('project_id').notNull(),
  projectTitle: text('project_title').notNull(),
  includedCount: integer('included_count').default(0).notNull(),
  totalCount: integer('total_count').default(0).notNull(),
  summary: text('summary').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  researchNotes: many(researchNotes),
  researchSnapshots: many(researchSnapshots),
}));

export const researchNotesRelations = relations(researchNotes, ({ one }) => ({
  author: one(users, {
    fields: [researchNotes.userId],
    references: [users.id],
  }),
}));

export const researchSnapshotsRelations = relations(researchSnapshots, ({ one }) => ({
  author: one(users, {
    fields: [researchSnapshots.userId],
    references: [users.id],
  }),
}));
