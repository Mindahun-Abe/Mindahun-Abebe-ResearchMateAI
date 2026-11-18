import { relations } from 'drizzle-orm';
import { boolean, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').default('Researcher'),
  role: text('role').default('researcher').notNull(), // 'admin' | 'researcher' | 'institutional'
  status: text('status').default('active').notNull(), // 'active' | 'suspended'
  planCode: text('plan_code').default('free').notNull(), // 'free' | 'student' | 'researcher_pro' | 'professional' | 'institutional'
  aiCreditsBalance: integer('ai_credits_balance').default(50).notNull(),
  aiCreditsUsed: integer('ai_credits_used').default(0).notNull(),
  storageUsedBytes: integer('storage_used_bytes').default(0).notNull(),
  organization: text('organization').default(''),
  country: text('country').default(''),
  emailVerified: boolean('email_verified').default(false).notNull(),
  mfaEnabled: boolean('mfa_enabled').default(false).notNull(),
  lastLoginAt: timestamp('last_login_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
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

export const subscriptionPlans = pgTable('subscription_plans', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(), // 'free' | 'student' | 'researcher_pro' | 'professional' | 'institutional'
  name: text('name').notNull(),
  tagline: text('tagline').notNull(),
  monthlyPriceUsd: integer('monthly_price_usd').default(0).notNull(), // cents
  annualPriceUsd: integer('annual_price_usd').default(0).notNull(), // cents
  monthlyPriceEtb: integer('monthly_price_etb').default(0).notNull(),
  annualPriceEtb: integer('annual_price_etb').default(0).notNull(),
  maxProjects: integer('max_projects').default(2).notNull(),
  maxArticlesPerProject: integer('max_articles_per_project').default(100).notNull(),
  monthlyAiCredits: integer('monthly_ai_credits').default(50).notNull(),
  storageQuotaMb: integer('storage_quota_mb').default(100).notNull(),
  bulkPdfEnabled: boolean('bulk_pdf_enabled').default(false).notNull(),
  prismaAutomationEnabled: boolean('prisma_automation_enabled').default(false).notNull(),
  teamSeats: integer('team_seats').default(1).notNull(),
  priorityProcessing: boolean('priority_processing').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  planCode: text('plan_code').default('free').notNull(),
  billingCycle: text('billing_cycle').default('monthly').notNull(), // 'monthly' | 'annual'
  status: text('status').default('active').notNull(), // 'trialing' | 'active' | 'past_due' | 'grace_period' | 'cancelled' | 'expired'
  provider: text('provider').default('free').notNull(), // 'free' | 'chapa' | 'telebirr' | 'google_play' | 'admin_grant'
  providerSubscriptionId: text('provider_subscription_id').default(''),
  currentPeriodStart: timestamp('current_period_start').defaultNow(),
  currentPeriodEnd: timestamp('current_period_end'),
  trialEndsAt: timestamp('trial_ends_at'),
  graceEndsAt: timestamp('grace_ends_at'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false).notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const paymentTransactions = pgTable('payment_transactions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  planCode: text('plan_code').notNull(),
  billingCycle: text('billing_cycle').default('monthly').notNull(),
  amount: integer('amount').notNull(), // minor unit or whole unit matching currency
  currency: text('currency').default('ETB').notNull(),
  provider: text('provider').notNull(), // 'chapa' | 'telebirr' | 'google_play' | 'admin_grant'
  txRef: text('tx_ref').notNull().unique(),
  providerRef: text('provider_ref').default(''),
  status: text('status').default('pending').notNull(), // 'pending' | 'verified' | 'failed' | 'refunded'
  invoiceNumber: text('invoice_number').notNull(),
  metadataJson: text('metadata_json').default('{}'),
  verifiedAt: timestamp('verified_at'),
  refundedAt: timestamp('refunded_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const cloudProjects = pgTable('cloud_projects', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  localProjectId: text('local_project_id').notNull(),
  title: text('title').notNull(),
  discipline: text('discipline').default('Interdisciplinary').notNull(),
  frameworkType: text('framework_type').default('PICOC').notNull(),
  articleCount: integer('article_count').default(0).notNull(),
  includedCount: integer('included_count').default(0).notNull(),
  payloadJson: text('payload_json').notNull(),
  version: integer('version').default(1).notNull(),
  lastSyncedDevice: text('last_synced_device').default('web').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const storageDocuments = pgTable('storage_documents', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  projectId: text('project_id').notNull(),
  articleId: text('article_id').default(''),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').default('application/pdf').notNull(),
  sizeBytes: integer('size_bytes').default(0).notNull(),
  storagePath: text('storage_path').notNull(),
  downloadUrl: text('download_url').default(''),
  category: text('category').default('pdf').notNull(), // 'pdf' | 'supplement' | 'report'
  createdAt: timestamp('created_at').defaultNow(),
});

export const loginHistory = pgTable('login_history', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  email: text('email').notNull(),
  provider: text('provider').default('firebase').notNull(),
  deviceLabel: text('device_label').default('Web Browser').notNull(),
  userAgent: text('user_agent').default(''),
  ipAddress: text('ip_address').default(''),
  status: text('status').default('active').notNull(), // 'active' | 'revoked'
  createdAt: timestamp('created_at').defaultNow(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  actorUid: text('actor_uid').notNull(),
  actorEmail: text('actor_email').default('').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type').default('system').notNull(),
  targetId: text('target_id').default('').notNull(),
  details: text('details').default('{}').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const announcements = pgTable('announcements', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  severity: text('severity').default('info').notNull(), // 'info' | 'warning' | 'release'
  isActive: boolean('is_active').default(true).notNull(),
  createdByUid: text('created_by_uid').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const supportTickets = pgTable('support_tickets', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  email: text('email').notNull(),
  subject: text('subject').notNull(),
  category: text('category').default('General').notNull(),
  message: text('message').notNull(),
  status: text('status').default('open').notNull(), // 'open' | 'resolved'
  createdAt: timestamp('created_at').defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  researchNotes: many(researchNotes),
  researchSnapshots: many(researchSnapshots),
  subscriptions: many(subscriptions),
  paymentTransactions: many(paymentTransactions),
  cloudProjects: many(cloudProjects),
  storageDocuments: many(storageDocuments),
  loginHistory: many(loginHistory),
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

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  subscriber: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
}));

export const paymentTransactionsRelations = relations(paymentTransactions, ({ one }) => ({
  payer: one(users, {
    fields: [paymentTransactions.userId],
    references: [users.id],
  }),
}));

export const cloudProjectsRelations = relations(cloudProjects, ({ one }) => ({
  owner: one(users, {
    fields: [cloudProjects.userId],
    references: [users.id],
  }),
}));

export const storageDocumentsRelations = relations(storageDocuments, ({ one }) => ({
  owner: one(users, {
    fields: [storageDocuments.userId],
    references: [users.id],
  }),
}));

export const loginHistoryRelations = relations(loginHistory, ({ one }) => ({
  user: one(users, {
    fields: [loginHistory.userId],
    references: [users.id],
  }),
}));
