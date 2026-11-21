import crypto from 'crypto';
import express, { Request, Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  announcements,
  auditLogs,
  cloudProjects,
  loginHistory,
  paymentTransactions,
  storageDocuments,
  subscriptionPlans,
  subscriptions,
  supportTickets,
  users,
} from '../db/schema.ts';
import { getOrCreateUser } from '../db/users.ts';
import {
  createPendingTransaction,
  enrichPlanWithPricingSchedule,
  ensureSeedPlans,
  exportAllUserData,
  getAccountOverview,
  getActiveAnnouncementsList,
  getAdminAnalyticsOverview,
  getEffectiveEntitlement,
  getPlanByCode,
  listUserCloudProjects,
  recordLoginEvent,
  settleVerifiedPayment,
  syncCloudProjectRecord,
  writeAuditLog,
} from '../db/commercial.ts';
import { AuthRequest, optionalAuth, requireAdmin, requireAuth } from '../middleware/auth.ts';
import { getStagePriceAmount, resolveUserTenureSummary } from '../utils/pricingSchedule.ts';

export const commercialRouter = express.Router();

// Simple in-memory idempotency cache for offline sync operations (prevents duplicate replay)
const processedSyncOps = new Map<string, number>();

// -------------------------------------------------------------
// Public Commercial Endpoints
// -------------------------------------------------------------
commercialRouter.get('/plans', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const plans = await ensureSeedPlans();
    let tenureSummary = resolveUserTenureSummary(null);
    if (req.user?.uid) {
      const existingUsers = await db.select().from(users).where(eq(users.uid, req.user.uid));
      if (existingUsers[0]) {
        tenureSummary = resolveUserTenureSummary(existingUsers[0].createdAt);
      }
    }

    return res.json({
      plans: plans
        .filter((p) => p.isActive)
        .map((p) => enrichPlanWithPricingSchedule(p, tenureSummary.stage)),
      pricingTenure: tenureSummary,
      paymentGateways: {
        chapaConfigured: Boolean(process.env.CHAPA_SECRET_KEY),
        telebirrConfigured: Boolean(
          process.env.TELEBIRR_APP_ID &&
            process.env.TELEBIRR_APP_KEY &&
            process.env.TELEBIRR_MERCHANT_CODE
        ),
        googlePlayConfigured: Boolean(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON),
      },
    });
  } catch (error: any) {
    console.error('Failed to load subscription plans:', error);
    return res.status(500).json({ error: 'Unable to load subscription plans.' });
  }
});

commercialRouter.get('/announcements', async (_req: Request, res: Response) => {
  try {
    const list = await getActiveAnnouncementsList();
    return res.json({ announcements: list });
  } catch (error: any) {
    console.error('Failed to load announcements:', error);
    return res.status(500).json({ error: 'Unable to load announcements.' });
  }
});

commercialRouter.post('/support/contact', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, subject, category, message } = req.body || {};
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'Name, email, subject, and message are required.' });
    }
    let userId: number | null = null;
    if (req.user?.uid) {
      const u = await getOrCreateUser(req.user.uid, req.user.email || email, req.user.name, {
        emailVerified: Boolean(req.user.email_verified),
      });
      userId = u.id;
    }

    const [ticket] = await db
      .insert(supportTickets)
      .values({
        userId,
        name: String(name).slice(0, 120),
        email: String(email).slice(0, 200),
        subject: String(subject).slice(0, 200),
        category: String(category || 'General').slice(0, 60),
        message: String(message).slice(0, 4000),
        status: 'open',
      })
      .returning();

    return res.status(201).json({ ticketId: ticket.id, status: ticket.status });
  } catch (error: any) {
    console.error('Failed to submit support inquiry:', error);
    return res.status(500).json({ error: 'Could not submit support message.' });
  }
});

// -------------------------------------------------------------
// Authenticated Account, Security & Data Ownership APIs
// -------------------------------------------------------------
commercialRouter.get('/account/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const overview = await getAccountOverview(
      uid,
      req.user?.email || '',
      req.user?.name,
      Boolean(req.user?.email_verified)
    );
    return res.json(overview);
  } catch (error: any) {
    console.error('Failed to load account overview:', error);
    return res.status(500).json({ error: 'Failed to load account overview.' });
  }
});

commercialRouter.put('/account/profile', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const user = await getOrCreateUser(uid, req.user?.email || '', req.user?.name, {
      emailVerified: Boolean(req.user?.email_verified),
    });

    const { displayName, organization, country, mfaEnabled } = req.body || {};
    const updateSet: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof displayName === 'string' && displayName.trim()) {
      updateSet.displayName = displayName.trim().slice(0, 120);
    }
    if (typeof organization === 'string') {
      updateSet.organization = organization.trim().slice(0, 160);
    }
    if (typeof country === 'string') {
      updateSet.country = country.trim().slice(0, 80);
    }
    if (typeof mfaEnabled === 'boolean') {
      updateSet.mfaEnabled = mfaEnabled;
    }

    const [updated] = await db
      .update(users)
      .set(updateSet)
      .where(eq(users.id, user.id))
      .returning();

    await writeAuditLog({
      actorUid: uid,
      actorEmail: user.email,
      action: 'profile.updated',
      targetType: 'user',
      targetId: uid,
    });

    return res.json({ user: updated });
  } catch (error: any) {
    console.error('Profile update failed:', error);
    return res.status(500).json({ error: 'Failed to update profile.' });
  }
});

commercialRouter.post('/account/session-ping', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { deviceLabel, provider } = req.body || {};
    await recordLoginEvent({
      uid,
      email: req.user?.email || '',
      displayName: req.user?.name,
      emailVerified: Boolean(req.user?.email_verified),
      provider: provider || req.user?.firebase?.sign_in_provider || 'firebase',
      deviceLabel: deviceLabel || 'Web Browser',
      userAgent: req.headers['user-agent'] || '',
      ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '',
    });
    return res.json({ recorded: true });
  } catch (error: any) {
    console.error('Session ping warning:', error);
    return res.status(500).json({ error: 'Failed to record login session.' });
  }
});

commercialRouter.post(
  '/account/sessions/:id/revoke',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const sessionId = Number(req.params.id);
      if (!Number.isFinite(sessionId)) {
        return res.status(400).json({ error: 'Invalid session ID.' });
      }
      const user = await getOrCreateUser(req.user!.uid, req.user?.email || '');
      await db
        .update(loginHistory)
        .set({ status: 'revoked' })
        .where(and(eq(loginHistory.id, sessionId), eq(loginHistory.userId, user.id)));

      await writeAuditLog({
        actorUid: req.user!.uid,
        actorEmail: user.email,
        action: 'session.revoked',
        targetType: 'login_history',
        targetId: String(sessionId),
      });

      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to revoke session.' });
    }
  }
);

commercialRouter.get('/account/export', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const payload = await exportAllUserData(req.user!.uid);
    if (!payload) {
      return res.status(404).json({ error: 'User profile not found.' });
    }
    await writeAuditLog({
      actorUid: req.user!.uid,
      actorEmail: req.user?.email || '',
      action: 'account.data_exported',
      targetType: 'user',
      targetId: req.user!.uid,
    });
    return res.json(payload);
  } catch (error: any) {
    console.error('Data export failed:', error);
    return res.status(500).json({ error: 'Failed to export user data.' });
  }
});

commercialRouter.delete('/account/delete', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const email = req.user?.email || '';
    await db.delete(users).where(eq(users.uid, uid));
    await writeAuditLog({
      actorUid: uid,
      actorEmail: email,
      action: 'account.deleted',
      targetType: 'user',
      targetId: uid,
    });
    return res.json({ deleted: true });
  } catch (error: any) {
    console.error('Account deletion failed:', error);
    return res.status(500).json({ error: 'Failed to delete user data.' });
  }
});

// -------------------------------------------------------------
// Subscription & Payment Verification APIs (Chapa / Telebirr / Google Play)
// -------------------------------------------------------------
commercialRouter.get('/billing/transactions', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await getOrCreateUser(req.user!.uid, req.user?.email || '');
    const txs = await db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.userId, user.id))
      .orderBy(desc(paymentTransactions.createdAt))
      .limit(50);
    return res.json({ transactions: txs });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to load payment transactions.' });
  }
});

commercialRouter.post('/billing/chapa/init', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const chapaKey = process.env.CHAPA_SECRET_KEY;
    if (!chapaKey) {
      return res.status(503).json({
        error:
          'Chapa merchant secret (CHAPA_SECRET_KEY) is not configured on the server. Set CHAPA_SECRET_KEY and CHAPA_WEBHOOK_SECRET in server environment secrets before launching live checkout.',
        requiresExternalConfiguration: true,
      });
    }

    const { planCode, billingCycle = 'monthly', currency = 'ETB' } = req.body || {};
    const plan = await getPlanByCode(String(planCode || ''));
    if (!plan || plan.code === 'free') {
      return res.status(400).json({ error: 'Select a valid paid subscription tier.' });
    }

    const user = await getOrCreateUser(req.user!.uid, req.user?.email || '', req.user?.name);
    const cycle = billingCycle === 'annual' ? 'annual' : 'monthly';
    const curr = currency === 'USD' ? 'USD' : 'ETB';
    const tenureSummary = resolveUserTenureSummary(user.createdAt);
    const stagePrice = getStagePriceAmount(plan, tenureSummary.stage, cycle, curr);
    const chapaAmountStr =
      curr === 'USD'
        ? stagePrice.majorUnitNumber.toFixed(2)
        : String(Math.round(stagePrice.majorUnitNumber));
    const integerStoredAmount =
      curr === 'USD'
        ? Math.max(1, Math.round(stagePrice.majorUnitNumber))
        : Math.round(stagePrice.majorUnitNumber);

    const txRef = `RM-CHAPA-${user.id}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const appOrigin =
      process.env.APP_URL ||
      `${req.protocol}://${req.get('host')}`;

    await createPendingTransaction({
      userId: user.id,
      planCode: plan.code,
      billingCycle: cycle,
      amount: integerStoredAmount,
      currency: curr,
      provider: 'chapa',
      txRef,
      metadata: {
        planName: plan.name,
        tenureStage: tenureSummary.stage,
        tenureLabel: tenureSummary.label,
        exactAmount: stagePrice.majorUnitNumber,
        formattedAmount: stagePrice.formatted,
      },
    });

    const chapaRes = await fetch('https://api.chapa.co/v1/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${chapaKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: chapaAmountStr,
        currency: curr,
        email: user.email,
        first_name: (user.displayName || 'Researcher').split(' ')[0],
        last_name: (user.displayName || 'User').split(' ').slice(1).join(' ') || 'Researcher',
        tx_ref: txRef,
        callback_url: `${appOrigin}/api/billing/chapa/webhook`,
        return_url: `${appOrigin}/#billing?tx_ref=${encodeURIComponent(txRef)}`,
        customization: {
          title: 'ResearchMate AI',
          description: `${plan.name} (${cycle} · ${tenureSummary.shortLabel}) subscription`,
        },
      }),
    });

    const chapaJson = await chapaRes.json();
    if (!chapaRes.ok || chapaJson?.status !== 'success' || !chapaJson?.data?.checkout_url) {
      return res.status(502).json({
        error: chapaJson?.message || 'Chapa gateway rejected transaction initialization.',
      });
    }

    return res.json({
      checkoutUrl: chapaJson.data.checkout_url,
      txRef,
    });
  } catch (error: any) {
    console.error('Chapa init failed:', error);
    return res.status(500).json({ error: 'Chapa checkout initialization failed.' });
  }
});

commercialRouter.get('/billing/chapa/verify/:txRef', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const chapaKey = process.env.CHAPA_SECRET_KEY;
    if (!chapaKey) {
      return res.status(503).json({
        error: 'CHAPA_SECRET_KEY is not configured on the server.',
        requiresExternalConfiguration: true,
      });
    }

    const txRef = req.params.txRef;
    const verifyRes = await fetch(
      `https://api.chapa.co/v1/transaction/verify/${encodeURIComponent(txRef)}`,
      {
        headers: { Authorization: `Bearer ${chapaKey}` },
      }
    );
    const verifyJson = await verifyRes.json();

    if (!verifyRes.ok || verifyJson?.status !== 'success' || verifyJson?.data?.status !== 'success') {
      return res.status(402).json({
        verified: false,
        error: verifyJson?.message || 'Payment not verified by Chapa.',
      });
    }

    const settled = await settleVerifiedPayment({
      txRef,
      providerRef: verifyJson?.data?.reference || txRef,
      provider: 'chapa',
    });

    if (!settled) {
      return res.status(404).json({ error: 'Transaction reference not found.' });
    }

    await writeAuditLog({
      actorUid: req.user!.uid,
      actorEmail: req.user?.email || '',
      action: 'billing.chapa_verified',
      targetType: 'payment',
      targetId: txRef,
    });

    return res.json({ verified: true, ...settled });
  } catch (error: any) {
    console.error('Chapa verification error:', error);
    return res.status(500).json({ error: 'Payment verification error.' });
  }
});

commercialRouter.post('/billing/chapa/webhook', async (req: Request, res: Response) => {
  try {
    const secret = process.env.CHAPA_WEBHOOK_SECRET;
    if (!secret) {
      return res.status(503).json({ error: 'Webhook secret not configured.' });
    }

    const signature =
      (req.headers['chapa-signature'] as string) ||
      (req.headers['x-chapa-signature'] as string) ||
      '';
    const expected = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(req.body || {}))
      .digest('hex');

    if (!signature || signature !== expected) {
      return res.status(401).json({ error: 'Invalid webhook signature.' });
    }

    const txRef = req.body?.tx_ref;
    const status = req.body?.status;
    if (txRef && status === 'success') {
      await settleVerifiedPayment({
        txRef: String(txRef),
        providerRef: String(req.body?.reference || txRef),
        provider: 'chapa',
      });
    }
    return res.json({ received: true });
  } catch (error: any) {
    console.error('Chapa webhook error:', error);
    return res.status(500).json({ error: 'Webhook processing error.' });
  }
});

commercialRouter.post('/billing/telebirr/init', requireAuth, async (req: AuthRequest, res: Response) => {
  const { TELEBIRR_APP_ID, TELEBIRR_APP_KEY, TELEBIRR_MERCHANT_CODE } = process.env;
  if (!TELEBIRR_APP_ID || !TELEBIRR_APP_KEY || !TELEBIRR_MERCHANT_CODE) {
    return res.status(503).json({
      error:
        'Telebirr merchant credentials (TELEBIRR_APP_ID, TELEBIRR_APP_KEY, TELEBIRR_MERCHANT_CODE, TELEBIRR_PRIVATE_KEY) are not configured on the server.',
      requiresExternalConfiguration: true,
    });
  }

  return res.status(501).json({
    error:
      'Telebirr H5/Fabric pre-order endpoint requires your live Ethio Telecom merchant private key signing certificate and callback allowlist.',
    requiresExternalConfiguration: true,
  });
});

commercialRouter.post('/billing/play/verify', requireAuth, async (req: AuthRequest, res: Response) => {
  const saJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!saJson) {
    return res.status(503).json({
      error:
        'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not configured. Add a Play Console service account with androidpublisher scope to verify Android Play Billing purchase tokens.',
      requiresExternalConfiguration: true,
    });
  }

  const { purchaseToken, productId, packageName } = req.body || {};
  if (!purchaseToken || !productId || !packageName) {
    return res.status(400).json({ error: 'purchaseToken, productId, and packageName are required.' });
  }

  return res.status(501).json({
    error:
      'Connect Google Play Developer API subscriptionsv2.get verification with your Play Console package before granting Android entitlements.',
    requiresExternalConfiguration: true,
  });
});

commercialRouter.post('/billing/cancel', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await getOrCreateUser(req.user!.uid, req.user?.email || '');
    const latestSubs = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, user.id))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    if (latestSubs[0]) {
      await db
        .update(subscriptions)
        .set({ cancelAtPeriodEnd: true, status: 'cancelled', updatedAt: new Date() })
        .where(eq(subscriptions.id, latestSubs[0].id));
    }

    await writeAuditLog({
      actorUid: req.user!.uid,
      actorEmail: user.email,
      action: 'subscription.cancelled',
      targetType: 'user',
      targetId: req.user!.uid,
    });

    const entitlement = await getEffectiveEntitlement(user.id, user.planCode);
    return res.json({ cancelled: true, entitlement });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to cancel subscription.' });
  }
});

// -------------------------------------------------------------
// Cloud Project Sync & Offline Conflict Resolution APIs
// -------------------------------------------------------------
commercialRouter.get('/cloud/projects', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await getOrCreateUser(req.user!.uid, req.user?.email || '');
    const projects = await listUserCloudProjects(user.id);
    return res.json({ projects });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to list cloud projects.' });
  }
});

commercialRouter.get(
  '/cloud/projects/:localProjectId',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const user = await getOrCreateUser(req.user!.uid, req.user?.email || '');
      const rows = await db
        .select()
        .from(cloudProjects)
        .where(
          and(
            eq(cloudProjects.userId, user.id),
            eq(cloudProjects.localProjectId, req.params.localProjectId)
          )
        );
      if (!rows[0]) {
        return res.status(404).json({ error: 'Cloud project not found.' });
      }
      return res.json({
        ...rows[0],
        payload: JSON.parse(rows[0].payloadJson),
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to load cloud project.' });
    }
  }
);

commercialRouter.post('/cloud/sync', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await getOrCreateUser(req.user!.uid, req.user?.email || '');
    const { opId, project, clientVersion = 1, device = 'web' } = req.body || {};

    if (!project || !project.id || !project.title) {
      return res.status(400).json({ error: 'Valid project payload with id and title is required.' });
    }

    // Duplicate-operation protection (idempotent operation IDs)
    if (opId && processedSyncOps.has(`${user.uid}:${opId}`)) {
      return res.json({ deduplicated: true, syncedAt: new Date().toISOString() });
    }

    const plan = await getPlanByCode(user.planCode);
    const existingList = await listUserCloudProjects(user.id);
    const alreadyExists = existingList.some((p) => p.localProjectId === project.id);
    if (!alreadyExists && existingList.length >= plan.maxProjects) {
      return res.status(403).json({
        error: `Your ${plan.name} plan allows up to ${plan.maxProjects} cloud-synced projects. Upgrade your plan to sync more projects.`,
      });
    }

    const articles = Array.isArray(project.articles) ? project.articles : [];
    const includedCount = articles.filter((a: any) => a?.decision === 'include').length;
    const synced = await syncCloudProjectRecord({
      userId: user.id,
      localProjectId: String(project.id),
      title: String(project.title),
      discipline: String(project.discipline || 'Interdisciplinary'),
      frameworkType: String(project.frameworkType || 'PICOC'),
      articleCount: articles.length,
      includedCount,
      payloadJson: JSON.stringify(project),
      clientVersion: Number(clientVersion) || 1,
      device: String(device || 'web'),
    });

    if (opId) {
      processedSyncOps.set(`${user.uid}:${opId}`, Date.now());
      if (processedSyncOps.size > 5000) {
        const firstKey = processedSyncOps.keys().next().value;
        if (firstKey) processedSyncOps.delete(firstKey);
      }
    }

    return res.json({
      synced: true,
      conflictDetected: synced.conflict,
      version: synced.project.version,
      updatedAt: synced.project.updatedAt,
    });
  } catch (error: any) {
    console.error('Cloud sync failed:', error);
    return res.status(500).json({ error: 'Cloud synchronization failed.' });
  }
});

// -------------------------------------------------------------
// Cloud Document & PDF Storage Metadata APIs (Quota Enforced)
// -------------------------------------------------------------
commercialRouter.get('/storage/documents', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await getOrCreateUser(req.user!.uid, req.user?.email || '');
    const docs = await db
      .select()
      .from(storageDocuments)
      .where(eq(storageDocuments.userId, user.id))
      .orderBy(desc(storageDocuments.createdAt));
    return res.json({ documents: docs, storageUsedBytes: user.storageUsedBytes });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to load storage documents.' });
  }
});

commercialRouter.post('/storage/documents', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await getOrCreateUser(req.user!.uid, req.user?.email || '');
    const plan = await getPlanByCode(user.planCode);
    const { projectId, articleId = '', fileName, mimeType = 'application/pdf', sizeBytes = 0, storagePath, downloadUrl = '', category = 'pdf' } =
      req.body || {};

    if (!projectId || !fileName || !storagePath) {
      return res.status(400).json({ error: 'projectId, fileName, and storagePath are required.' });
    }

    const quotaBytes = plan.storageQuotaMb * 1024 * 1024;
    const incomingSize = Math.max(0, Number(sizeBytes) || 0);
    if (user.storageUsedBytes + incomingSize > quotaBytes) {
      return res.status(403).json({
        error: `Storage quota exceeded (${plan.storageQuotaMb} MB limit on ${plan.name}). Upgrade your plan for additional PDF storage.`,
      });
    }

    const [docRow] = await db
      .insert(storageDocuments)
      .values({
        userId: user.id,
        projectId: String(projectId).slice(0, 128),
        articleId: String(articleId).slice(0, 128),
        fileName: String(fileName).slice(0, 240),
        mimeType: String(mimeType).slice(0, 100),
        sizeBytes: incomingSize,
        storagePath: String(storagePath).slice(0, 500),
        downloadUrl: String(downloadUrl).slice(0, 1000),
        category: String(category).slice(0, 40),
      })
      .returning();

    await db
      .update(users)
      .set({
        storageUsedBytes: user.storageUsedBytes + incomingSize,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return res.status(201).json({ document: docRow });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to register storage document.' });
  }
});

commercialRouter.delete(
  '/storage/documents/:id',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const docId = Number(req.params.id);
      if (!Number.isFinite(docId)) return res.status(400).json({ error: 'Invalid document ID.' });
      const user = await getOrCreateUser(req.user!.uid, req.user?.email || '');
      const existing = await db
        .select()
        .from(storageDocuments)
        .where(and(eq(storageDocuments.id, docId), eq(storageDocuments.userId, user.id)));

      if (existing[0]) {
        await db.delete(storageDocuments).where(eq(storageDocuments.id, docId));
        await db
          .update(users)
          .set({
            storageUsedBytes: Math.max(0, user.storageUsedBytes - existing[0].sizeBytes),
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id));
      }
      return res.json({ deleted: true });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to delete document record.' });
    }
  }
);

// -------------------------------------------------------------
// Protected Administrator Dashboard APIs
// -------------------------------------------------------------
commercialRouter.get(
  '/admin/overview',
  requireAuth,
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      await ensureSeedPlans();
      const overview = await getAdminAnalyticsOverview();
      return res.json(overview);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to load admin overview.' });
    }
  }
);

commercialRouter.get(
  '/admin/users',
  requireAuth,
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const allUsers = await db
        .select({
          id: users.id,
          uid: users.uid,
          email: users.email,
          displayName: users.displayName,
          role: users.role,
          status: users.status,
          planCode: users.planCode,
          aiCreditsBalance: users.aiCreditsBalance,
          aiCreditsUsed: users.aiCreditsUsed,
          storageUsedBytes: users.storageUsedBytes,
          emailVerified: users.emailVerified,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt));
      return res.json({ users: allUsers });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to load users.' });
    }
  }
);

commercialRouter.patch(
  '/admin/users/:uid',
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const targetUid = req.params.uid;
      const { role, status, planCode, aiCreditsBalance } = req.body || {};
      const updateSet: Record<string, unknown> = { updatedAt: new Date() };

      if (role && ['admin', 'researcher', 'institutional'].includes(role)) {
        updateSet.role = role;
      }
      if (status && ['active', 'suspended'].includes(status)) {
        updateSet.status = status;
      }
      if (typeof planCode === 'string' && planCode.trim()) {
        const plan = await getPlanByCode(planCode.trim());
        updateSet.planCode = plan.code;
      }
      if (typeof aiCreditsBalance === 'number' && Number.isFinite(aiCreditsBalance)) {
        updateSet.aiCreditsBalance = Math.max(0, Math.floor(aiCreditsBalance));
      }

      const [updated] = await db
        .update(users)
        .set(updateSet)
        .where(eq(users.uid, targetUid))
        .returning();

      if (!updated) return res.status(404).json({ error: 'User not found.' });

      await writeAuditLog({
        actorUid: req.user!.uid,
        actorEmail: req.user?.email || '',
        action: 'admin.user_updated',
        targetType: 'user',
        targetId: targetUid,
        details: updateSet,
      });

      return res.json({ user: updated });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to update user.' });
    }
  }
);

commercialRouter.get(
  '/admin/plans',
  requireAuth,
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const plans = await ensureSeedPlans();
      return res.json({ plans });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to fetch plans.' });
    }
  }
);

commercialRouter.put(
  '/admin/plans/:code',
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      await ensureSeedPlans();
      const code = req.params.code;
      const {
        name,
        tagline,
        monthlyPriceUsd,
        annualPriceUsd,
        monthlyPriceEtb,
        annualPriceEtb,
        maxProjects,
        maxArticlesPerProject,
        monthlyAiCredits,
        storageQuotaMb,
        bulkPdfEnabled,
        prismaAutomationEnabled,
        teamSeats,
        priorityProcessing,
        isActive,
      } = req.body || {};

      const updateSet: Record<string, unknown> = { updatedAt: new Date() };
      if (typeof name === 'string') updateSet.name = name.slice(0, 80);
      if (typeof tagline === 'string') updateSet.tagline = tagline.slice(0, 240);
      if (typeof monthlyPriceUsd === 'number') updateSet.monthlyPriceUsd = Math.max(0, Math.floor(monthlyPriceUsd));
      if (typeof annualPriceUsd === 'number') updateSet.annualPriceUsd = Math.max(0, Math.floor(annualPriceUsd));
      if (typeof monthlyPriceEtb === 'number') updateSet.monthlyPriceEtb = Math.max(0, Math.floor(monthlyPriceEtb));
      if (typeof annualPriceEtb === 'number') updateSet.annualPriceEtb = Math.max(0, Math.floor(annualPriceEtb));
      if (typeof maxProjects === 'number') updateSet.maxProjects = Math.max(1, Math.floor(maxProjects));
      if (typeof maxArticlesPerProject === 'number') updateSet.maxArticlesPerProject = Math.max(10, Math.floor(maxArticlesPerProject));
      if (typeof monthlyAiCredits === 'number') updateSet.monthlyAiCredits = Math.max(0, Math.floor(monthlyAiCredits));
      if (typeof storageQuotaMb === 'number') updateSet.storageQuotaMb = Math.max(10, Math.floor(storageQuotaMb));
      if (typeof bulkPdfEnabled === 'boolean') updateSet.bulkPdfEnabled = bulkPdfEnabled;
      if (typeof prismaAutomationEnabled === 'boolean') updateSet.prismaAutomationEnabled = prismaAutomationEnabled;
      if (typeof teamSeats === 'number') updateSet.teamSeats = Math.max(1, Math.floor(teamSeats));
      if (typeof priorityProcessing === 'boolean') updateSet.priorityProcessing = priorityProcessing;
      if (typeof isActive === 'boolean') updateSet.isActive = isActive;

      const [updated] = await db
        .update(subscriptionPlans)
        .set(updateSet)
        .where(eq(subscriptionPlans.code, code))
        .returning();

      if (!updated) return res.status(404).json({ error: 'Plan not found.' });

      await writeAuditLog({
        actorUid: req.user!.uid,
        actorEmail: req.user?.email || '',
        action: 'admin.plan_updated',
        targetType: 'plan',
        targetId: code,
        details: updateSet,
      });

      return res.json({ plan: updated });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to update plan configuration.' });
    }
  }
);

commercialRouter.get(
  '/admin/payments',
  requireAuth,
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const payments = await db
        .select({
          id: paymentTransactions.id,
          userId: paymentTransactions.userId,
          userEmail: users.email,
          planCode: paymentTransactions.planCode,
          billingCycle: paymentTransactions.billingCycle,
          amount: paymentTransactions.amount,
          currency: paymentTransactions.currency,
          provider: paymentTransactions.provider,
          txRef: paymentTransactions.txRef,
          providerRef: paymentTransactions.providerRef,
          status: paymentTransactions.status,
          invoiceNumber: paymentTransactions.invoiceNumber,
          verifiedAt: paymentTransactions.verifiedAt,
          refundedAt: paymentTransactions.refundedAt,
          createdAt: paymentTransactions.createdAt,
        })
        .from(paymentTransactions)
        .leftJoin(users, eq(paymentTransactions.userId, users.id))
        .orderBy(desc(paymentTransactions.createdAt))
        .limit(100);
      return res.json({ payments });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to load payments.' });
    }
  }
);

commercialRouter.post(
  '/admin/payments/:txRef/refund',
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const txRef = req.params.txRef;
      const rows = await db
        .select()
        .from(paymentTransactions)
        .where(eq(paymentTransactions.txRef, txRef));
      const tx = rows[0];
      if (!tx) return res.status(404).json({ error: 'Transaction not found.' });
      if (tx.status !== 'verified') {
        return res.status(400).json({ error: 'Only verified payments can be marked refunded.' });
      }

      const [updated] = await db
        .update(paymentTransactions)
        .set({ status: 'refunded', refundedAt: new Date() })
        .where(eq(paymentTransactions.id, tx.id))
        .returning();

      await db
        .update(users)
        .set({ planCode: 'free', updatedAt: new Date() })
        .where(eq(users.id, tx.userId));

      await writeAuditLog({
        actorUid: req.user!.uid,
        actorEmail: req.user?.email || '',
        action: 'admin.payment_refunded',
        targetType: 'payment',
        targetId: txRef,
      });

      return res.json({ payment: updated });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to record refund.' });
    }
  }
);

commercialRouter.get(
  '/admin/announcements',
  requireAuth,
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const list = await db
        .select()
        .from(announcements)
        .orderBy(desc(announcements.createdAt))
        .limit(30);
      return res.json({ announcements: list });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to load announcements.' });
    }
  }
);

commercialRouter.post(
  '/admin/announcements',
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const { title, message, severity = 'info' } = req.body || {};
      if (!title || !message) {
        return res.status(400).json({ error: 'Title and message are required.' });
      }
      const [created] = await db
        .insert(announcements)
        .values({
          title: String(title).slice(0, 160),
          message: String(message).slice(0, 1000),
          severity: ['info', 'warning', 'release'].includes(severity) ? severity : 'info',
          isActive: true,
          createdByUid: req.user!.uid,
        })
        .returning();

      await writeAuditLog({
        actorUid: req.user!.uid,
        actorEmail: req.user?.email || '',
        action: 'admin.announcement_created',
        targetType: 'announcement',
        targetId: String(created.id),
      });

      return res.status(201).json({ announcement: created });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to create announcement.' });
    }
  }
);

commercialRouter.delete(
  '/admin/announcements/:id',
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid announcement ID.' });
      await db.delete(announcements).where(eq(announcements.id, id));
      return res.json({ deleted: true });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to delete announcement.' });
    }
  }
);

commercialRouter.get(
  '/admin/audit-logs',
  requireAuth,
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const logs = await db
        .select()
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(100);
      return res.json({ logs });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to fetch audit logs.' });
    }
  }
);

commercialRouter.get(
  '/admin/support-tickets',
  requireAuth,
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const tickets = await db
        .select()
        .from(supportTickets)
        .orderBy(desc(supportTickets.createdAt))
        .limit(50);
      return res.json({ tickets });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to load support tickets.' });
    }
  }
);

commercialRouter.patch(
  '/admin/support-tickets/:id',
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid ticket ID.' });
      const status = req.body?.status === 'resolved' ? 'resolved' : 'open';
      const [updated] = await db
        .update(supportTickets)
        .set({ status })
        .where(eq(supportTickets.id, id))
        .returning();
      return res.json({ ticket: updated });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to update support ticket.' });
    }
  }
);

commercialRouter.get(
  '/admin/health',
  requireAuth,
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    const mem = process.memoryUsage();
    return res.json({
      status: 'healthy',
      uptimeSeconds: Math.round(process.uptime()),
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      aiConfigured: Boolean(process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.startsWith('MY_')),
      chapaConfigured: Boolean(process.env.CHAPA_SECRET_KEY),
      telebirrConfigured: Boolean(process.env.TELEBIRR_APP_ID),
      googlePlayConfigured: Boolean(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON),
      timestamp: new Date().toISOString(),
    });
  }
);
