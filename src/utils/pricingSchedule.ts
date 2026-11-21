export type PricingTenureStage = 'startup' | 'year_1_plus' | 'year_2_plus' | 'standard';

export const STARTUP_ELIGIBLE_PLAN_CODES = new Set([
  'student',
  'researcher_pro',
  'professional',
  'institutional',
]);

export interface StagePricePoint {
  stage: PricingTenureStage;
  label: string;
  shortLabel: string;
  badgeText: string;
  multiplierLabel: string;
  monthlyUsdCents: number;
  annualUsdCents: number;
  monthlyEtb: number;
  annualEtb: number;
}

export interface PlanPricingSchedule {
  eligibleForProgressivePricing: boolean;
  startup: StagePricePoint;
  year1Plus: StagePricePoint;
  year2Plus: StagePricePoint;
  standard: StagePricePoint;
}

export interface UserTenureSummary {
  stage: PricingTenureStage;
  label: string;
  shortLabel: string;
  badgeText: string;
  usageDays: number;
  nextStage: PricingTenureStage | null;
  nextStageLabel: string | null;
  nextTransitionAt: string | null;
  daysUntilNextTransition: number | null;
}

export interface PlanPriceInput {
  code: string;
  monthlyPriceUsd: number;
  annualPriceUsd: number;
  monthlyPriceEtb: number;
  annualPriceEtb: number;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_1_DAYS = 365;
const YEAR_2_DAYS = 730;

export function isProgressivePricingPlan(planCode: string): boolean {
  return STARTUP_ELIGIBLE_PLAN_CODES.has(planCode);
}

/**
 * Computes progressive Start-Up -> Usage-Experience pricing tiers:
 * - Start-Up (Year 0–1): 80% payment reduction from standard base price (base * 0.20)
 * - After 1 Year Usage Experience (Year 1–2): +50% payment over Start-Up (startup * 1.50 = base * 0.30)
 * - After 2 Years Usage Experience (Year 2+): Double Year-1 payment (year1 * 2 = base * 0.60)
 */
export function computePlanPricingSchedule(plan: PlanPriceInput): PlanPricingSchedule {
  const eligible = isProgressivePricingPlan(plan.code);

  const baseMonthlyUsd = Math.max(0, Number(plan.monthlyPriceUsd) || 0);
  const baseAnnualUsd = Math.max(0, Number(plan.annualPriceUsd) || 0);
  const baseMonthlyEtb = Math.max(0, Number(plan.monthlyPriceEtb) || 0);
  const baseAnnualEtb = Math.max(0, Number(plan.annualPriceEtb) || 0);

  const calcStages = (baseVal: number) => {
    if (!eligible || baseVal === 0) {
      return { startup: baseVal, year1: baseVal, year2: baseVal, standard: baseVal };
    }
    const startup = Math.round(baseVal * 0.2); // Decrease payment by 80%
    const year1 = Math.round(startup * 1.5); // After 1 year usage experience: add 50% payment
    const year2 = Math.round(year1 * 2); // After 2 years usage experience: double it
    return { startup, year1, year2, standard: baseVal };
  };

  const mUsd = calcStages(baseMonthlyUsd);
  const aUsd = calcStages(baseAnnualUsd);
  const mEtb = calcStages(baseMonthlyEtb);
  const aEtb = calcStages(baseAnnualEtb);

  return {
    eligibleForProgressivePricing: eligible,
    startup: {
      stage: 'startup',
      label: 'Start-Up Phase (Year 0–1)',
      shortLabel: 'Start-Up (-80%)',
      badgeText: eligible ? '80% Off Start-Up' : 'Free Forever',
      multiplierLabel: eligible ? '-80% off base' : 'Free',
      monthlyUsdCents: mUsd.startup,
      annualUsdCents: aUsd.startup,
      monthlyEtb: mEtb.startup,
      annualEtb: aEtb.startup,
    },
    year1Plus: {
      stage: 'year_1_plus',
      label: 'After 1 Year Experience (Year 1–2)',
      shortLabel: '1+ Yr (+50%)',
      badgeText: eligible ? '+50% after 1 yr' : 'Free Forever',
      multiplierLabel: eligible ? '+50% over Start-Up' : 'Free',
      monthlyUsdCents: mUsd.year1,
      annualUsdCents: aUsd.year1,
      monthlyEtb: mEtb.year1,
      annualEtb: aEtb.year1,
    },
    year2Plus: {
      stage: 'year_2_plus',
      label: 'After 2 Years Experience (Year 2+)',
      shortLabel: '2+ Yrs (2× Rate)',
      badgeText: eligible ? '2× after 2 yrs' : 'Free Forever',
      multiplierLabel: eligible ? '2× Year-1 rate' : 'Free',
      monthlyUsdCents: mUsd.year2,
      annualUsdCents: aUsd.year2,
      monthlyEtb: mEtb.year2,
      annualEtb: aEtb.year2,
    },
    standard: {
      stage: 'standard',
      label: 'Standard Institutional Rate',
      shortLabel: 'Standard Base',
      badgeText: 'List Rate',
      multiplierLabel: '100% base rate',
      monthlyUsdCents: mUsd.standard,
      annualUsdCents: aUsd.standard,
      monthlyEtb: mEtb.standard,
      annualEtb: aEtb.standard,
    },
  };
}

export function resolveUserTenureSummary(
  createdAt?: string | Date | null,
  now: Date = new Date()
): UserTenureSummary {
  if (!createdAt) {
    const nextDate = new Date(now.getTime() + YEAR_1_DAYS * ONE_DAY_MS);
    return {
      stage: 'startup',
      label: 'Start-Up Phase (Year 0–1)',
      shortLabel: 'Start-Up (-80%)',
      badgeText: '80% Off Start-Up Rate',
      usageDays: 0,
      nextStage: 'year_1_plus',
      nextStageLabel: 'After 1 Year Experience (+50% on Start-Up)',
      nextTransitionAt: nextDate.toISOString(),
      daysUntilNextTransition: YEAR_1_DAYS,
    };
  }

  const start = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(start.getTime())) {
    return resolveUserTenureSummary(null, now);
  }

  const diffMs = Math.max(0, now.getTime() - start.getTime());
  const usageDays = Math.floor(diffMs / ONE_DAY_MS);

  if (usageDays < YEAR_1_DAYS) {
    const nextDate = new Date(start.getTime() + YEAR_1_DAYS * ONE_DAY_MS);
    return {
      stage: 'startup',
      label: 'Start-Up Phase (Year 0–1)',
      shortLabel: 'Start-Up (-80%)',
      badgeText: '80% Off Start-Up Rate',
      usageDays,
      nextStage: 'year_1_plus',
      nextStageLabel: 'After 1 Year Experience (+50% on Start-Up)',
      nextTransitionAt: nextDate.toISOString(),
      daysUntilNextTransition: Math.max(1, YEAR_1_DAYS - usageDays),
    };
  }

  if (usageDays < YEAR_2_DAYS) {
    const nextDate = new Date(start.getTime() + YEAR_2_DAYS * ONE_DAY_MS);
    return {
      stage: 'year_1_plus',
      label: '1+ Year Usage Experience (Year 1–2)',
      shortLabel: '1+ Yr (+50%)',
      badgeText: '+50% Experience Step',
      usageDays,
      nextStage: 'year_2_plus',
      nextStageLabel: 'After 2 Years Experience (2× Rate)',
      nextTransitionAt: nextDate.toISOString(),
      daysUntilNextTransition: Math.max(1, YEAR_2_DAYS - usageDays),
    };
  }

  return {
    stage: 'year_2_plus',
    label: '2+ Years Usage Experience (Year 2+)',
    shortLabel: '2+ Yrs (2× Rate)',
    badgeText: '2× Mature Experience Tier',
    usageDays,
    nextStage: null,
    nextStageLabel: null,
    nextTransitionAt: null,
    daysUntilNextTransition: null,
  };
}

export function getStagePointFromSchedule(
  schedule: PlanPricingSchedule,
  stage: PricingTenureStage
): StagePricePoint {
  switch (stage) {
    case 'year_1_plus':
      return schedule.year1Plus;
    case 'year_2_plus':
      return schedule.year2Plus;
    case 'standard':
      return schedule.standard;
    case 'startup':
    default:
      return schedule.startup;
  }
}

export function getStagePriceAmount(
  plan: PlanPriceInput,
  stage: PricingTenureStage,
  billingCycle: 'monthly' | 'annual',
  currency: 'USD' | 'ETB'
): { rawCentsOrEtb: number; majorUnitNumber: number; formatted: string; formattedUnitOnly: string } {
  const schedule = computePlanPricingSchedule(plan);
  const point = getStagePointFromSchedule(schedule, stage);

  if (currency === 'USD') {
    const cents = billingCycle === 'annual' ? point.annualUsdCents : point.monthlyUsdCents;
    const formattedUnitOnly = formatUsdCents(cents);
    if (cents === 0) {
      return { rawCentsOrEtb: 0, majorUnitNumber: 0, formatted: '$0', formattedUnitOnly: '$0' };
    }
    return {
      rawCentsOrEtb: cents,
      majorUnitNumber: Number((cents / 100).toFixed(2)),
      formatted: `${formattedUnitOnly}/${billingCycle === 'annual' ? 'yr' : 'mo'}`,
      formattedUnitOnly,
    };
  }

  const etb = billingCycle === 'annual' ? point.annualEtb : point.monthlyEtb;
  const formattedUnitOnly = `${etb.toLocaleString()} ETB`;
  if (etb === 0) {
    return { rawCentsOrEtb: 0, majorUnitNumber: 0, formatted: '0 ETB', formattedUnitOnly: '0 ETB' };
  }
  return {
    rawCentsOrEtb: etb,
    majorUnitNumber: etb,
    formatted: `${formattedUnitOnly}/${billingCycle === 'annual' ? 'yr' : 'mo'}`,
    formattedUnitOnly,
  };
}

export function formatUsdCents(cents: number): string {
  if (!cents || cents <= 0) return '$0';
  const dollars = cents / 100;
  return cents % 100 === 0 ? `$${dollars.toFixed(0)}` : `$${dollars.toFixed(2)}`;
}
