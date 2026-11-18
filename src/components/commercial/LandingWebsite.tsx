import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  FileCheck2,
  GitFork,
  Globe,
  Layers,
  Lock,
  Mail,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserPlus,
  X,
} from 'lucide-react';
import heroVisual from '../../assets/images/researchmate_hero_visual_1794913234675.jpg';
import { AccountPlan, useAuth } from '../../contexts/AuthContext';
import { PWAInstallButton } from '../PWAInstallButton';

interface LandingWebsiteProps {
  onEnterWorkbench: () => void;
  onOpenBilling: () => void;
  onOpenAdmin: () => void;
  initialSection?: 'overview' | 'pricing' | 'support' | 'legal';
}

export const LandingWebsite: React.FC<LandingWebsiteProps> = ({
  onEnterWorkbench,
  onOpenBilling,
  onOpenAdmin,
  initialSection = 'overview',
}) => {
  const {
    user,
    accountOverview,
    authError,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendResetPassword,
    clearAuthError,
  } = useAuth();

  const [plans, setPlans] = useState<AccountPlan[]>([]);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [currency, setCurrency] = useState<'USD' | 'ETB'>('USD');
  const [activeLegalDoc, setActiveLegalDoc] = useState<'privacy' | 'terms' | 'refund'>('privacy');
  const [authModalMode, setAuthModalMode] = useState<'closed' | 'login' | 'register' | 'reset'>('closed');

  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [authSuccessMsg, setAuthSuccessMsg] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  // Support / Contact state
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactSubject, setContactSubject] = useState('');
  const [contactCategory, setContactCategory] = useState('Institutional Licensing');
  const [contactMessage, setContactMessage] = useState('');
  const [contactStatus, setContactStatus] = useState<'idle' | 'submitting' | 'sent' | 'error'>('idle');
  const [contactNotice, setContactNotice] = useState('');

  useEffect(() => {
    fetch('/api/plans')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.plans)) setPlans(d.plans);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (initialSection === 'pricing') {
      document.getElementById('rm-pricing-section')?.scrollIntoView({ behavior: 'smooth' });
    } else if (initialSection === 'support') {
      document.getElementById('rm-support-section')?.scrollIntoView({ behavior: 'smooth' });
    } else if (initialSection === 'legal') {
      document.getElementById('rm-legal-section')?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [initialSection]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthSuccessMsg('');
    clearAuthError();
    setAuthBusy(true);
    try {
      if (authModalMode === 'login') {
        const ok = await signInWithEmail(emailInput, passwordInput);
        if (ok) {
          setAuthModalMode('closed');
          onEnterWorkbench();
        }
      } else if (authModalMode === 'register') {
        const ok = await signUpWithEmail(emailInput, passwordInput, nameInput);
        if (ok) {
          setAuthSuccessMsg(
            'Account created. Check your inbox for an email verification link before accessing cloud writes.'
          );
        }
      } else if (authModalMode === 'reset') {
        const ok = await sendResetPassword(emailInput);
        if (ok) {
          setAuthSuccessMsg('Password reset instructions have been sent to your email address.');
        }
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSupportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactStatus('submitting');
    setContactNotice('');
    try {
      const res = await fetch('/api/support/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contactName,
          email: contactEmail,
          subject: contactSubject,
          category: contactCategory,
          message: contactMessage,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not submit inquiry.');
      setContactStatus('sent');
      setContactNotice(`Support ticket #${data.ticketId} recorded. Our team will respond via email.`);
      setContactSubject('');
      setContactMessage('');
    } catch (err: any) {
      setContactStatus('error');
      setContactNotice(err?.message || 'Submission failed.');
    }
  };

  const formatPlanPrice = (plan: AccountPlan) => {
    if (currency === 'USD') {
      const cents = billingCycle === 'annual' ? plan.annualPriceUsd : plan.monthlyPriceUsd;
      if (cents === 0) return '$0';
      const dollars = Math.round(cents / 100);
      return billingCycle === 'annual' ? `$${dollars}/yr` : `$${dollars}/mo`;
    }
    const etb = billingCycle === 'annual' ? plan.annualPriceEtb : plan.monthlyPriceEtb;
    if (etb === 0) return '0 ETB';
    return billingCycle === 'annual' ? `${etb.toLocaleString()} ETB/yr` : `${etb.toLocaleString()} ETB/mo`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Clean 3-Zone Commercial Navigation Header */}
      <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-teal-500 to-emerald-400 flex items-center justify-center shadow-sm">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-white">
                ResearchMate <span className="text-teal-400">AI</span>
              </span>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Commercial Systematic Literature Review Platform
              </p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
            <a href="#rm-features-section" className="hover:text-white transition">
              Features
            </a>
            <a href="#rm-workflow-section" className="hover:text-white transition">
              How It Works
            </a>
            <a href="#rm-pricing-section" className="hover:text-white transition">
              Pricing
            </a>
            <a href="#rm-support-section" className="hover:text-white transition">
              Support
            </a>
            <a href="#rm-legal-section" className="hover:text-white transition">
              Legal
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <PWAInstallButton />
            {user ? (
              <>
                {accountOverview?.user.role === 'admin' && (
                  <button
                    type="button"
                    onClick={onOpenAdmin}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-amber-300 transition cursor-pointer"
                  >
                    Admin Console
                  </button>
                )}
                <button
                  type="button"
                  onClick={onOpenBilling}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 transition cursor-pointer"
                >
                  Account & Plans
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    clearAuthError();
                    setAuthSuccessMsg('');
                    setAuthModalMode('login');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 transition cursor-pointer"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearAuthError();
                    setAuthSuccessMsg('');
                    setAuthModalMode('register');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-xs font-semibold text-indigo-200 transition cursor-pointer hidden sm:inline-flex items-center gap-1"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Register</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onEnterWorkbench}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-teal-600 hover:from-indigo-500 hover:to-teal-500 text-white text-xs font-bold shadow-sm transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span>Open SLR Workbench</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Editorial Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-12 pb-16 lg:pt-16 lg:pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6 space-y-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-teal-400">
              PRISMA 2020 Compliant · Web & Android Cloud Platform
            </p>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-[1.1]">
              Systematic Literature Reviews Built for Publication Rigor.
            </h1>
            <p className="text-base text-slate-300 leading-relaxed max-w-xl">
              ResearchMate AI combines PICOC scoping, Crossref & OpenAlex literature discovery, explainable AI screening with page-level evidence, 13-point critical appraisal, and synchronized Web & Android offline workflows in one unified cloud platform.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onEnterWorkbench}
                className="px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-teal-600 hover:from-indigo-500 hover:to-teal-500 text-white text-sm font-bold shadow-lg transition inline-flex items-center gap-2 cursor-pointer"
              >
                <span>Launch SLR Workbench</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              {!user && (
                <button
                  type="button"
                  onClick={() => setAuthModalMode('register')}
                  className="px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-100 text-sm font-semibold transition cursor-pointer"
                >
                  Create Free Researcher Account
                </button>
              )}
              <a
                href="#rm-pricing-section"
                className="px-4 py-3 text-sm font-semibold text-slate-300 hover:text-white transition"
              >
                Compare Plans
              </a>
            </div>
            <div className="grid grid-cols-3 gap-6 pt-4 border-t border-slate-800/80 max-w-lg">
              <div>
                <p className="text-xl font-bold text-white tabular-nums">8 Frameworks</p>
                <p className="text-xs text-slate-400">PICOC, PICO, SPIDER & more</p>
              </div>
              <div>
                <p className="text-xl font-bold text-white tabular-nums">PRISMA 2020</p>
                <p className="text-xs text-slate-400">Reconciled live attrition</p>
              </div>
              <div>
                <p className="text-xl font-bold text-white tabular-nums">Web + Android</p>
                <p className="text-xs text-slate-400">Offline queue & cloud sync</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 shadow-2xl">
              <img
                src={heroVisual}
                alt="ResearchMate AI Systematic Literature Review Architecture"
                className="w-full h-auto object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features Bento Section */}
      <section id="rm-features-section" className="border-t border-slate-900 bg-slate-900/40 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-10">
          <div className="max-w-2xl space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400">
              Platform Capabilities
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Every stage of evidence synthesis, strictly traceable.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: BookOpen,
                title: 'Multi-Source Literature Discovery',
                desc: 'Query Crossref, OpenAlex, PubMed, Semantic Scholar, and import RIS/BibTeX/CSV bundles from Scopus or Web of Science with automatic DOI validation.',
              },
              {
                icon: Layers,
                title: 'Explainable AI Screening & Audit',
                desc: 'Title/abstract and full-text eligibility screening grounded directly against your PICOC criteria, returning confidence scores and page-level quotes.',
              },
              {
                icon: FileCheck2,
                title: 'Structured Evidence & 13-Point Appraisal',
                desc: 'Extract predictors, algorithms, validation methods, metrics, and risk-of-bias ratings with zero fabricated citations or invented DOIs.',
              },
              {
                icon: GitFork,
                title: 'Reconciled PRISMA 2020 Flow',
                desc: 'Live identification, duplicate removal, exclusion reasons, and included quantitative/qualitative counts ready for publication export.',
              },
              {
                icon: Smartphone,
                title: 'Offline-Resilient Cross-Device Sync',
                desc: 'Screen articles offline with automatic queued replay, version conflict detection, and unified entitlement sync across Web and Android.',
              },
              {
                icon: ShieldCheck,
                title: 'Private Cloud & PDF Storage',
                desc: 'Each research partition is isolated to its verified owner across Cloud SQL, Firestore security rules, and quota-managed document storage.',
              },
            ].map((feat) => {
              const Icon = feat.icon;
              return (
                <div
                  key={feat.title}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3"
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-teal-400">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-white">{feat.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{feat.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="rm-workflow-section" className="py-16 border-t border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-10">
          <div className="max-w-2xl space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-teal-400">
              How It Works
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              From research protocol to verified manuscript in four structured steps.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            {[
              {
                step: '01',
                title: 'Define Protocol & PICOC',
                body: 'Configure research questions, inclusion/exclusion boundaries, publication windows, and framework rules.',
              },
              {
                step: '02',
                title: 'Import & Deduplicate',
                body: 'Ingest DOIs, academic database searches, or local PDFs into isolated review partitions.',
              },
              {
                step: '03',
                title: 'Screen & Extract',
                body: 'Run side-by-side human + AI screening with page citations, 13-point appraisal, and extraction matrices.',
              },
              {
                step: '04',
                title: 'Synthesize & Export',
                body: 'Generate PRISMA 2020 diagrams, evidence tables, APA 7th referenced drafts, and full JSON/CSV/Word backups.',
              },
            ].map((item) => (
              <div key={item.step} className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-2">
                <span className="text-xs font-mono font-bold text-indigo-400">{item.step}</span>
                <h3 className="text-sm font-bold text-white">{item.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing & Plan Comparison Section */}
      <section id="rm-pricing-section" className="py-16 border-t border-slate-900 bg-slate-900/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400">
                Transparent Subscriptions
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Plans for independent scholars and research institutions.
              </h2>
              <p className="text-sm text-slate-400">
                Single unified entitlement across Web (Chapa / Telebirr) and Android (Google Play Billing).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl bg-slate-900 border border-slate-800 p-1">
                <button
                  type="button"
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    billingCycle === 'monthly' ? 'bg-indigo-600 text-white' : 'text-slate-400'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle('annual')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    billingCycle === 'annual' ? 'bg-indigo-600 text-white' : 'text-slate-400'
                  }`}
                >
                  Annual (Save ~20%)
                </button>
              </div>
              <div className="inline-flex rounded-xl bg-slate-900 border border-slate-800 p-1">
                <button
                  type="button"
                  onClick={() => setCurrency('USD')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    currency === 'USD' ? 'bg-teal-600 text-white' : 'text-slate-400'
                  }`}
                >
                  USD
                </button>
                <button
                  type="button"
                  onClick={() => setCurrency('ETB')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    currency === 'ETB' ? 'bg-teal-600 text-white' : 'text-slate-400'
                  }`}
                >
                  ETB
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {plans.map((plan) => {
              const isHighlighted = plan.code === 'researcher_pro';
              return (
                <div
                  key={plan.code}
                  className={`rounded-2xl p-5 flex flex-col justify-between border ${
                    isHighlighted
                      ? 'bg-slate-900 border-teal-500/60 shadow-lg'
                      : 'bg-slate-900/70 border-slate-800'
                  }`}
                >
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-base font-bold text-white">{plan.name}</h3>
                        {isHighlighted && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400">
                            Recommended
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-1 min-h-[36px]">{plan.tagline}</p>
                    </div>

                    <p className="text-2xl font-extrabold text-white tabular-nums">
                      {formatPlanPrice(plan)}
                    </p>

                    <ul className="space-y-2 text-xs text-slate-300 border-t border-slate-800 pt-4">
                      <li className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                        <span>Up to {plan.maxProjects} SLR projects</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                        <span>{plan.maxArticlesPerProject.toLocaleString()} articles/project</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                        <span>{plan.monthlyAiCredits.toLocaleString()} AI credits/month</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                        <span>
                          {plan.storageQuotaMb >= 1024
                            ? `${Math.round(plan.storageQuotaMb / 1024)} GB`
                            : `${plan.storageQuotaMb} MB`}{' '}
                          PDF storage
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                        <span>
                          {plan.teamSeats > 1 ? `${plan.teamSeats} team seats` : 'Single researcher seat'}
                        </span>
                      </li>
                    </ul>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (user) {
                        onOpenBilling();
                      } else {
                        setAuthModalMode('register');
                      }
                    }}
                    className={`mt-6 w-full py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      isHighlighted
                        ? 'bg-teal-600 hover:bg-teal-500 text-white'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700'
                    }`}
                  >
                    {plan.code === 'free' ? 'Start Free' : 'Choose Plan'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Contact & Help Support Section */}
      <section id="rm-support-section" className="py-16 border-t border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400">
              Help & Institutional Support
            </p>
            <h2 className="text-2xl font-bold text-white">Contact ResearchMate AI</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Questions regarding university seat licensing, Chapa/Telebirr institutional invoicing, PRISMA methodology workflows, or Android companion distribution? Send an inquiry directly to our platform support queue.
            </p>
            <div className="space-y-3 pt-2 text-xs text-slate-300">
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-teal-400" />
                <span>Support Desk: stored directly in PostgreSQL support_tickets</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Globe className="w-4 h-4 text-indigo-400" />
                <span>Cloud Region: Europe-West2 (Cloud Run + Cloud SQL + Firestore)</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Lock className="w-4 h-4 text-emerald-400" />
                <span>Zero-leakage architecture: No keys or secrets exposed client-side</span>
              </div>
            </div>
          </div>

          <form
            onSubmit={handleSupportSubmit}
            className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Dr. Samuel Bekele"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="researcher@university.edu"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Category</label>
                <select
                  value={contactCategory}
                  onChange={(e) => setContactCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-teal-500"
                >
                  <option value="Institutional Licensing">Institutional Licensing</option>
                  <option value="Billing & Chapa/Telebirr">Billing & Chapa/Telebirr</option>
                  <option value="Technical Support">Technical Support</option>
                  <option value="Data Export / Privacy">Data Export / Privacy</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Subject</label>
                <input
                  type="text"
                  required
                  value={contactSubject}
                  onChange={(e) => setContactSubject(e.target.value)}
                  placeholder="Departmental seat inquiry"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Message</label>
              <textarea
                required
                rows={4}
                value={contactMessage}
                onChange={(e) => setContactMessage(e.target.value)}
                placeholder="Describe your research team size, workflow needs, or support question..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-teal-500"
              />
            </div>

            {contactNotice && (
              <p
                className={`text-xs font-medium ${
                  contactStatus === 'error' ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {contactNotice}
              </p>
            )}

            <button
              type="submit"
              disabled={contactStatus === 'submitting'}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-bold transition cursor-pointer"
            >
              {contactStatus === 'submitting' ? 'Submitting...' : 'Send Support Request'}
            </button>
          </form>
        </div>
      </section>

      {/* Legal & Governance Section */}
      <section id="rm-legal-section" className="py-12 border-t border-slate-900 bg-slate-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-white">Governance, Privacy & Commercial Policies</h2>
            <div className="flex items-center gap-2">
              {(['privacy', 'terms', 'refund'] as const).map((docKey) => (
                <button
                  key={docKey}
                  type="button"
                  onClick={() => setActiveLegalDoc(docKey)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    activeLegalDoc === docKey
                      ? 'bg-slate-800 text-white border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {docKey === 'privacy'
                    ? 'Privacy Policy'
                    : docKey === 'terms'
                    ? 'Terms of Service'
                    : 'Refund Policy'}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-xs text-slate-300 leading-relaxed space-y-2">
            {activeLegalDoc === 'privacy' && (
              <>
                <p className="font-bold text-white">ResearchMate AI Privacy Policy</p>
                <p>
                  All research projects, bibliographic metadata, screening decisions, uploaded PDFs, and notes remain strictly isolated per authenticated researcher UID via PostgreSQL foreign-key ownership and Firestore security rules. You may export your complete dataset in JSON format or permanently delete your account at any time from the Account & Billing portal.
                </p>
              </>
            )}
            {activeLegalDoc === 'terms' && (
              <>
                <p className="font-bold text-white">Terms of Service</p>
                <p>
                  Subscriptions grant access to server-side AI screening credits, cloud synchronization, and storage quotas matching your selected tier. Automated AI outputs are decision-support aids aligned with PRISMA 2020; human principal investigators remain responsible for final inclusion and academic manuscript verification.
                </p>
              </>
            )}
            {activeLegalDoc === 'refund' && (
              <>
                <p className="font-bold text-white">Refund & Cancellation Policy</p>
                <p>
                  Users may cancel renewal at any time from Account & Billing, retaining access through the end of the active billing cycle plus a 5-day grace window. Verified Chapa, Telebirr, or Google Play transactions eligible for refund under institutional billing errors are processed and logged by authorized administrators with immediate audit tracking.
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Auth Modal (Login / Registration / Reset) */}
      {authModalMode !== 'closed' && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                {authModalMode === 'login'
                  ? 'Sign In to ResearchMate AI'
                  : authModalMode === 'register'
                  ? 'Create Researcher Account'
                  : 'Reset Password'}
              </h3>
              <button
                type="button"
                onClick={() => setAuthModalMode('closed')}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={async () => {
                await signInWithGoogle();
                setAuthModalMode('closed');
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Continue with Google Sign-In</span>
            </button>

            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <div className="h-px flex-1 bg-slate-800" />
              <span>OR WITH EMAIL</span>
              <div className="h-px flex-1 bg-slate-800" />
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-3">
              {authModalMode === 'register' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Dr. Hana Tadesse"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-teal-500"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="name@institution.edu"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-teal-500"
                />
              </div>
              {authModalMode !== 'reset' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-teal-500"
                  />
                </div>
              )}

              {authError && <p className="text-xs text-rose-400 leading-relaxed">{authError}</p>}
              {authSuccessMsg && (
                <p className="text-xs text-emerald-400 leading-relaxed">{authSuccessMsg}</p>
              )}

              <button
                type="submit"
                disabled={authBusy}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-bold transition cursor-pointer"
              >
                {authBusy
                  ? 'Please wait...'
                  : authModalMode === 'login'
                  ? 'Sign In'
                  : authModalMode === 'register'
                  ? 'Create Account'
                  : 'Send Reset Link'}
              </button>
            </form>

            <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
              {authModalMode === 'login' ? (
                <>
                  <button
                    type="button"
                    onClick={() => setAuthModalMode('reset')}
                    className="hover:text-white cursor-pointer"
                  >
                    Forgot password?
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthModalMode('register')}
                    className="text-teal-400 hover:text-teal-300 font-semibold cursor-pointer"
                  >
                    Need an account? Register
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setAuthModalMode('login')}
                  className="text-teal-400 hover:text-teal-300 font-semibold cursor-pointer"
                >
                  Back to Sign In
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
