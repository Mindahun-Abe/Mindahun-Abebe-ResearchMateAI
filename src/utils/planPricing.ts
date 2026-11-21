export const TENURE_ELIGIBLE_PLAN_CODES = [
  'student',
  'researcher_pro',
  'professional',
  'institutional',
] as const;

export type TenureEligiblePlanCode = (typeof TENURE_ELIGIBLE_PLAN_CODES)[number];

export type TenureStageId = 'startup' | 'year_1' | 'year_2_plus';

export interface PlanBasePrices {
  monthlyPriceUsd: number; // cents
  annualPriceUsd: number; // cents
  monthlyPriceEtb: number;
  annualPriceEtb: number;
}

export interface TenureStagePricing extends PlanBasePrices {
  stage: TenureStageId;
  label: string;
  shortLabel: string;
  badgeText: string;
  ruleDescription: string;
  multiplierFromBase: number;
}

export interface PlanTenurePricing {
  isTenureScaled: boolean;
  activeStage: TenureStageId;
  basePrices: PlanBasePrices;
  effectivePrices: PlanBasePrices;
  schedule: Record<TenureStageId, TenureStagePricing>;
}

export interface UsageTenureInfo {
  stage: TenureStageId;
  stageLabel: string;
  badgeText: string;
  usageMonths: number;
  usageYears: number;
  tenureStartedAt: string;
  nextMilestoneStage: TenureStageId | null;
  nextMilestoneDate: string | null;
}

export interface TenureStageMeta {
  stage: TenureStageId;
  label: string;
  shortLabel: string;
  badgeText: string;
  ruleDescription: string;
  multiplierFromBase: number;
}

export const TENURE_STAGE_LIST: TenureStageMeta[] = [
  {
    stage: 'startup',
    label: 'Start-up (Year 0–1)',
    shortLabel: 'Start-up · 50% Off',
    badgeText: '-50% Start-up',
    ruleDescription: 'Decreased by half (50% off base rate) during your first year.',
    multiplierFromBase: 0.5,
  },
  {
    stage: 'year_1',
    label: 'After 1 Year (+50%)',
    shortLabel: 'Year 1+ · +50%',
    badgeText: '+50% after 1 yr',
    ruleDescription: '+50% payment step-up over start-up after 1 year usage experience.',
    multiplierFromBase: 0.75,
  },
  {
    stage: 'year_2_plus',
    label: 'After 2 Years (2×)',
    shortLabel: 'Year 2+ · Double (2×)',
    badgeText: '2× after 2 yrs',
    ruleDescription: 'Double payment step-up (2× Year 1 rate) after 2 years usage experience.',
    multiplierFromBase: 1.5,
  },
];

export const TENURE_STAGE_META_MAP: Record<TenureStageId, TenureStageMeta> = {
  startup: TENURE_STAGE_LIST[0],
  year_1: TENURE_STAGE_LIST[1],
  year_2_plus: TENURE_STAGE_LIST[2],
};

export function isTenureScaledPlan(planCode: string): boolean {
  return (TENURE_ELIGIBLE_PLAN_CODES as readonly string[]).includes(planCode);
}

export function calculateUsageTenure(
  startedAt?: Date | string | null,
  referenceDate: Date = new Date()
): UsageTenureInfo {
  const ref = new Date(referenceDate);
  const parsedStart = startedAt ? new Date(startedAt) : null;
  const validStart =
    parsedStart && !Number.isNaN(parsedStart.getTime()) && parsedStart <= ref
      ? parsedStart
      : ref;

  const oneYearAnniversary = new Date(validStart);
  oneYearAnniversary.setFullYear(oneYearAnniversary.getFullYear() + 1);

  const twoYearAnniversary = new Date(validStart);
  twoYearAnniversary.setFullYear(twoYearAnniversary.getFullYear() + 2);

  let stage: TenureStageId = 'startup';
  let nextMilestoneStage: TenureStageId | null = 'year_1';
  let nextMilestoneDate: string | null = oneYearAnniversary.toISOString();

  if (ref >= twoYearAnniversary) {
    stage = 'year_2_plus';
    nextMilestoneStage = null;
    nextMilestoneDate = null;
  } else if (ref >= oneYearAnniversary) {
    stage = 'year_1';
    nextMilestoneStage = 'year_2_plus';
    nextMilestoneDate = twoYearAnniversary.toISOString();
  }

  const totalMonths = Math.max(
    0,
    (ref.getFullYear() - validStart.getFullYear()) * 12 +
      (ref.getMonth() - validStart.getMonth()) -
      (ref.getDate() < validStart.getDate() ? 1 : 0)
  );
  const usageYears = Number((totalMonths / 12).toFixed(2));
  const meta = TENURE_STAGE_META_MAP[stage];

  return {
    stage,
    stageLabel: meta.label,
    badgeText: meta.badgeText,
    usageMonths: totalMonths,
    usageYears,
    tenureStartedAt: validStart.toISOString(),
    nextMilestoneStage,
    nextMilestoneDate,
  };
}

function scaleBasePrices(base: PlanBasePrices, multiplier: number): PlanBasePrices {
  return {
    monthlyPriceUsd: Math.round(base.monthlyPriceUsd * multiplier),
    annualPriceUsd: Math.round(base.annualPriceUsd * multiplier),
    monthlyPriceEtb: Math.round(base.monthlyPriceEtb * multiplier),
    annualPriceEtb: Math.round(base.annualPriceEtb * multiplier),
  };
}

export function computePlanTenurePricing(
  plan: PlanBasePrices & { code: string },
  stageOrStartDate: TenureStageId | Date | string | null = 'startup'
): PlanTenurePricing {
  const activeStage: TenureStageId =
    stageOrStartDate === 'startup' ||
    stageOrStartDate === 'year_1' ||
    stageOrStartDate === 'year_2_plus'
      ? stageOrStartDate
      : calculateUsageTenure(stageOrStartDate).stage;

  const basePrices: PlanBasePrices = {
    monthlyPriceUsd: plan.monthlyPriceUsd,
    annualPriceUsd: plan.annualPriceUsd,
    monthlyPriceEtb: plan.monthlyPriceEtb,
    annualPriceEtb: plan.annualPriceEtb,
  };

  const scaled = isTenureScaledPlan(plan.code);

  const schedule = {} as Record<TenureStageId, TenureStagePricing>;
  for (const meta of TENURE_STAGE_LIST) {
    const multiplier = scaled ? meta.multiplierFromBase : 1;
    const scaledPrices = scaled ? scaleBasePrices(basePrices, multiplier) : { ...basePrices };
    schedule[meta.stage] = {
      ...scaledPrices,
      stage: meta.stage,
      label: meta.label,
      shortLabel: meta.shortLabel,
      badgeText: scaled ? meta.badgeText : 'Always Free',
      ruleDescription: scaled ? meta.ruleDescription : 'Free starter tier remains $0 / 0 ETB.',
      multiplierFromBase: multiplier,
    };
  }

  const effective = schedule[activeStage];
  return {
    isTenureScaled: scaled,
    activeStage,
    basePrices,
    effectivePrices: {
      monthlyPriceUsd: effective.monthlyPriceUsd,
      annualPriceUsd: effective.annualPriceUsd,
      monthlyPriceEtb: effective.monthlyPriceEtb,
      annualPriceEtb: effective.annualPriceEtb,
    },
    schedule,
  };
}

export function enrichPlanWithTenurePricing<T extends PlanBasePrices & { code: string }>(
  plan: T,
  stageOrStartDate: TenureStageId | Date | string | null = 'startup'
): T & { tenurePricing: PlanTenurePricing } {
  return {
    ...plan,
    tenurePricing: computePlanTenurePricing(plan, stageOrStartDate),
  };
}

export function formatUsdCents(cents: number): string {
  if (cents <= 0) return '$0';
  if (cents % 100 === 0) {
    return `$${(cents / 100).toLocaleString()}`;
  }
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatEtbAmount(amount: number): string {
  if (amount <= 0) return '0 ETB';
  return `${Math.round(amount).toLocaleString()} ETB`;
}

export function formatPriceFromStage(
  prices: PlanBasePrices,
  billingCycle: 'monthly' | 'annual',
  currency: 'USD' | 'ETB',
  includeCycleSuffix = true
): string {
  const suffix = includeCycleSuffix ? (billingCycle === 'annual' ? '/yr' : '/mo') : '';
  if (currency === 'USD') {
    const cents = billingCycle === 'annual' ? prices.annualPriceUsd : prices.monthlyPriceUsd;
    if (cents <= 0) return '$0';
    return `${formatUsdCents(cents)}${suffix}`;
  }
  const etb = billingCycle === 'annual' ? prices.annualPriceEtb : prices.monthlyPriceEtb;
  if (etb <= 0) return '0 ETB';
  return `${formatEtbAmount(etb)}${suffix}`;
}

export function resolveCheckoutCharge(
  plan: PlanBasePrices & { code: string; tenurePricing?: PlanTenurePricing },
  billingCycle: 'monthly' | 'annual',
  currency: 'USD' | 'ETB',
  stageOrStartDate: TenureStageId | Date | string | null = 'startup'
) {
  const tenurePricing = computePlanTenurePricing(plan, stageOrStartDate);
  const stageMeta = TENURE_STAGE_META_MAP[tenurePricing.activeStage];
  const usdCents =
    billingCycle === 'annual'
      ? tenurePricing.effectivePrices.annualPriceUsd
      : tenurePricing.effectivePrices.monthlyPriceUsd;
  const etbAmount =
    billingCycle === 'annual'
      ? tenurePricing.effectivePrices.annualPriceEtb
      : tenurePricing.effectivePrices.monthlyPriceEtb;

  const gatewayAmountString =
    currency === 'USD'
      ? usdCents % 100 === 0
        ? String(usdCents / 100)
        : (usdCents / 100).toFixed(2)
      : String(etbAmount);

  // PostgreSQL payment_transactions.amount is an integer column
  const dbIntegerAmount =
    currency === 'USD' ? Math.round(usdCents / 100) : Math.round(etbAmount);

  const displayFormatted =
    currency === 'USD' ? `${formatUsdCents(usdCents)} USD` : formatEtbAmount(etbAmount);

  return {
    stage: tenurePricing.activeStage,
    stageLabel: stageMeta.label,
    badgeText: stageMeta.badgeText,
    usdCents,
    etbAmount,
    dbIntegerAmount,
    gatewayAmountString,
    displayFormatted,
    tenurePricing,
  };
}
