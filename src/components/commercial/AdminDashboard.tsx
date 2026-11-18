import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Megaphone,
  RefreshCw,
  ShieldAlert,
  Sliders,
  Trash2,
  Users,
} from 'lucide-react';
import { AccountPlan, useAuth } from '../../contexts/AuthContext';

interface AdminDashboardProps {
  onBackToWorkbench: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBackToWorkbench }) => {
  const { idToken, accountOverview } = useAuth();

  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'plans' | 'payments' | 'ops'>('overview');
  const [overview, setOverview] = useState<any>(null);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [plans, setPlans] = useState<AccountPlan[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [userSearch, setUserSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Announcement composer
  const [annTitle, setAnnTitle] = useState('');
  const [annMessage, setAnnMessage] = useState('');
  const [annSeverity, setAnnSeverity] = useState<'info' | 'warning' | 'release'>('info');

  const isAdmin = accountOverview?.user.role === 'admin';

  const loadAdminData = async (token: string) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [ovRes, usRes, plRes, payRes, annRes, audRes, ticRes, hltRes] = await Promise.all([
        fetch('/api/admin/overview', { headers }),
        fetch('/api/admin/users', { headers }),
        fetch('/api/admin/plans', { headers }),
        fetch('/api/admin/payments', { headers }),
        fetch('/api/admin/announcements', { headers }),
        fetch('/api/admin/audit-logs', { headers }),
        fetch('/api/admin/support-tickets', { headers }),
        fetch('/api/admin/health', { headers }),
      ]);

      if (!ovRes.ok) {
        const d = await ovRes.json();
        throw new Error(d?.error || 'Administrator access denied.');
      }

      setOverview(await ovRes.json());
      if (usRes.ok) setUsersList((await usRes.json()).users || []);
      if (plRes.ok) setPlans((await plRes.json()).plans || []);
      if (payRes.ok) setPayments((await payRes.json()).payments || []);
      if (annRes.ok) setAnnouncements((await annRes.json()).announcements || []);
      if (audRes.ok) setAuditLogs((await audRes.json()).logs || []);
      if (ticRes.ok) setTickets((await ticRes.json()).tickets || []);
      if (hltRes.ok) setHealth(await hltRes.json());
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to load administrator telemetry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (idToken && isAdmin) {
      void loadAdminData(idToken);
    }
  }, [idToken, isAdmin]);

  const handleUpdateUser = async (uid: string, patch: Record<string, unknown>) => {
    if (!idToken) return;
    setNotice('');
    setErrorMsg('');
    const res = await fetch(`/api/admin/users/${uid}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const d = await res.json();
      setErrorMsg(d?.error || 'Failed to update user.');
      return;
    }
    setNotice('User account updated and logged in audit trail.');
    await loadAdminData(idToken);
  };

  const handleSavePlan = async (plan: AccountPlan) => {
    if (!idToken) return;
    setNotice('');
    setErrorMsg('');
    const res = await fetch(`/api/admin/plans/${plan.code}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(plan),
    });
    if (!res.ok) {
      const d = await res.json();
      setErrorMsg(d?.error || 'Failed to update plan.');
      return;
    }
    setNotice(`Plan "${plan.name}" configuration updated.`);
    await loadAdminData(idToken);
  };

  const handleRefundPayment = async (txRef: string) => {
    if (!idToken) return;
    setNotice('');
    setErrorMsg('');
    const res = await fetch(`/api/admin/payments/${encodeURIComponent(txRef)}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const d = await res.json();
    if (!res.ok) {
      setErrorMsg(d?.error || 'Refund failed.');
      return;
    }
    setNotice(`Transaction ${txRef} marked refunded and entitlement reverted to Free.`);
    await loadAdminData(idToken);
  };

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idToken) return;
    const res = await fetch('/api/admin/announcements', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ title: annTitle, message: annMessage, severity: annSeverity }),
    });
    if (res.ok) {
      setAnnTitle('');
      setAnnMessage('');
      setNotice('Announcement published.');
      await loadAdminData(idToken);
    }
  };

  const handleDeleteAnnouncement = async (id: number) => {
    if (!idToken) return;
    await fetch(`/api/admin/announcements/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${idToken}` },
    });
    await loadAdminData(idToken);
  };

  const handleResolveTicket = async (id: number, nextStatus: 'open' | 'resolved') => {
    if (!idToken) return;
    await fetch(`/api/admin/support-tickets/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ status: nextStatus }),
    });
    await loadAdminData(idToken);
  };

  if (!isAdmin) {
    return (
      <div className="max-w-xl mx-auto my-12 bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
        <ShieldAlert className="w-10 h-10 text-amber-400 mx-auto" />
        <h2 className="text-xl font-bold text-white">Administrator Authorization Required</h2>
        <p className="text-sm text-slate-400">
          This console is strictly protected by backend RBAC verification. Sign in with an authorized administrator account to manage platform plans, users, and payments.
        </p>
        <button
          type="button"
          onClick={onBackToWorkbench}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold cursor-pointer"
        >
          Back to SLR Workbench
        </button>
      </div>
    );
  }

  const filteredUsers = usersList.filter(
    (u) =>
      !userSearch.trim() ||
      (u.email || '').toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.displayName || '').toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            ResearchMate AI Administrator Console
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Role-protected governance · Users, subscription plans, payments, AI usage & audit logs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => idToken && void loadAdminData(idToken)}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold border border-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={onBackToWorkbench}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
          >
            SLR Workbench
          </button>
        </div>
      </div>

      {notice && (
        <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-xl px-4 py-3 text-xs text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      {errorMsg && (
        <div className="bg-rose-950/60 border border-rose-500/40 rounded-xl px-4 py-3 text-xs text-rose-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Navigation */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'overview', label: 'Analytics & Health', icon: Activity },
          { id: 'users', label: `Users (${usersList.length})`, icon: Users },
          { id: 'plans', label: 'Plan Limits & Pricing', icon: Sliders },
          { id: 'payments', label: `Payments & Refunds (${payments.length})`, icon: CreditCard },
          { id: 'ops', label: 'Announcements, Tickets & Audit Logs', icon: Megaphone },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as any)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === t.id
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

      {/* Overview Tab */}
      {activeTab === 'overview' && overview && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
              <p className="text-xs text-slate-400">Total Users</p>
              <p className="text-2xl font-extrabold text-white tabular-nums">{overview.totalUsers}</p>
              <p className="text-[11px] text-teal-400 tabular-nums">
                {overview.activeUsers} active · +{overview.newRegistrations7d} last 7d
              </p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
              <p className="text-xs text-slate-400">AI Credits Consumed</p>
              <p className="text-2xl font-extrabold text-white tabular-nums">
                {overview.totalAiCreditsUsed.toLocaleString()}
              </p>
              <p className="text-[11px] text-slate-400">Metered Gemini calls</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
              <p className="text-xs text-slate-400">Cloud Projects & Articles</p>
              <p className="text-2xl font-extrabold text-white tabular-nums">
                {overview.activeCloudProjects}
              </p>
              <p className="text-[11px] text-slate-400 tabular-nums">
                {overview.totalArticlesSynced.toLocaleString()} synced articles
              </p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
              <p className="text-xs text-slate-400">Verified Revenue</p>
              <p className="text-xl font-extrabold text-white tabular-nums">
                {Object.keys(overview.verifiedRevenueByCurrency || {}).length === 0
                  ? '0 ETB'
                  : Object.entries(overview.verifiedRevenueByCurrency)
                      .map(([c, a]) => `${Number(a).toLocaleString()} ${c}`)
                      .join(' · ')}
              </p>
              <p className="text-[11px] text-slate-400 tabular-nums">
                {overview.totalTransactions} tx · {overview.refundedCount} refunded
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-white">Subscription Tier Distribution</h3>
              <div className="space-y-2">
                {Object.entries(overview.planDistribution || {}).map(([code, count]) => (
                  <div
                    key={code}
                    className="flex items-center justify-between text-xs bg-slate-950 px-3 py-2 rounded-xl border border-slate-800"
                  >
                    <span className="font-semibold uppercase text-slate-200">{code}</span>
                    <span className="font-mono font-bold text-teal-400 tabular-nums">
                      {String(count)} users
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {health && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-bold text-white">Runtime & Gateway Configuration Health</h3>
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  {[
                    ['Server Status', health.status],
                    ['Uptime', `${health.uptimeSeconds}s`],
                    ['Memory RSS', `${health.rssMb} MB`],
                    ['Gemini AI Key', health.aiConfigured ? 'Configured' : 'Missing'],
                    ['Chapa Gateway', health.chapaConfigured ? 'Configured' : 'Needs Env Key'],
                    ['Telebirr Gateway', health.telebirrConfigured ? 'Configured' : 'Needs Env Key'],
                    ['Google Play Verify', health.googlePlayConfigured ? 'Configured' : 'Needs Env SA'],
                  ].map(([label, val]) => (
                    <div
                      key={label}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between"
                    >
                      <span className="text-slate-400">{label}</span>
                      <span className="font-semibold text-white">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Users Management Tab */}
      {activeTab === 'users' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-white">Registered Users & Role Governance</h3>
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Filter by email or name..."
              className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white w-full sm:w-64"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2 pr-4">Researcher</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Plan</th>
                  <th className="py-2 pr-4">AI Credits</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredUsers.map((u) => (
                  <tr key={u.uid}>
                    <td className="py-2.5 pr-4">
                      <p className="font-semibold text-white">{u.displayName}</p>
                      <p className="text-[11px] text-slate-400">{u.email}</p>
                    </td>
                    <td className="py-2.5 pr-4">
                      <select
                        value={u.role}
                        onChange={(e) => void handleUpdateUser(u.uid, { role: e.target.value })}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white"
                      >
                        <option value="researcher">researcher</option>
                        <option value="institutional">institutional</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="py-2.5 pr-4">
                      <select
                        value={u.planCode}
                        onChange={(e) => void handleUpdateUser(u.uid, { planCode: e.target.value })}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white"
                      >
                        {plans.map((p) => (
                          <option key={p.code} value={p.code}>
                            {p.code}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums text-white">
                      {u.aiCreditsBalance} ({u.aiCreditsUsed} used)
                    </td>
                    <td className="py-2.5 pr-4 capitalize">
                      <span
                        className={
                          u.status === 'active' ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'
                        }
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="py-2.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void handleUpdateUser(u.uid, {
                            status: u.status === 'active' ? 'suspended' : 'active',
                          })
                        }
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
                      >
                        {u.status === 'active' ? 'Suspend' : 'Reactivate'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void handleUpdateUser(u.uid, {
                            aiCreditsBalance: Number(u.aiCreditsBalance || 0) + 100,
                          })
                        }
                        className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 cursor-pointer"
                      >
                        +100 Credits
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Plans Configuration Tab */}
      {activeTab === 'plans' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {plans.map((plan) => (
            <div key={plan.code} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">{plan.name}</h4>
                  <p className="text-[11px] font-mono text-slate-400">{plan.code}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSavePlan(plan)}
                  className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold cursor-pointer"
                >
                  Save Limits
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">Max Projects</label>
                  <input
                    type="number"
                    value={plan.maxProjects}
                    onChange={(e) =>
                      setPlans((prev) =>
                        prev.map((p) =>
                          p.code === plan.code ? { ...p, maxProjects: Number(e.target.value) } : p
                        )
                      )
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Monthly AI Credits</label>
                  <input
                    type="number"
                    value={plan.monthlyAiCredits}
                    onChange={(e) =>
                      setPlans((prev) =>
                        prev.map((p) =>
                          p.code === plan.code ? { ...p, monthlyAiCredits: Number(e.target.value) } : p
                        )
                      )
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Storage Quota (MB)</label>
                  <input
                    type="number"
                    value={plan.storageQuotaMb}
                    onChange={(e) =>
                      setPlans((prev) =>
                        prev.map((p) =>
                          p.code === plan.code ? { ...p, storageQuotaMb: Number(e.target.value) } : p
                        )
                      )
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Monthly Price (ETB)</label>
                  <input
                    type="number"
                    value={plan.monthlyPriceEtb}
                    onChange={(e) =>
                      setPlans((prev) =>
                        prev.map((p) =>
                          p.code === plan.code ? { ...p, monthlyPriceEtb: Number(e.target.value) } : p
                        )
                      )
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white tabular-nums"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payments & Refunds Tab */}
      {activeTab === 'payments' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white">Platform Payments & Refund Ledger</h3>
          {payments.length === 0 ? (
            <p className="text-xs text-slate-400">No payment transactions recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2 pr-4">Invoice</th>
                    <th className="py-2 pr-4">User</th>
                    <th className="py-2 pr-4">Plan</th>
                    <th className="py-2 pr-4">Provider</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2.5 pr-4 font-mono text-white">{p.invoiceNumber}</td>
                      <td className="py-2.5 pr-4 text-slate-300">{p.userEmail || `UID #${p.userId}`}</td>
                      <td className="py-2.5 pr-4 capitalize text-white">{p.planCode}</td>
                      <td className="py-2.5 pr-4 uppercase text-slate-300">{p.provider}</td>
                      <td className="py-2.5 pr-4 tabular-nums text-white">
                        {p.amount} {p.currency}
                      </td>
                      <td className="py-2.5 pr-4 capitalize text-teal-400">{p.status}</td>
                      <td className="py-2.5">
                        {p.status === 'verified' && (
                          <button
                            type="button"
                            onClick={() => void handleRefundPayment(p.txRef)}
                            className="px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/40 text-rose-200 cursor-pointer"
                          >
                            Record Refund
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Operations: Announcements, Support Tickets & Audit Logs */}
      {activeTab === 'ops' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">Platform Announcements</h3>
            <form onSubmit={handleCreateAnnouncement} className="space-y-3">
              <input
                type="text"
                required
                value={annTitle}
                onChange={(e) => setAnnTitle(e.target.value)}
                placeholder="Announcement headline"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
              />
              <textarea
                required
                rows={2}
                value={annMessage}
                onChange={(e) => setAnnMessage(e.target.value)}
                placeholder="Message to researchers..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
              />
              <div className="flex items-center gap-2">
                <select
                  value={annSeverity}
                  onChange={(e) => setAnnSeverity(e.target.value as any)}
                  className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                >
                  <option value="info">Info</option>
                  <option value="release">Release</option>
                  <option value="warning">Warning</option>
                </select>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
                >
                  Publish Banner
                </button>
              </div>
            </form>
            <div className="space-y-2">
              {announcements.map((a) => (
                <div
                  key={a.id}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <p className="font-bold text-white">{a.title}</p>
                    <p className="text-slate-400">{a.message}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeleteAnnouncement(a.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-white">Support Tickets ({tickets.length})</h3>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {tickets.map((t) => (
                  <div
                    key={t.id}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-white truncate">{t.subject}</p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {t.name} ({t.email}) · {t.category}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void handleResolveTicket(t.id, t.status === 'open' ? 'resolved' : 'open')
                      }
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                        t.status === 'resolved'
                          ? 'bg-emerald-950 text-emerald-300'
                          : 'bg-amber-950 text-amber-300'
                      }`}
                    >
                      {t.status}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-white">Recent Audit Logs</h3>
              <div className="space-y-2 max-h-56 overflow-y-auto text-xs">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2"
                  >
                    <div>
                      <p className="font-mono text-teal-400">{log.action}</p>
                      <p className="text-[11px] text-slate-400">
                        {log.actorEmail || log.actorUid} → {log.targetType} ({log.targetId})
                      </p>
                    </div>
                    <span className="text-[10px] text-slate-500 shrink-0">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
