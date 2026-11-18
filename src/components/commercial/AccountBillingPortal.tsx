import React, { useEffect, useState } from 'react';
import { deleteUser } from 'firebase/auth';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  CreditCard,
  Download,
  FileText,
  KeyRound,
  LogOut,
  RefreshCw,
  Shield,
  Trash2,
  Upload,
} from 'lucide-react';
import { AccountPlan, useAuth } from '../../contexts/AuthContext';
import { storage } from '../../lib/firebase';
import { ReviewProject } from '../../types';
import { OfflineSyncOperation, SyncStatus } from '../../utils/syncEngine';

interface AccountBillingPortalProps {
  projects: ReviewProject[];
  currentProject: ReviewProject | null;
  syncStatus: SyncStatus;
  pendingOps: OfflineSyncOperation[];
  onManualSyncAll: () => Promise<void>;
  onBackToWorkbench: () => void;
}

export const AccountBillingPortal: React.FC<AccountBillingPortalProps> = ({
  projects,
  currentProject,
  syncStatus,
  pendingOps,
  onManualSyncAll,
  onBackToWorkbench,
}) => {
  const {
    user,
    idToken,
    accountOverview,
    signInWithGoogle,
    logout,
    resendVerificationEmail,
    refreshAccountOverview,
  } = useAuth();

  const [activeSubTab, setActiveSubTab] = useState<'subscription' | 'security' | 'sync'>('subscription');
  const [plans, setPlans] = useState<AccountPlan[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [cloudProjects, setCloudProjects] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [currency, setCurrency] = useState<'ETB' | 'USD'>('ETB');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [busyAction, setBusyAction] = useState(false);

  // Profile form state
  const [displayName, setDisplayName] = useState('');
  const [organization, setOrganization] = useState('');
  const [country, setCountry] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (accountOverview?.user) {
      setDisplayName(accountOverview.user.displayName || '');
      setOrganization(accountOverview.user.organization || '');
      setCountry(accountOverview.user.country || '');
    }
  }, [accountOverview]);

  const loadBillingAndCloud = async (token: string) => {
    try {
      const [plansRes, txRes, cloudRes, docsRes] = await Promise.all([
        fetch('/api/plans'),
        fetch('/api/billing/transactions', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/cloud/projects', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/storage/documents', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (plansRes.ok) {
        const p = await plansRes.json();
        setPlans(p.plans || []);
      }
      if (txRes.ok) {
        const t = await txRes.json();
        setTransactions(t.transactions || []);
      }
      if (cloudRes.ok) {
        const c = await cloudRes.json();
        setCloudProjects(c.projects || []);
      }
      if (docsRes.ok) {
        const d = await docsRes.json();
        setDocuments(d.documents || []);
      }
    } catch {}
  };

  useEffect(() => {
    if (idToken) {
      void loadBillingAndCloud(idToken);
    }
  }, [idToken]);

  const handleCheckout = async (planCode: string, gateway: 'chapa' | 'telebirr') => {
    if (!idToken) return;
    setErrorMessage('');
    setStatusMessage('');
    setBusyAction(true);
    try {
      const endpoint = gateway === 'chapa' ? '/api/billing/chapa/init' : '/api/billing/telebirr/init';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ planCode, billingCycle, currency }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Checkout initialization failed.');
      }
      if (data.checkoutUrl) {
        setStatusMessage(
          `Chapa checkout session created (Reference: ${data.txRef}). Redirecting cleanly or open link below.`
        );
        window.location.href = data.checkoutUrl;
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to start payment checkout.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!idToken) return;
    setBusyAction(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/billing/cancel', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to cancel subscription.');
      setStatusMessage('Subscription renewal cancelled. Access continues until end of billing period.');
      await refreshAccountOverview();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Cancel failed.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idToken) return;
    setBusyAction(true);
    setErrorMessage('');
    setStatusMessage('');
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ displayName, organization, country }),
      });
      if (!res.ok) throw new Error('Profile update failed.');
      await refreshAccountOverview();
      setStatusMessage('Researcher profile saved.');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not update profile.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleExportAccountData = async () => {
    if (!idToken) return;
    setErrorMessage('');
    try {
      const res = await fetch('/api/account/export', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Export failed.');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `researchmate-account-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusMessage('Account data exported cleanly.');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Export failed.');
    }
  };

  const handleDeleteAccount = async () => {
    if (!idToken || !user) return;
    setBusyAction(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/account/delete', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) throw new Error('Backend account purge failed.');
      try {
        await deleteUser(user);
      } catch {
        await logout();
      }
      setStatusMessage('Account deleted.');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Account deletion failed. Re-authenticate and try again.');
    } finally {
      setBusyAction(false);
      setConfirmDelete(false);
    }
  };

  const handleUploadDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !idToken || !currentProject) return;
    setBusyAction(true);
    setErrorMessage('');
    setStatusMessage('');
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `users/${user.uid}/projects/${currentProject.id}/${Date.now()}_${safeName}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);

      const metaRes = await fetch('/api/storage/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          projectId: currentProject.id,
          fileName: file.name,
          mimeType: file.type || 'application/pdf',
          sizeBytes: file.size,
          storagePath,
          downloadUrl,
          category: file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'supplement',
        }),
      });
      const metaJson = await metaRes.json();
      if (!metaRes.ok) throw new Error(metaJson?.error || 'Could not register document.');
      await loadBillingAndCloud(idToken);
      await refreshAccountOverview();
      setStatusMessage(`Uploaded "${file.name}" to Firebase Storage.`);
    } catch (err: any) {
      setErrorMessage(
        err?.message ||
          'Storage upload failed. Verify Firebase Storage is enabled in Firebase Console for this project.'
      );
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteDocument = async (docId: number) => {
    if (!idToken) return;
    await fetch(`/api/storage/documents/${docId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${idToken}` },
    });
    await loadBillingAndCloud(idToken);
    await refreshAccountOverview();
  };

  if (!user) {
    return (
      <div className="max-w-xl mx-auto my-12 bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
        <Shield className="w-10 h-10 text-teal-400 mx-auto" />
        <h2 className="text-xl font-bold text-white">Sign In to Manage Subscription & Sync</h2>
        <p className="text-sm text-slate-400">
          Authenticate with Google or your registered researcher email to access cloud synchronization, AI credits, PDF storage, and billing receipts.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
          >
            Sign In with Google
          </button>
          <button
            type="button"
            onClick={onBackToWorkbench}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
          >
            Return to Workbench
          </button>
        </div>
      </div>
    );
  }

  const currentPlan = accountOverview?.entitlement.plan;
  const sub = accountOverview?.entitlement.subscription;
  const storageUsedMb = ((accountOverview?.user.storageUsedBytes || 0) / (1024 * 1024)).toFixed(2);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Account, Subscription & Cross-Device Sync
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Unified Web & Android researcher entitlement · {user.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToWorkbench}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold border border-slate-700 cursor-pointer"
          >
            Back to SLR Workbench
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-rose-300 text-xs font-semibold border border-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
          <p className="text-xs text-slate-400">Active Plan</p>
          <p className="text-lg font-bold text-white">{currentPlan?.name || 'Free Starter'}</p>
          <p className="text-[11px] text-teal-400 capitalize">
            Status: {sub?.status || 'active'} ({sub?.provider || 'free'})
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
          <p className="text-xs text-slate-400">AI Credits Remaining</p>
          <p className="text-lg font-bold text-white tabular-nums">
            {(accountOverview?.user.aiCreditsBalance ?? 50).toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-400 tabular-nums">
            {(accountOverview?.user.aiCreditsUsed ?? 0).toLocaleString()} used lifetime
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
          <p className="text-xs text-slate-400">Cloud PDF Storage</p>
          <p className="text-lg font-bold text-white tabular-nums">{storageUsedMb} MB</p>
          <p className="text-[11px] text-slate-400 tabular-nums">
            Quota: {currentPlan?.storageQuotaMb || 100} MB ({documents.length} files)
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
          <p className="text-xs text-slate-400">Sync Status</p>
          <p className="text-lg font-bold text-white">{syncStatus}</p>
          <p className="text-[11px] text-slate-400 tabular-nums">
            {pendingOps.length} offline queued ops · {cloudProjects.length} cloud projects
          </p>
        </div>
      </div>

      {statusMessage && (
        <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-xl px-4 py-3 text-xs text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="bg-rose-950/60 border border-rose-500/40 rounded-xl px-4 py-3 text-xs text-rose-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'subscription', label: 'Plans, Billing & Invoices', icon: CreditCard },
          { id: 'sync', label: 'Cloud Sync & PDF Storage', icon: Cloud },
          { id: 'security', label: 'Profile, Sessions & Data Export', icon: KeyRound },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveSubTab(t.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition cursor-pointer ${
                activeSubTab === t.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Subscription & Payment Gateways */}
      {activeSubTab === 'subscription' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white">Upgrade or Manage Subscription</h3>
                <p className="text-xs text-slate-400">
                  Server-verified Chapa checkout, Telebirr gateway readiness, and unified Google Play entitlement tracking.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={billingCycle}
                  onChange={(e) => setBillingCycle(e.target.value as 'monthly' | 'annual')}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
                >
                  <option value="monthly">Monthly Billing</option>
                  <option value="annual">Annual Billing</option>
                </select>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as 'ETB' | 'USD')}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
                >
                  <option value="ETB">ETB (Chapa / Telebirr)</option>
                  <option value="USD">USD</option>
                </select>
                {currentPlan && currentPlan.code !== 'free' && !sub?.cancelAtPeriodEnd && (
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={handleCancelSubscription}
                    className="px-3 py-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/40 text-rose-200 text-xs font-semibold cursor-pointer"
                  >
                    Cancel Renewal
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {plans
                .filter((p) => p.code !== 'free')
                .map((plan) => {
                  const amount =
                    currency === 'USD'
                      ? `$${Math.round(
                          (billingCycle === 'annual' ? plan.annualPriceUsd : plan.monthlyPriceUsd) / 100
                        )}`
                      : `${(billingCycle === 'annual'
                          ? plan.annualPriceEtb
                          : plan.monthlyPriceEtb
                        ).toLocaleString()} ETB`;
                  const isCurrent = currentPlan?.code === plan.code;
                  return (
                    <div
                      key={plan.code}
                      className={`rounded-2xl p-4 border flex flex-col justify-between space-y-4 ${
                        isCurrent ? 'bg-slate-950 border-teal-500/60' : 'bg-slate-950/60 border-slate-800'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-white">{plan.name}</h4>
                          {isCurrent && (
                            <span className="text-[10px] font-bold text-teal-400">ACTIVE</span>
                          )}
                        </div>
                        <p className="text-xl font-extrabold text-white tabular-nums">
                          {amount}
                          <span className="text-xs font-normal text-slate-400">
                            /{billingCycle === 'annual' ? 'yr' : 'mo'}
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {plan.maxProjects} projects · {plan.monthlyAiCredits.toLocaleString()} AI credits ·{' '}
                          {plan.storageQuotaMb} MB
                        </p>
                      </div>

                      <div className="space-y-2">
                        <button
                          type="button"
                          disabled={busyAction}
                          onClick={() => void handleCheckout(plan.code, 'chapa')}
                          className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition cursor-pointer"
                        >
                          Pay via Chapa
                        </button>
                        <button
                          type="button"
                          disabled={busyAction}
                          onClick={() => void handleCheckout(plan.code, 'telebirr')}
                          className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
                        >
                          Pay via Telebirr
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white">Payment Transactions & Invoices</h3>
            {transactions.length === 0 ? (
              <p className="text-xs text-slate-400">No subscription payment transactions recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2 pr-4">Invoice</th>
                      <th className="py-2 pr-4">Plan</th>
                      <th className="py-2 pr-4">Provider</th>
                      <th className="py-2 pr-4">Amount</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td className="py-2.5 pr-4 font-mono text-slate-200">{tx.invoiceNumber}</td>
                        <td className="py-2.5 pr-4 capitalize text-white">{tx.planCode}</td>
                        <td className="py-2.5 pr-4 uppercase text-slate-300">{tx.provider}</td>
                        <td className="py-2.5 pr-4 tabular-nums text-white">
                          {tx.amount} {tx.currency}
                        </td>
                        <td className="py-2.5 pr-4 capitalize text-teal-400">{tx.status}</td>
                        <td className="py-2.5 text-slate-400">
                          {new Date(tx.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Cross-Device Cloud Sync & PDF Storage */}
      {activeSubTab === 'sync' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Cloud Project Synchronization</h3>
                <p className="text-xs text-slate-400">
                  Sync local SLR partitions ({projects.length}) to shared Web & Android cloud storage.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  void onManualSyncAll().then(() => {
                    if (idToken) void loadBillingAndCloud(idToken);
                  })
                }
                className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Sync Now</span>
              </button>
            </div>

            {cloudProjects.length === 0 ? (
              <p className="text-xs text-slate-400">
                No projects synced to your cloud workspace yet. Click Sync Now to back up active reviews.
              </p>
            ) : (
              <div className="space-y-2.5">
                {cloudProjects.map((cp) => (
                  <div
                    key={cp.id}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{cp.title}</p>
                      <p className="text-[11px] text-slate-400">
                        v{cp.version} · {cp.articleCount} articles ({cp.includedCount} included) · Device:{' '}
                        {cp.lastSyncedDevice}
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-400 shrink-0">
                      {new Date(cp.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">PDF & Supplementary Document Vault</h3>
                <p className="text-xs text-slate-400">
                  Private cloud object storage scoped to {currentProject?.title?.slice(0, 40) || 'active review'}.
                </p>
              </div>
              <label className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload PDF</span>
                <input
                  type="file"
                  accept=".pdf,.csv,.xlsx,.ris,.bib,.txt"
                  onChange={handleUploadDocument}
                  className="hidden"
                />
              </label>
            </div>

            {documents.length === 0 ? (
              <p className="text-xs text-slate-400">No documents uploaded to cloud storage yet.</p>
            ) : (
              <div className="space-y-2">
                {documents.map((d) => (
                  <div
                    key={d.id}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{d.fileName}</p>
                        <p className="text-[11px] text-slate-400 tabular-nums">
                          {(d.sizeBytes / 1024).toFixed(1)} KB · {d.category}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {d.downloadUrl && (
                        <a
                          href={d.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-teal-400 hover:underline"
                        >
                          Open
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleDeleteDocument(d.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 cursor-pointer"
                        title="Remove file record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Profile, Security, Sessions & Data Ownership */}
      {activeSubTab === 'security' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form
            onSubmit={handleSaveProfile}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <h3 className="text-sm font-bold text-white">Researcher Profile & Verification</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Institution / Organization
                </label>
                <input
                  type="text"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="University / Research Center"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Country</label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Ethiopia / UK / etc."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs flex items-center justify-between gap-2">
              <span className="text-slate-300">
                Email Verification: {user.emailVerified ? 'Verified' : 'Pending Verification'}
              </span>
              {!user.emailVerified && (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await resendVerificationEmail();
                    if (ok) setStatusMessage('Verification email sent.');
                  }}
                  className="text-teal-400 font-semibold hover:underline cursor-pointer"
                >
                  Resend Verification
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={busyAction}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
              >
                Save Profile
              </button>
              <button
                type="button"
                onClick={() => void handleExportAccountData()}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold border border-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export All My Data (JSON)</span>
              </button>
            </div>
          </form>

          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
              <h3 className="text-sm font-bold text-white">Recent Login & Active Sessions</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {(accountOverview?.loginHistory || []).map((lh) => (
                  <div
                    key={lh.id}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-white">{lh.deviceLabel}</p>
                      <p className="text-[11px] text-slate-400">
                        {lh.provider} · {new Date(lh.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span className="text-[11px] font-semibold capitalize text-teal-400">
                      {lh.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900 border border-rose-900/40 rounded-2xl p-6 space-y-3">
              <h3 className="text-sm font-bold text-rose-300">Danger Zone — Account Deletion</h3>
              <p className="text-xs text-slate-400">
                Permanently deletes your account profile, cloud project backups, saved notes, and payment metadata from ResearchMate AI.
              </p>
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="px-4 py-2 rounded-xl bg-rose-950/70 hover:bg-rose-900/70 border border-rose-500/40 text-rose-200 text-xs font-bold cursor-pointer"
                >
                  Delete My Account
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => void handleDeleteAccount()}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
                  >
                    Confirm Permanent Deletion
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
