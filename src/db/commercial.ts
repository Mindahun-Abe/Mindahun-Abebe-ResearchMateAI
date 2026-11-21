import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  announcements,
  auditLogs,
  cloudProjects,
  loginHistory,
  paymentTransactions,
  researchNotes,
  researchSnapshots,
  storageDocuments,
  subscriptionPlans,
  subscriptions,
  supportTickets,
  users,
} from './schema.ts';
import { getOrCreateUser } from './users.ts';
import {
  computePlanPricingSchedule,
  getStagePointFromSchedule,
  PricingTenureStage,
  resolveUserTenureSummary,
} from '../utils/pricingSchedule.ts';

export const DEFAULT_PLANS = [
  {
    code: 'free',
    name: 'Free Starter',
    tagline: 'Core systematic review workbench for individual exploratory studies.',
    monthlyPriceUsd: 0,
    annualPriceUsd: 0,
    monthlyPriceEtb: 0,
    annualPriceEtb: 0,
    maxProjects: 2,
    maxArticlesPerProject: 150,
    monthlyAiCredits: 50,
    storageQuotaMb: 100,
    bulkPdfEnabled: false,
    prismaAutomationEnabled: true,
    teamSeats: 1,
    priorityProcessing: false,
    isActive: true,
  },
  {
    code: 'student',
    name: 'Student Scholar',
    tagline: 'Designed for MSc & PhD candidates conducting thesis literature reviews.',
    monthlyPriceUsd: 900,
    annualPriceUsd: 8600,
    monthlyPriceEtb: 1100,
    annualPriceEtb: 10500,
    maxProjects: 6,
    maxArticlesPerProject: 750,
    monthlyAiCredits: 350,
    storageQuotaMb: 1024,
    bulkPdfEnabled: true,
    prismaAutomationEnabled: true,
    teamSeats: 1,
    priorityProcessing: false,
    isActive: true,
  },
  {
    code: 'researcher_pro',
    name: 'Researcher Pro',
    tagline: 'Full AI screening, bulk PDF extraction, appraisal & citation-grounded writing.',
    monthlyPriceUsd: 2400,
    annualPriceUsd: 22900,
    monthlyPriceEtb: 2900,
    annualPriceEtb: 27900,
    maxProjects: 25,
    maxArticlesPerProject: 5000,
    monthlyAiCredits: 2000,
    storageQuotaMb: 5120,
    bulkPdfEnabled: true,
    prismaAutomationEnabled: true,
    teamSeats: 2,
    priorityProcessing: true,
    isActive: true,
  },
  {
    code: 'professional',
    name: 'Professional Lead',
    tagline: 'High-volume systematic evidence synthesis, priority AI queues & deep exports.',
    monthlyPriceUsd: 4900,
    annualPriceUsd: 47000,
    monthlyPriceEtb: 5900,
    annualPriceEtb: 56500,
    maxProjects: 100,
    maxArticlesPerProject: 20000,
    monthlyAiCredits: 7500,
    storageQuotaMb: 20480,
    bulkPdfEnabled: true,
    prismaAutomationEnabled: true,
    teamSeats: 5,
    priorityProcessing: true,
    isActive: true,
  },
  {
    code: 'institutional',
    name: 'Institutional Lab',
    tagline: 'University departments, research centers & multi-reviewer shared governance.',
    monthlyPriceUsd: 14900,
    annualPriceUsd: 143000,
    monthlyPriceEtb: 17900,
    annualPriceEtb: 172000,
    maxProjects: 500,
    maxArticlesPerProject: 50000,
    monthlyAiCredits: 30000,
    storageQuotaMb: 102400,
    bulkPdfEnabled: true,
    prismaAutomationEnabled: true,
    teamSeats: 25,
    priorityProcessing: true,
    isActive: true,
  },
];

export async function ensureSeedPlans() {
  const existing = await db.select().from(subscriptionPlans);
  if (existing.length === 0) {
    await db.insert(subscriptionPlans).values(DEFAULT_PLANS);
  }
  return await db.select().from(subscriptionPlans);
}

export async function getPlanByCode(code: string) {
  const plans = await ensureSeedPlans();
  return plans.find((p) => p.code === code) || plans.find((p) => p.code === 'free')!;
}

export function enrichPlanWithPricingSchedule<
  T extends {
    code: string;
    monthlyPriceUsd: number;
    annualPriceUsd: number;
    monthlyPriceEtb: number;
    annualPriceEtb: number;
  }
>(plan: T, stage: PricingTenureStage = 'startup') {
  const pricingSchedule = computePlanPricingSchedule(plan);
  const activePoint = getStagePointFromSchedule(pricingSchedule, stage);
  return {
    ...plan,
    pricingSchedule,
    effectivePricingStage: stage,
    effectiveMonthlyPriceUsd: activePoint.monthlyUsdCents,
    effectiveAnnualPriceUsd: activePoint.annualUsdCents,
    effectiveMonthlyPriceEtb: activePoint.monthlyEtb,
    effectiveAnnualPriceEtb: activePoint.annualEtb,
  };
}

export async function writeAuditLog(params: {
  actorUid: string;
  actorEmail?: string;
  action: string;
  targetType: string;
  targetId?: string;
  details?: Record<string, unknown>;
}) {
  try {
    await db.insert(auditLogs).values({
      actorUid: params.actorUid,
      actorEmail: params.actorEmail || '',
      action: params.action.slice(0, 120),
      targetType: params.targetType.slice(0, 60),
      targetId: (params.targetId || '').slice(0, 128),
      details: JSON.stringify(params.details || {}).slice(0, 4000),
    });
  } catch (err) {
    console.warn('Audit log write warning:', err);
  }
}

export async function getEffectiveEntitlement(userId: number, fallbackPlanCode = 'free') {
  const subs = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt));

  const latest = subs[0];
  const now = new Date();

  if (!latest) {
    const plan = await getPlanByCode(fallbackPlanCode);
    return {
      plan,
      subscription: {
        planCode: plan.code,
        billingCycle: 'monthly',
        status: 'active',
        provider: 'free',
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      },
      inGracePeriod: false,
    };
  }

  let effectiveStatus = latest.status;
  let effectivePlanCode = latest.planCode;
  let inGracePeriod = false;

  if (latest.currentPeriodEnd && latest.currentPeriodEnd < now) {
    if (latest.graceEndsAt && latest.graceEndsAt > now) {
      effectiveStatus = 'grace_period';
      inGracePeriod = true;
    } else if (latest.status !== 'cancelled') {
      effectiveStatus = 'expired';
      effectivePlanCode = 'free';
    }
  }

  const plan = await getPlanByCode(effectivePlanCode);
  return {
    plan,
    subscription: {
      ...latest,
      status: effectiveStatus,
    },
    inGracePeriod,
  };
}

export async function getAccountOverview(
  uid: string,
  email: string,
  displayName?: string,
  emailVerified?: boolean
) {
  const user = await getOrCreateUser(uid, email, displayName, { emailVerified });
  const entitlement = await getEffectiveEntitlement(user.id, user.planCode);
  const logins = await db
    .select()
    .from(loginHistory)
    .where(eq(loginHistory.userId, user.id))
    .orderBy(desc(loginHistory.createdAt))
    .limit(15);

  const docs = await db
    .select()
    .from(storageDocuments)
    .where(eq(storageDocuments.userId, user.id))
    .orderBy(desc(storageDocuments.createdAt))
    .limit(50);

  const pricingTenure = resolveUserTenureSummary(user.createdAt);
  const enrichedEntitlement = {
    ...entitlement,
    plan: enrichPlanWithPricingSchedule(entitlement.plan, pricingTenure.stage),
  };

  return {
    user: {
      id: user.id,
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      planCode: enrichedEntitlement.plan.code,
      aiCreditsBalance: user.aiCreditsBalance,
      aiCreditsUsed: user.aiCreditsUsed,
      storageUsedBytes: user.storageUsedBytes,
      organization: user.organization || '',
      country: user.country || '',
      emailVerified: user.emailVerified,
      mfaEnabled: user.mfaEnabled,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    },
    entitlement: enrichedEntitlement,
    pricingTenure,
    loginHistory: logins,
    storageDocumentsCount: docs.length,
  };
}

export async function recordLoginEvent(params: {
  uid: string;
  email: string;
  displayName?: string;
  emailVerified?: boolean;
  provider?: string;
  deviceLabel?: string;
  userAgent?: string;
  ipAddress?: string;
}) {
  const user = await getOrCreateUser(params.uid, params.email, params.displayName, {
    emailVerified: params.emailVerified,
    touchLogin: true,
  });

  await db.insert(loginHistory).values({
    userId: user.id,
    email: user.email,
    provider: (params.provider || 'firebase').slice(0, 40),
    deviceLabel: (params.deviceLabel || 'Web Browser').slice(0, 100),
    userAgent: (params.userAgent || '').slice(0, 300),
    ipAddress: (params.ipAddress || '').slice(0, 64),
    status: 'active',
  });
  return user;
}

export async function consumeAiCredits(uid: string, amount = 1) {
  const rows = await db.select().from(users).where(eq(users.uid, uid));
  const user = rows[0];
  if (!user) return { ok: true, remaining: null };
  if (user.status === 'suspended') {
    return { ok: false, reason: 'Account is suspended.' };
  }
  if (user.aiCreditsBalance < amount) {
    return { ok: false, reason: 'Insufficient AI credits for your current plan.' };
  }
  const updated = await db
    .update(users)
    .set({
      aiCreditsBalance: user.aiCreditsBalance - amount,
      aiCreditsUsed: user.aiCreditsUsed + amount,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
    .returning();
  return { ok: true, remaining: updated[0]?.aiCreditsBalance ?? 0 };
}

export async function createPendingTransaction(params: {
  userId: number;
  planCode: string;
  billingCycle: 'monthly' | 'annual';
  amount: number;
  currency: string;
  provider: 'chapa' | 'telebirr' | 'google_play';
  txRef: string;
  metadata?: Record<string, unknown>;
}) {
  const invoiceNumber = `RM-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 899999)}`;
  const inserted = await db
    .insert(paymentTransactions)
    .values({
      userId: params.userId,
      planCode: params.planCode,
      billingCycle: params.billingCycle,
      amount: params.amount,
      currency: params.currency,
      provider: params.provider,
      txRef: params.txRef,
      status: 'pending',
      invoiceNumber,
      metadataJson: JSON.stringify(params.metadata || {}),
    })
    .returning();
  return inserted[0];
}

export async function settleVerifiedPayment(params: {
  txRef: string;
  providerRef?: string;
  provider: string;
}) {
  const rows = await db
    .select()
    .from(paymentTransactions)
    .where(eq(paymentTransactions.txRef, params.txRef));
  const tx = rows[0];
  if (!tx) return null;

  // Idempotent guard: already verified
  if (tx.status === 'verified') {
    return { transaction: tx, alreadyProcessed: true };
  }

  const plan = await getPlanByCode(tx.planCode);
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + (tx.billingCycle === 'annual' ? 365 : 30));
  const graceEnd = new Date(periodEnd);
  graceEnd.setDate(graceEnd.getDate() + 5);

  const [updatedTx] = await db
    .update(paymentTransactions)
    .set({
      status: 'verified',
      providerRef: params.providerRef || tx.providerRef || params.txRef,
      verifiedAt: now,
    })
    .where(eq(paymentTransactions.id, tx.id))
    .returning();

  await db.insert(subscriptions).values({
    userId: tx.userId,
    planCode: plan.code,
    billingCycle: tx.billingCycle,
    status: 'active',
    provider: params.provider,
    providerSubscriptionId: params.providerRef || tx.txRef,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    graceEndsAt: graceEnd,
    cancelAtPeriodEnd: false,
    updatedAt: now,
  });

  await db
    .update(users)
    .set({
      planCode: plan.code,
      aiCreditsBalance: plan.monthlyAiCredits,
      updatedAt: now,
    })
    .where(eq(users.id, tx.userId));

  return { transaction: updatedTx, alreadyProcessed: false, plan };
}

export async function syncCloudProjectRecord(params: {
  userId: number;
  localProjectId: string;
  title: string;
  discipline: string;
  frameworkType: string;
  articleCount: number;
  includedCount: number;
  payloadJson: string;
  clientVersion: number;
  device: string;
}) {
  const existingRows = await db
    .select()
    .from(cloudProjects)
    .where(
      and(
        eq(cloudProjects.userId, params.userId),
        eq(cloudProjects.localProjectId, params.localProjectId)
      )
    );
  const existing = existingRows[0];

  if (!existing) {
    const [created] = await db
      .insert(cloudProjects)
      .values({
        userId: params.userId,
        localProjectId: params.localProjectId,
        title: params.title.slice(0, 240),
        discipline: params.discipline.slice(0, 120),
        frameworkType: params.frameworkType.slice(0, 32),
        articleCount: params.articleCount,
        includedCount: params.includedCount,
        payloadJson: params.payloadJson,
        version: Math.max(1, params.clientVersion),
        lastSyncedDevice: params.device.slice(0, 32),
        updatedAt: new Date(),
      })
      .returning();
    return { project: created, conflict: false };
  }

  // Last-modified / version conflict detection
  const hasConflict = existing.version > params.clientVersion;
  const nextVersion = Math.max(existing.version, params.clientVersion) + 1;

  const [updated] = await db
    .update(cloudProjects)
    .set({
      title: params.title.slice(0, 240),
      discipline: params.discipline.slice(0, 120),
      frameworkType: params.frameworkType.slice(0, 32),
      articleCount: params.articleCount,
      includedCount: params.includedCount,
      payloadJson: params.payloadJson,
      version: nextVersion,
      lastSyncedDevice: params.device.slice(0, 32),
      updatedAt: new Date(),
    })
    .where(eq(cloudProjects.id, existing.id))
    .returning();

  return { project: updated, conflict: hasConflict };
}

export async function listUserCloudProjects(userId: number) {
  return await db
    .select({
      id: cloudProjects.id,
      localProjectId: cloudProjects.localProjectId,
      title: cloudProjects.title,
      discipline: cloudProjects.discipline,
      frameworkType: cloudProjects.frameworkType,
      articleCount: cloudProjects.articleCount,
      includedCount: cloudProjects.includedCount,
      version: cloudProjects.version,
      lastSyncedDevice: cloudProjects.lastSyncedDevice,
      updatedAt: cloudProjects.updatedAt,
      createdAt: cloudProjects.createdAt,
    })
    .from(cloudProjects)
    .where(eq(cloudProjects.userId, userId))
    .orderBy(desc(cloudProjects.updatedAt));
}

export async function exportAllUserData(uid: string) {
  const userRows = await db.select().from(users).where(eq(users.uid, uid));
  const user = userRows[0];
  if (!user) return null;

  const [notes, snapshots, projects, transactions, docs, logins, subs] = await Promise.all([
    db.select().from(researchNotes).where(eq(researchNotes.userId, user.id)),
    db.select().from(researchSnapshots).where(eq(researchSnapshots.userId, user.id)),
    db.select().from(cloudProjects).where(eq(cloudProjects.userId, user.id)),
    db.select().from(paymentTransactions).where(eq(paymentTransactions.userId, user.id)),
    db.select().from(storageDocuments).where(eq(storageDocuments.userId, user.id)),
    db.select().from(loginHistory).where(eq(loginHistory.userId, user.id)),
    db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    profile: user,
    subscriptions: subs,
    transactions,
    cloudProjects: projects,
    researchNotes: notes,
    researchSnapshots: snapshots,
    storageDocuments: docs,
    loginHistory: logins,
  };
}

export async function getAdminAnalyticsOverview() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [allUsers, allTransactions, allProjects, recentAudits] = await Promise.all([
    db.select().from(users),
    db.select().from(paymentTransactions).orderBy(desc(paymentTransactions.createdAt)),
    db.select({
      id: cloudProjects.id,
      articleCount: cloudProjects.articleCount,
      includedCount: cloudProjects.includedCount,
    }).from(cloudProjects),
    db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(25),
  ]);

  const activeUsers = allUsers.filter((u) => u.status === 'active').length;
  const newRegistrations7d = allUsers.filter(
    (u) => u.createdAt && u.createdAt >= sevenDaysAgo
  ).length;
  const totalAiCreditsUsed = allUsers.reduce((acc, u) => acc + (u.aiCreditsUsed || 0), 0);
  const totalStorageBytes = allUsers.reduce((acc, u) => acc + (u.storageUsedBytes || 0), 0);

  const planDistribution: Record<string, number> = {};
  for (const u of allUsers) {
    const code = u.planCode || 'free';
    planDistribution[code] = (planDistribution[code] || 0) + 1;
  }

  const verifiedRevenueByCurrency: Record<string, number> = {};
  let refundedCount = 0;
  for (const t of allTransactions) {
    if (t.status === 'verified') {
      verifiedRevenueByCurrency[t.currency] =
        (verifiedRevenueByCurrency[t.currency] || 0) + t.amount;
    } else if (t.status === 'refunded') {
      refundedCount++;
    }
  }

  return {
    totalUsers: allUsers.length,
    activeUsers,
    suspendedUsers: allUsers.length - activeUsers,
    newRegistrations7d,
    planDistribution,
    verifiedRevenueByCurrency,
    totalTransactions: allTransactions.length,
    refundedCount,
    totalAiCreditsUsed,
    totalStorageBytes,
    activeCloudProjects: allProjects.length,
    totalArticlesSynced: allProjects.reduce((acc, p) => acc + (p.articleCount || 0), 0),
    recentAudits,
  };
}

export async function getActiveAnnouncementsList() {
  return await db
    .select()
    .from(announcements)
    .where(eq(announcements.isActive, true))
    .orderBy(desc(announcements.createdAt))
    .limit(10);
}

export async function getSupportSummaryCounts() {
  const openTickets = await db
    .select({ count: sql<number>`count(*)` })
    .from(supportTickets)
    .where(eq(supportTickets.status, 'open'));
  return Number(openTickets[0]?.count || 0);
}

export { gte };
