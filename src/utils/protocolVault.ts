import {
  EligibilityCriterion,
  PicocFramework,
  ProtocolVaultRevision,
  ProtocolVaultSnapshot,
  ResearchQuestion,
  ReviewProject,
} from '../types';

export const PROTOCOL_SCHEMA_VERSION = 2;

const VAULT_STORAGE_KEY = 'researchmate_protocol_vault_v1';
const REVISIONS_STORAGE_KEY = 'researchmate_protocol_revisions_v1';
const MAX_LOCAL_REVISIONS_PER_PROJECT = 20;

const GENERIC_STUB_POPULATION = 'Target subject or problem domain';
const GENERIC_STUB_INTERVENTION = 'Technology or intervention under review';

function safeParseTime(iso?: string): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function cleanStr(val: unknown, fallback = ''): string {
  return typeof val === 'string' ? val : fallback;
}

function normalizePicoc(raw?: Partial<PicocFramework> | null): PicocFramework {
  return {
    population: cleanStr(raw?.population),
    intervention: cleanStr(raw?.intervention),
    comparison: cleanStr(raw?.comparison),
    outcome: cleanStr(raw?.outcome),
    context: cleanStr(raw?.context),
  };
}

function normalizeFrameworkFields(
  raw?: Record<string, unknown> | null,
  picoc?: PicocFramework
): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string') {
        out[k] = v;
      }
    }
  }
  if (picoc) {
    if (!out.population && picoc.population) out.population = picoc.population;
    if (!out.intervention && picoc.intervention) out.intervention = picoc.intervention;
    if (!out.comparison && picoc.comparison) out.comparison = picoc.comparison;
    if (!out.outcome && picoc.outcome) out.outcome = picoc.outcome;
    if (!out.context && picoc.context) out.context = picoc.context;
  }
  return out;
}

function normalizeResearchQuestions(raw?: unknown): ResearchQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === 'object')
    .map((item: any, idx) => ({
      code: cleanStr(item.code, `RQ${idx + 1}`),
      question: cleanStr(item.question),
      mainEvidenceToCollect: cleanStr(item.mainEvidenceToCollect),
    }));
}

function normalizeCriteria(raw?: unknown): EligibilityCriterion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === 'object')
    .map((item: any, idx) => ({
      id: cleanStr(item.id, `crit-${idx + 1}`),
      dimension: cleanStr(item.dimension),
      includeRule: cleanStr(item.includeRule),
      excludeRule: cleanStr(item.excludeRule),
      category: item.category === 'exclusion' ? 'exclusion' : 'inclusion',
    }));
}

function normalizeExclusionReasons(raw?: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === 'string');
}

function normalizeDatabaseQueries(raw?: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

export function extractProtocolSnapshot(project: Partial<ReviewProject>): ProtocolVaultSnapshot {
  const picoc = normalizePicoc(project.picoc);
  const frameworkFields = normalizeFrameworkFields(project.frameworkFields, picoc);
  return {
    id: cleanStr(project.id),
    schemaVersion: Number(project.protocolSchemaVersion || PROTOCOL_SCHEMA_VERSION),
    protocolUpdatedAt:
      cleanStr(project.protocolUpdatedAt) || cleanStr(project.updatedAt) || new Date().toISOString(),
    title: cleanStr(project.title),
    subtitle: cleanStr(project.subtitle),
    scope: cleanStr(project.scope),
    discipline: cleanStr(project.discipline),
    publicationYears: cleanStr(project.publicationYears),
    articleTypes: cleanStr(project.articleTypes),
    geographicEligibility: cleanStr(project.geographicEligibility),
    geographicTargetScale: project.geographicTargetScale,
    geographicSelections: project.geographicSelections ? { ...project.geographicSelections } : undefined,
    studyAreaBoundary: project.studyAreaBoundary ? { ...project.studyAreaBoundary } : undefined,
    methodologyFocus: cleanStr(project.methodologyFocus),
    frameworkType: project.frameworkType || 'PICOC',
    frameworkFields,
    reviewType: project.reviewType || 'slr',
    protocolStandard: project.protocolStandard || 'standard_slr',
    picoc,
    researchQuestions: normalizeResearchQuestions(project.researchQuestions),
    inclusionCriteria: normalizeCriteria(project.inclusionCriteria),
    standardExclusionReasons: normalizeExclusionReasons(project.standardExclusionReasons),
    uncertainCasesGuidance: cleanStr(project.uncertainCasesGuidance),
    booleanQuery: cleanStr(project.booleanQuery),
    booleanDatabaseQueries: normalizeDatabaseQueries(project.booleanDatabaseQueries),
  };
}

export function computeProtocolFingerprint(snapshot: ProtocolVaultSnapshot): string {
  const canonical = {
    frameworkType: snapshot.frameworkType || 'PICOC',
    reviewType: snapshot.reviewType || 'slr',
    protocolStandard: snapshot.protocolStandard || 'standard_slr',
    methodologyFocus: snapshot.methodologyFocus || '',
    scope: snapshot.scope || '',
    geographicEligibility: snapshot.geographicEligibility || '',
    geographicTargetScale: snapshot.geographicTargetScale || 'any',
    geographicSelections: snapshot.geographicSelections || {},
    studyAreaBoundary: snapshot.studyAreaBoundary?.fileName || '',
    picoc: snapshot.picoc,
    frameworkFields: snapshot.frameworkFields || {},
    researchQuestions: snapshot.researchQuestions,
    inclusionCriteria: snapshot.inclusionCriteria,
    standardExclusionReasons: snapshot.standardExclusionReasons,
    uncertainCasesGuidance: snapshot.uncertainCasesGuidance,
    booleanQuery: snapshot.booleanQuery,
    booleanDatabaseQueries: snapshot.booleanDatabaseQueries || {},
  };
  return JSON.stringify(canonical);
}

export function isGenericRecoveryStub(project: Partial<ReviewProject>): boolean {
  const pop = project.picoc?.population?.trim() || '';
  const intv = project.picoc?.intervention?.trim() || '';
  return (
    pop === GENERIC_STUB_POPULATION &&
    intv === GENERIC_STUB_INTERVENTION &&
    (project.researchQuestions?.length || 0) <= 1 &&
    (project.inclusionCriteria?.length || 0) <= 1
  );
}

export function computeProtocolCompletenessScore(project: Partial<ReviewProject>): number {
  if (!project || typeof project !== 'object') return 0;
  if (isGenericRecoveryStub(project)) return 1;

  let score = 0;
  const picocVals = Object.values(project.picoc || {}).filter((v) => typeof v === 'string' && v.trim().length > 0);
  const fwVals = Object.values(project.frameworkFields || {}).filter(
    (v) => typeof v === 'string' && v.trim().length > 0
  );
  score += Math.max(picocVals.length, fwVals.length) * 10;
  score += (project.researchQuestions || []).filter((r) => r?.question?.trim()).length * 12;
  score += (project.inclusionCriteria || []).filter((c) => c?.dimension?.trim() || c?.includeRule?.trim()).length * 12;
  score += (project.standardExclusionReasons || []).filter((r) => typeof r === 'string' && r.trim()).length * 8;
  if (project.uncertainCasesGuidance?.trim()) score += 8;
  if (project.booleanQuery?.trim()) score += 15;
  score += Object.values(project.booleanDatabaseQueries || {}).filter((v) => typeof v === 'string' && v.trim()).length * 6;
  if (project.geographicEligibility?.trim()) score += 5;
  if (project.studyAreaBoundary?.placeNames?.length) score += 8;
  return score;
}

function mergeKeyValueMapsPreferringPrimary(
  primary: Record<string, string>,
  secondary: Record<string, string>
): Record<string, string> {
  const merged: Record<string, string> = {};
  const allKeys = new Set([...Object.keys(secondary), ...Object.keys(primary)]);
  for (const key of allKeys) {
    const pVal = primary[key];
    const sVal = secondary[key];
    // Preserve non-empty values even if the newer copy dropped a field during schema upgrade
    if (typeof pVal === 'string' && pVal.trim().length > 0) {
      merged[key] = pVal;
    } else if (typeof sVal === 'string' && sVal.trim().length > 0) {
      merged[key] = sVal;
    } else if (pVal !== undefined) {
      merged[key] = pVal;
    } else if (sVal !== undefined) {
      merged[key] = sVal;
    }
  }
  return merged;
}

/**
 * Non-destructively merges Protocol & Framework fields (PICOC/Framework, RQs,
 * Eligibility Rules Matrix, Standard Exclusion Reasons, Boolean Search Syntax)
 * between two copies of the same project so updates, syncs, restarts, or crashes
 * never wipe out customized protocol data.
 */
export function mergeProtocolSnapshotsPreservingData(
  incomingA: Partial<ReviewProject>,
  incomingB: Partial<ReviewProject>
): Partial<ReviewProject> {
  const aStub = isGenericRecoveryStub(incomingA);
  const bStub = isGenericRecoveryStub(incomingB);

  const aTime = Math.max(safeParseTime(incomingA.protocolUpdatedAt), safeParseTime(incomingA.updatedAt));
  const bTime = Math.max(safeParseTime(incomingB.protocolUpdatedAt), safeParseTime(incomingB.updatedAt));
  const aScore = computeProtocolCompletenessScore(incomingA);
  const bScore = computeProtocolCompletenessScore(incomingB);

  // Never allow a generic fallback stub or an empty/uninitialized shell to overwrite user data
  let primary = incomingA;
  let secondary = incomingB;
  if (aStub && !bStub) {
    primary = incomingB;
    secondary = incomingA;
  } else if (bStub && !aStub) {
    primary = incomingA;
    secondary = incomingB;
  } else if (bTime > aTime) {
    // If B is newer, confirm B isn't an empty stripped object wiping out A's protocol
    if (bScore === 0 && aScore > 0) {
      primary = incomingA;
      secondary = incomingB;
    } else {
      primary = incomingB;
      secondary = incomingA;
    }
  } else if (aTime === bTime && bScore > aScore) {
    primary = incomingB;
    secondary = incomingA;
  }

  const pSnap = extractProtocolSnapshot(primary);
  const sSnap = extractProtocolSnapshot(secondary);

  const mergedPicoc: PicocFramework = {
    population: pSnap.picoc.population.trim() ? pSnap.picoc.population : sSnap.picoc.population,
    intervention: pSnap.picoc.intervention.trim() ? pSnap.picoc.intervention : sSnap.picoc.intervention,
    comparison: pSnap.picoc.comparison.trim() ? pSnap.picoc.comparison : sSnap.picoc.comparison,
    outcome: pSnap.picoc.outcome.trim() ? pSnap.picoc.outcome : sSnap.picoc.outcome,
    context: pSnap.picoc.context.trim() ? pSnap.picoc.context : sSnap.picoc.context,
  };

  const mergedFrameworkFields = mergeKeyValueMapsPreferringPrimary(
    pSnap.frameworkFields || {},
    sSnap.frameworkFields || {}
  );

  // Sync PICOC core keys into frameworkFields if missing
  if (mergedPicoc.population && !mergedFrameworkFields.population) {
    mergedFrameworkFields.population = mergedPicoc.population;
  }
  if (mergedPicoc.intervention && !mergedFrameworkFields.intervention) {
    mergedFrameworkFields.intervention = mergedPicoc.intervention;
  }
  if (mergedPicoc.comparison && !mergedFrameworkFields.comparison) {
    mergedFrameworkFields.comparison = mergedPicoc.comparison;
  }
  if (mergedPicoc.outcome && !mergedFrameworkFields.outcome) {
    mergedFrameworkFields.outcome = mergedPicoc.outcome;
  }
  if (mergedPicoc.context && !mergedFrameworkFields.context) {
    mergedFrameworkFields.context = mergedPicoc.context;
  }

  // Keep primary's RQs if populated; fallback to secondary only if primary was emptied unintentionally on hydrate
  const primaryHasRqs = pSnap.researchQuestions.some((r) => r.question.trim().length > 0);
  const mergedRqs = primaryHasRqs
    ? pSnap.researchQuestions
    : sSnap.researchQuestions.length > 0
    ? sSnap.researchQuestions
    : pSnap.researchQuestions;

  const primaryHasCriteria = pSnap.inclusionCriteria.some(
    (c) => c.dimension.trim().length > 0 || c.includeRule.trim().length > 0
  );
  const mergedCriteria = primaryHasCriteria
    ? pSnap.inclusionCriteria
    : sSnap.inclusionCriteria.length > 0
    ? sSnap.inclusionCriteria
    : pSnap.inclusionCriteria;

  const primaryHasExclusions = pSnap.standardExclusionReasons.some((r) => r.trim().length > 0);
  const mergedExclusions = primaryHasExclusions
    ? pSnap.standardExclusionReasons
    : sSnap.standardExclusionReasons.length > 0
    ? sSnap.standardExclusionReasons
    : pSnap.standardExclusionReasons;

  const mergedGuidance = pSnap.uncertainCasesGuidance.trim()
    ? pSnap.uncertainCasesGuidance
    : sSnap.uncertainCasesGuidance;

  const mergedBooleanQuery = pSnap.booleanQuery.trim() ? pSnap.booleanQuery : sSnap.booleanQuery;
  const mergedBooleanDbQueries = mergeKeyValueMapsPreferringPrimary(
    pSnap.booleanDatabaseQueries || {},
    sSnap.booleanDatabaseQueries || {}
  );

  const latestTimestamp = Math.max(aTime, bTime);

  return {
    title: pSnap.title || sSnap.title,
    subtitle: pSnap.subtitle || sSnap.subtitle,
    scope: pSnap.scope || sSnap.scope,
    discipline: pSnap.discipline || sSnap.discipline,
    publicationYears: pSnap.publicationYears || sSnap.publicationYears,
    articleTypes: pSnap.articleTypes || sSnap.articleTypes,
    geographicEligibility: pSnap.geographicEligibility || sSnap.geographicEligibility,
    geographicTargetScale: pSnap.geographicTargetScale || sSnap.geographicTargetScale,
    geographicSelections:
      Object.values(pSnap.geographicSelections || {}).filter(Boolean).length >=
      Object.values(sSnap.geographicSelections || {}).filter(Boolean).length
        ? pSnap.geographicSelections || sSnap.geographicSelections
        : sSnap.geographicSelections,
    studyAreaBoundary: pSnap.studyAreaBoundary || sSnap.studyAreaBoundary,
    methodologyFocus: pSnap.methodologyFocus || sSnap.methodologyFocus,
    frameworkType: pSnap.frameworkType || sSnap.frameworkType || 'PICOC',
    frameworkFields: mergedFrameworkFields,
    reviewType: pSnap.reviewType || sSnap.reviewType || 'slr',
    protocolStandard: pSnap.protocolStandard || sSnap.protocolStandard || 'standard_slr',
    picoc: mergedPicoc,
    researchQuestions: mergedRqs,
    inclusionCriteria: mergedCriteria,
    standardExclusionReasons: mergedExclusions,
    uncertainCasesGuidance: mergedGuidance,
    booleanQuery: mergedBooleanQuery,
    booleanDatabaseQueries:
      Object.keys(mergedBooleanDbQueries).length > 0 ? mergedBooleanDbQueries : undefined,
    protocolSchemaVersion: PROTOCOL_SCHEMA_VERSION,
    protocolUpdatedAt:
      latestTimestamp > 0 ? new Date(latestTimestamp).toISOString() : pSnap.protocolUpdatedAt,
  };
}

export function applyProtocolSnapshotToProject(
  project: ReviewProject,
  snapshot: Partial<ProtocolVaultSnapshot>,
  stampNow = true
): ReviewProject {
  const normalized = extractProtocolSnapshot({ ...project, ...snapshot, id: project.id });
  return {
    ...project,
    title: normalized.title || project.title,
    subtitle: normalized.subtitle || project.subtitle,
    scope: normalized.scope,
    discipline: normalized.discipline || project.discipline,
    publicationYears: normalized.publicationYears || project.publicationYears,
    articleTypes: normalized.articleTypes || project.articleTypes,
    geographicEligibility: normalized.geographicEligibility,
    geographicTargetScale: normalized.geographicTargetScale,
    geographicSelections: normalized.geographicSelections,
    studyAreaBoundary: normalized.studyAreaBoundary,
    methodologyFocus: normalized.methodologyFocus,
    frameworkType: normalized.frameworkType,
    frameworkFields: normalized.frameworkFields,
    reviewType: normalized.reviewType,
    protocolStandard: normalized.protocolStandard,
    picoc: normalized.picoc,
    researchQuestions: normalized.researchQuestions,
    inclusionCriteria: normalized.inclusionCriteria,
    standardExclusionReasons: normalized.standardExclusionReasons,
    uncertainCasesGuidance: normalized.uncertainCasesGuidance,
    booleanQuery: normalized.booleanQuery,
    booleanDatabaseQueries: normalized.booleanDatabaseQueries,
    protocolSchemaVersion: PROTOCOL_SCHEMA_VERSION,
    protocolUpdatedAt: stampNow ? new Date().toISOString() : normalized.protocolUpdatedAt,
    updatedAt: stampNow ? new Date().toISOString() : project.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Lightweight LocalStorage Protocol & Framework Vault (Immune to Large Articles)
// ---------------------------------------------------------------------------
export function loadProtocolVaultMap(): Record<string, ProtocolVaultSnapshot> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveProjectProtocolToVault(
  project: Partial<ReviewProject>,
  options?: { authoritative?: boolean }
): ProtocolVaultSnapshot | null {
  if (!project?.id) return null;
  const snapshot = extractProtocolSnapshot(project);
  if (typeof localStorage === 'undefined') return snapshot;
  try {
    const map = loadProtocolVaultMap();
    const prev = map[project.id];
    const resolved =
      options?.authoritative || !prev
        ? snapshot
        : extractProtocolSnapshot({
            ...snapshot,
            ...mergeProtocolSnapshotsPreservingData(snapshot, prev),
            id: project.id,
          });
    map[project.id] = resolved;
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(map));
    return map[project.id];
  } catch {
    return snapshot;
  }
}

export function saveAllProjectProtocolsToVault(projects: ReviewProject[]) {
  if (typeof localStorage === 'undefined' || !Array.isArray(projects)) return;
  try {
    const map = loadProtocolVaultMap();
    for (const proj of projects) {
      if (!proj?.id) continue;
      const snap = extractProtocolSnapshot(proj);
      const prev = map[proj.id];
      const merged = prev ? mergeProtocolSnapshotsPreservingData(snap, prev) : snap;
      map[proj.id] = extractProtocolSnapshot({ ...snap, ...merged, id: proj.id });
    }
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

export function removeProjectProtocolFromVault(projectId: string) {
  if (typeof localStorage === 'undefined' || !projectId) return;
  try {
    const map = loadProtocolVaultMap();
    delete map[projectId];
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(map));

    const revRaw = localStorage.getItem(REVISIONS_STORAGE_KEY);
    if (revRaw) {
      const revMap = JSON.parse(revRaw);
      if (revMap && typeof revMap === 'object') {
        delete revMap[projectId];
        localStorage.setItem(REVISIONS_STORAGE_KEY, JSON.stringify(revMap));
      }
    }
  } catch {}
}

export function loadLocalProtocolRevisions(projectId: string): ProtocolVaultRevision[] {
  if (typeof localStorage === 'undefined' || !projectId) return [];
  try {
    const raw = localStorage.getItem(REVISIONS_STORAGE_KEY);
    if (!raw) return [];
    const map = JSON.parse(raw);
    const list = map?.[projectId];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function appendLocalProtocolRevision(
  project: Partial<ReviewProject>,
  reason = 'Auto-saved protocol checkpoint',
  source: ProtocolVaultRevision['source'] = 'auto'
): ProtocolVaultRevision | null {
  if (!project?.id) return null;
  const snapshot = extractProtocolSnapshot(project);
  const fingerprint = computeProtocolFingerprint(snapshot);
  const revision: ProtocolVaultRevision = {
    revisionId: `rev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    reason,
    source,
    fingerprint,
    snapshot,
  };
  if (typeof localStorage === 'undefined') return revision;

  try {
    const raw = localStorage.getItem(REVISIONS_STORAGE_KEY);
    const map: Record<string, ProtocolVaultRevision[]> = raw ? JSON.parse(raw) || {} : {};
    const existing = Array.isArray(map[project.id]) ? map[project.id] : [];
    const latest = existing[0];

    // Skip creating redundant auto-save revision if identical content & not manual
    if (source === 'auto' && latest && latest.fingerprint === fingerprint) {
      return latest;
    }

    const next = [revision, ...existing].slice(0, MAX_LOCAL_REVISIONS_PER_PROJECT);
    map[project.id] = next;
    localStorage.setItem(REVISIONS_STORAGE_KEY, JSON.stringify(map));
    return revision;
  } catch {
    return revision;
  }
}
