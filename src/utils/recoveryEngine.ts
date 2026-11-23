import {
  Article,
  DatabaseIdentificationRecord,
  FullTextClassificationTransition,
  FullTextStatusDetails,
  PdfReconciliationCandidate,
  PrismaConsistencyCheck,
  PrismaHistoricalLog,
  PrismaReconciliationReport,
  ProjectBackupManifest,
  ReconciliationOperationRecord,
  RecoveryCandidateMatch,
  RecoveryPreviewSummary,
  RecoveryStagingBatch,
  ReviewProject,
  ScannedDiskPdf,
  UnmatchedPdfDocument,
} from '../types';
import { resolveFullArticleAbstract } from './abstractDisplay';
import {
  applyMetadataCorrectionWithCitationSync,
  normalizeValidDoi,
  sanitizeAuthorsList,
  validateArticleMetadata,
} from './citationFormatter';

export function normalizeTextForMatch(text?: string): string {
  if (!text) return '';
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function compactAlnumKey(text?: string): string {
  return normalizeTextForMatch(text).replace(/\s+/g, '');
}

function extractFirstAuthorSurname(authors?: string[]): string {
  if (!Array.isArray(authors) || authors.length === 0) return '';
  const cleaned = sanitizeAuthorsList(authors);
  if (cleaned.length === 0) return '';
  const first = cleaned[0].trim();
  if (first.includes(',')) {
    return compactAlnumKey(first.split(',')[0]);
  }
  const parts = first.split(/\s+/).filter(Boolean);
  return compactAlnumKey(parts[parts.length - 1] || '');
}

function computeWordJaccardAndDice(aStr: string, bStr: string): number {
  const aNorm = normalizeTextForMatch(aStr);
  const bNorm = normalizeTextForMatch(bStr);
  if (!aNorm || !bNorm) return 0;
  if (aNorm === bNorm) return 1;

  const aWords = new Set(aNorm.split(' ').filter((w) => w.length >= 2));
  const bWords = new Set(bNorm.split(' ').filter((w) => w.length >= 2));
  if (aWords.size === 0 || bWords.size === 0) return 0;

  let inter = 0;
  for (const w of aWords) {
    if (bWords.has(w)) inter++;
  }
  const jaccard = inter / (aWords.size + bWords.size - inter);

  // Character bigram Dice on compact strings for typo / hyphenation resilience
  const ac = aNorm.replace(/\s+/g, '');
  const bc = bNorm.replace(/\s+/g, '');
  if (ac.length < 4 || bc.length < 4) return jaccard;
  const bigramsA = new Map<string, number>();
  for (let i = 0; i < ac.length - 1; i++) {
    const bg = ac.slice(i, i + 2);
    bigramsA.set(bg, (bigramsA.get(bg) || 0) + 1);
  }
  let diceHits = 0;
  for (let i = 0; i < bc.length - 1; i++) {
    const bg = bc.slice(i, i + 2);
    const cnt = bigramsA.get(bg) || 0;
    if (cnt > 0) {
      diceHits++;
      bigramsA.set(bg, cnt - 1);
    }
  }
  const dice = (2 * diceHits) / (ac.length - 1 + (bc.length - 1));
  return Number((0.6 * jaccard + 0.4 * dice).toFixed(4));
}

function articleCompletenessRank(a: Article): number {
  let score = 0;
  if (a.pdfStorage?.storage_status === 'stored_disk' || a.file_path) score += 1000;
  if (a.decision !== 'unscreened') score += 400;
  if (a.fullText && a.fullText.trim().length > 200) score += 200;
  score += validateArticleMetadata(a).completenessScore;
  if (!resolveFullArticleAbstract(a).isPlaceholder) score += 50;
  return score;
}

export function computeFullTextAvailability(
  article: Partial<Article>,
  scannedPdf?: ScannedDiskPdf | null
): FullTextStatusDetails {
  const absRes = resolveFullArticleAbstract(article);
  const abstractAvailable = !absRes.isPlaceholder && absRes.wordCount >= 8;

  const hasDiskPath = Boolean(
    article.pdfStorage?.storage_status === 'stored_disk' ||
      article.pdfStorage?.file_path ||
      article.file_path ||
      article.stored_filename ||
      scannedPdf
  );
  const pdfAttached = hasDiskPath;

  const pdfAccessible = Boolean(
    scannedPdf ||
      article.pdfStorage?.storage_status === 'stored_disk' ||
      (article.file_path && article.pdfStorage?.storage_status !== 'missing_binary') ||
      article.accessStatus === 'downloadable' ||
      Boolean(article.institutionConfirmed && (article.pdfUrl || article.openAccessUrl))
  );

  const hasReadableExtractedText = Boolean(
    (article.fullText &&
      article.fullText.trim().length > 180 &&
      !/%PDF-\d|\/FlateDecode/i.test(article.fullText.slice(0, 400))) ||
      (Array.isArray(article.pages) &&
        article.pages.some((p) => p?.content && p.content.trim().length > 80)) ||
      Boolean(scannedPdf?.textExtractedOk)
  );

  const pdfTextExtracted = hasReadableExtractedText;
  const pdfTextExtractionFailed = Boolean(pdfAttached && pdfAccessible && !pdfTextExtracted);
  const fullTextRetrieved = Boolean(pdfAccessible || pdfTextExtracted);
  const fullTextNotRetrieved = !fullTextRetrieved;
  const verifiedAt = new Date().toISOString();

  if (pdfAttached && pdfAccessible && pdfTextExtractionFailed) {
    return {
      abstractAvailable,
      pdfAttached: true,
      pdfAccessible: true,
      fullTextRetrieved: true,
      pdfTextExtracted: false,
      pdfTextExtractionFailed: true,
      fullTextNotRetrieved: false,
      classification: 'pdf_attached_extraction_failed',
      classificationLabel: 'Full-Text Available (PDF Accessible · Text Extraction Failed)',
      verifiedAt,
      notes:
        'PDF file is attached and accessible on disk, but automatic text extraction failed/unavailable. Classified as full-text available rather than abstract-only.',
    };
  }

  if (fullTextRetrieved) {
    return {
      abstractAvailable,
      pdfAttached,
      pdfAccessible,
      fullTextRetrieved: true,
      pdfTextExtracted,
      pdfTextExtractionFailed: false,
      fullTextNotRetrieved: false,
      classification: 'full_text_retrieved',
      classificationLabel: pdfAttached
        ? 'Full-Text Available (PDF Attached & Accessible)'
        : 'Full-Text Retrieved',
      verifiedAt,
      notes: pdfTextExtracted
        ? 'Verified full-text manuscript content / accessible PDF present.'
        : 'Downloadable full-text link or PDF verified.',
    };
  }

  if (abstractAvailable) {
    return {
      abstractAvailable: true,
      pdfAttached: false,
      pdfAccessible: false,
      fullTextRetrieved: false,
      pdfTextExtracted: false,
      pdfTextExtractionFailed: false,
      fullTextNotRetrieved: true,
      classification: 'abstract_only',
      classificationLabel: 'Abstract Only (No Accessible PDF / Full Text)',
      verifiedAt,
      notes: 'Readable abstract present without an accessible PDF or full-text payload.',
    };
  }

  return {
    abstractAvailable: false,
    pdfAttached: false,
    pdfAccessible: false,
    fullTextRetrieved: false,
    pdfTextExtracted: false,
    pdfTextExtractionFailed: false,
    fullTextNotRetrieved: true,
    classification: 'full_text_not_retrieved',
    classificationLabel: 'Full Text Not Retrieved',
    verifiedAt,
    notes: 'Neither accessible full-text PDF nor readable abstract text could be verified.',
  };
}

function buildDuplicateClusterKey(rec: {
  doi?: string;
  title?: string;
  authors?: string[];
  year?: number;
}): string {
  const doi = normalizeValidDoi(rec.doi);
  if (doi) return `doi::${doi.toLowerCase()}`;
  const tKey = compactAlnumKey(rec.title);
  if (tKey.length >= 15) return `title::${tKey}`;
  const surname = extractFirstAuthorSurname(rec.authors);
  return `tay::${tKey.slice(0, 40)}::${surname}::${rec.year || 'nd'}`;
}

export function buildPrismaReconciliationReport(params: {
  articles: Article[];
  stagingBatches: RecoveryStagingBatch[];
  historicalLog?: PrismaHistoricalLog;
  diskPdfCount: number;
  unmatchedPdfCount?: number;
}): PrismaReconciliationReport {
  const { articles, stagingBatches, historicalLog, diskPdfCount } = params;
  const nonDupArticles = articles.filter((a) => !a.isDuplicate);

  // 1. Database identification breakdown: prefer staged export batches -> historical log -> explicit verified sourceRecords
  const dbCountsFromStaged: Record<string, number> = {};
  let totalStagedRecords = 0;
  let allStagedVerified = stagingBatches.length > 0;
  for (const batch of stagingBatches) {
    for (const rec of batch.records) {
      totalStagedRecords++;
      const dbLabel = rec.databaseName || batch.databaseName;
      dbCountsFromStaged[dbLabel] = (dbCountsFromStaged[dbLabel] || 0) + 1;
      if (!rec.databaseVerified) allStagedVerified = false;
    }
  }

  let identifiedByDatabase: Record<string, number> = {};
  let totalRecordsIdentified = 0;
  let identifiedByDatabaseVerified = false;

  if (totalStagedRecords > 0) {
    identifiedByDatabase = { ...dbCountsFromStaged };
    totalRecordsIdentified = totalStagedRecords;
    identifiedByDatabaseVerified = allStagedVerified;
  } else if (
    historicalLog?.identifiedByDatabase &&
    Object.keys(historicalLog.identifiedByDatabase).length > 0
  ) {
    identifiedByDatabase = { ...historicalLog.identifiedByDatabase };
    totalRecordsIdentified =
      typeof historicalLog.totalRecordsIdentified === 'number'
        ? historicalLog.totalRecordsIdentified
        : Object.values(historicalLog.identifiedByDatabase).reduce((s, n) => s + n, 0);
    identifiedByDatabaseVerified = Boolean(historicalLog.verifiedByResearcher);
  } else {
    // Only count records with explicitly verified provenance (either attached databaseSourceRecords or non-generic sourceDatabase)
    for (const art of articles) {
      if (Array.isArray(art.databaseSourceRecords) && art.databaseSourceRecords.length > 0) {
        for (const srcRec of art.databaseSourceRecords) {
          identifiedByDatabase[srcRec.databaseName] =
            (identifiedByDatabase[srcRec.databaseName] || 0) + 1;
          totalRecordsIdentified++;
        }
      } else {
        const db = (art.sourceDatabase || '').trim();
        const label =
          db && !['manual', 'other', 'unknown', 'local', ''].includes(db.toLowerCase())
            ? db
            : 'Unattributed Local Records';
        identifiedByDatabase[label] = (identifiedByDatabase[label] || 0) + 1;
        totalRecordsIdentified++;
      }
    }
    identifiedByDatabaseVerified = false;
  }

  // Unique deduplicated identification records across staged batches + existing library
  const linkedRecordIdToCluster = new Map<string, string>();
  const uniqueClusterKeys = new Set<string>();
  for (const art of nonDupArticles) {
    const artKey = buildDuplicateClusterKey(art);
    uniqueClusterKeys.add(artKey);
    if (Array.isArray(art.databaseSourceRecords)) {
      for (const srcRec of art.databaseSourceRecords) {
        if (srcRec?.id) linkedRecordIdToCluster.set(srcRec.id, artKey);
      }
    }
  }
  for (const batch of stagingBatches) {
    for (const rec of batch.records) {
      const mappedKey = linkedRecordIdToCluster.get(rec.id) || buildDuplicateClusterKey(rec);
      uniqueClusterKeys.add(mappedKey);
    }
  }

  const libraryDuplicateFlags = articles.filter((a) => a.isDuplicate).length;
  const duplicatesRemoved =
    typeof historicalLog?.duplicatesRemoved === 'number'
      ? historicalLog.duplicatesRemoved
      : totalStagedRecords > 0
      ? Math.max(0, totalStagedRecords - uniqueClusterKeys.size, libraryDuplicateFlags)
      : libraryDuplicateFlags;

  const removedOtherReasons =
    typeof historicalLog?.removedOtherReasons === 'number'
      ? historicalLog.removedOtherReasons
      : 0;

  // Never silently fabricate historical screening counts from current library size alone if staged exports show missing historical records
  const hasHistoricalScreeningLog = Boolean(
    historicalLog &&
      (typeof historicalLog.recordsScreened === 'number' ||
        typeof historicalLog.recordsExcludedAtScreening === 'number' ||
        historicalLog.verifiedByResearcher)
  );

  const expectedUniqueAfterDedup = Math.max(0, totalRecordsIdentified - duplicatesRemoved - removedOtherReasons);

  const libraryHasFullScreeningCoverage =
    nonDupArticles.length >= expectedUniqueAfterDedup && nonDupArticles.length > 0;

  const recordsScreened =
    typeof historicalLog?.recordsScreened === 'number'
      ? historicalLog.recordsScreened
      : libraryHasFullScreeningCoverage
      ? nonDupArticles.length
      : null;

  const libraryTitleAbsExcluded = nonDupArticles.filter(
    (a) => a.decision === 'exclude' && a.screeningStage === 'title_abstract'
  ).length;
  const libraryFullTextExcluded = nonDupArticles.filter(
    (a) => a.decision === 'exclude' && a.screeningStage !== 'title_abstract'
  ).length;

  const recordsExcludedAtScreening =
    typeof historicalLog?.recordsExcludedAtScreening === 'number'
      ? historicalLog.recordsExcludedAtScreening
      : libraryHasFullScreeningCoverage
      ? libraryTitleAbsExcluded
      : null;

  const reportsSoughtForRetrieval =
    typeof historicalLog?.reportsSoughtForRetrieval === 'number'
      ? historicalLog.reportsSoughtForRetrieval
      : recordsScreened !== null && recordsExcludedAtScreening !== null
      ? Math.max(0, recordsScreened - recordsExcludedAtScreening)
      : null;

  const reportsNotRetrieved =
    typeof historicalLog?.reportsNotRetrieved === 'number'
      ? historicalLog.reportsNotRetrieved
      : hasHistoricalScreeningLog
      ? 0
      : null;

  const reportsAssessedForEligibility =
    typeof historicalLog?.reportsAssessedForEligibility === 'number'
      ? historicalLog.reportsAssessedForEligibility
      : reportsSoughtForRetrieval !== null && reportsNotRetrieved !== null
      ? Math.max(0, reportsSoughtForRetrieval - reportsNotRetrieved)
      : libraryHasFullScreeningCoverage
      ? nonDupArticles.filter((a) => a.decision !== 'exclude' || a.screeningStage !== 'title_abstract').length
      : null;

  const reportsExcludedReasons: Record<string, number> = {
    ...(historicalLog?.reportsExcludedReasons || {}),
  };
  if (Object.keys(reportsExcludedReasons).length === 0) {
    for (const art of nonDupArticles) {
      if (art.decision === 'exclude' && art.screeningStage !== 'title_abstract') {
        const reason = art.decisionReason || 'Excluded at full-text eligibility';
        reportsExcludedReasons[reason] = (reportsExcludedReasons[reason] || 0) + 1;
      }
    }
  }

  const reportsExcludedAtEligibility =
    typeof historicalLog?.reportsExcludedAtEligibility === 'number'
      ? historicalLog.reportsExcludedAtEligibility
      : libraryHasFullScreeningCoverage || hasHistoricalScreeningLog
      ? libraryFullTextExcluded
      : null;

  const includedCount = nonDupArticles.filter((a) => a.decision === 'include').length;
  const studiesIncluded =
    typeof historicalLog?.studiesIncluded === 'number' ? historicalLog.studiesIncluded : includedCount;
  const reportsOfIncludedStudies =
    typeof historicalLog?.reportsOfIncludedStudies === 'number'
      ? historicalLog.reportsOfIncludedStudies
      : includedCount;

  const unverifiedGaps: string[] = [];
  if (stagingBatches.length === 0 && !historicalLog?.identifiedByDatabase) {
    unverifiedGaps.push(
      'No original database export files have been staged yet — database identification provenance is not verified from original exports.'
    );
  }
  if (!allStagedVerified && totalStagedRecords > 0) {
    unverifiedGaps.push(
      'One or more staged export batches lack a confirmed database source name. Assign explicit database attribution before finalizing.'
    );
  }
  if (!hasHistoricalScreeningLog && totalRecordsIdentified > articles.length) {
    unverifiedGaps.push(
      `Imported database exports identify ${totalRecordsIdentified} records (${expectedUniqueAfterDedup} unique), whereas the current library holds ${nonDupArticles.length} non-duplicate articles. Historical title/abstract screening and exclusion logs are required to reconcile the missing ${Math.max(0, expectedUniqueAfterDedup - nonDupArticles.length)} records without fabrication.`
    );
  }
  if (!hasHistoricalScreeningLog && (reportsSoughtForRetrieval === null || reportsNotRetrieved === null)) {
    unverifiedGaps.push(
      `Reports sought for retrieval and reports not retrieved cannot be inferred solely from the ${diskPdfCount} currently stored PDF files. Enter or confirm historical retrieval counts.`
    );
  }
  if ((params.unmatchedPdfCount || 0) > 0) {
    unverifiedGaps.push(
      `${params.unmatchedPdfCount} PDF document(s) on disk are currently unmatched to any article record and remain classified as "unmatched_document" pending reconciliation.`
    );
  }

  const consistencyChecks: PrismaConsistencyCheck[] = [];

  // Check 1: Identification sum
  const dbSum = Object.values(identifiedByDatabase).reduce((s, n) => s + n, 0);
  consistencyChecks.push({
    id: 'prisma_id_sum',
    equationLabel: 'Sum(Database Exports) == Total Records Identified',
    expectedValue: dbSum,
    actualValue: totalRecordsIdentified,
    status: dbSum === totalRecordsIdentified ? (identifiedByDatabaseVerified ? 'pass' : 'warning') : 'discrepancy',
    explanation:
      dbSum === totalRecordsIdentified
        ? identifiedByDatabaseVerified
          ? 'Database export counts match total identified records with verified provenance.'
          : 'Counts sum cleanly, but database provenance still awaits full export/researcher verification.'
        : `Database counts sum to ${dbSum}, differing from total identified (${totalRecordsIdentified}).`,
  });

  // Check 2: Identification -> Unique Screened
  if (recordsScreened === null) {
    consistencyChecks.push({
      id: 'prisma_dedup_screen',
      equationLabel: 'Identified − Duplicates − Other Removed == Records Screened',
      expectedValue: expectedUniqueAfterDedup,
      actualValue: null,
      status: 'unverified',
      explanation: `Unique post-deduplication count is ${expectedUniqueAfterDedup}, while current library holds ${nonDupArticles.length} articles. Confirm historical Records Screened in the PRISMA log rather than fabricating.`,
    });
  } else {
    consistencyChecks.push({
      id: 'prisma_dedup_screen',
      equationLabel: 'Identified − Duplicates − Other Removed == Records Screened',
      expectedValue: expectedUniqueAfterDedup,
      actualValue: recordsScreened,
      status: expectedUniqueAfterDedup === recordsScreened ? 'pass' : 'discrepancy',
      explanation:
        expectedUniqueAfterDedup === recordsScreened
          ? 'Unique records after deduplication reconcile exactly with Records Screened.'
          : `Expected ${expectedUniqueAfterDedup} unique records after removing ${duplicatesRemoved} duplicates, but Records Screened is ${recordsScreened}.`,
    });
  }

  // Check 3: Screened -> Reports Sought
  if (recordsScreened === null || recordsExcludedAtScreening === null || reportsSoughtForRetrieval === null) {
    consistencyChecks.push({
      id: 'prisma_screen_sought',
      equationLabel: 'Records Screened − Records Excluded == Reports Sought for Retrieval',
      expectedValue: null,
      actualValue: reportsSoughtForRetrieval,
      status: 'unverified',
      explanation:
        'Historical title/abstract screening exclusions or reports sought counts have not yet been verified by researcher log.',
    });
  } else {
    const expectedSought = Math.max(0, recordsScreened - recordsExcludedAtScreening);
    consistencyChecks.push({
      id: 'prisma_screen_sought',
      equationLabel: 'Records Screened − Records Excluded == Reports Sought for Retrieval',
      expectedValue: expectedSought,
      actualValue: reportsSoughtForRetrieval,
      status: expectedSought === reportsSoughtForRetrieval ? 'pass' : 'discrepancy',
      explanation:
        expectedSought === reportsSoughtForRetrieval
          ? 'Title/abstract screening attrition reconciles with Reports Sought for Retrieval.'
          : `Screened (${recordsScreened}) − Excluded (${recordsExcludedAtScreening}) = ${expectedSought}, differing from Reports Sought (${reportsSoughtForRetrieval}).`,
    });
  }

  // Check 4: Reports Sought -> Reports Assessed
  if (reportsSoughtForRetrieval === null || reportsNotRetrieved === null || reportsAssessedForEligibility === null) {
    consistencyChecks.push({
      id: 'prisma_sought_assessed',
      equationLabel: 'Reports Sought − Reports Not Retrieved == Reports Assessed for Eligibility',
      expectedValue: null,
      actualValue: reportsAssessedForEligibility,
      status: 'unverified',
      explanation:
        'Verify historical Reports Sought and Reports Not Retrieved (cannot assume current disk PDF count equals retrieved reports).',
    });
  } else {
    const expectedAssessed = Math.max(0, reportsSoughtForRetrieval - reportsNotRetrieved);
    consistencyChecks.push({
      id: 'prisma_sought_assessed',
      equationLabel: 'Reports Sought − Reports Not Retrieved == Reports Assessed for Eligibility',
      expectedValue: expectedAssessed,
      actualValue: reportsAssessedForEligibility,
      status: expectedAssessed === reportsAssessedForEligibility ? 'pass' : 'discrepancy',
      explanation:
        expectedAssessed === reportsAssessedForEligibility
          ? 'Full-text retrieval attrition reconciles with Reports Assessed for Eligibility.'
          : `Reports Sought (${reportsSoughtForRetrieval}) − Not Retrieved (${reportsNotRetrieved}) = ${expectedAssessed}, differing from Assessed (${reportsAssessedForEligibility}).`,
    });
  }

  // Check 5: Reports Assessed -> Included
  if (reportsAssessedForEligibility === null || reportsExcludedAtEligibility === null) {
    consistencyChecks.push({
      id: 'prisma_assessed_included',
      equationLabel: 'Reports Assessed − Reports Excluded == Reports of Included Studies',
      expectedValue: null,
      actualValue: reportsOfIncludedStudies,
      status: 'unverified',
      explanation: 'Verify eligibility assessment and full-text exclusion totals to close PRISMA balance.',
    });
  } else {
    const expectedInc = Math.max(0, reportsAssessedForEligibility - reportsExcludedAtEligibility);
    consistencyChecks.push({
      id: 'prisma_assessed_included',
      equationLabel: 'Reports Assessed − Reports Excluded == Reports of Included Studies',
      expectedValue: expectedInc,
      actualValue: reportsOfIncludedStudies,
      status: expectedInc === reportsOfIncludedStudies ? 'pass' : 'discrepancy',
      explanation:
        expectedInc === reportsOfIncludedStudies
          ? 'Full-text eligibility exclusions reconcile exactly with Included Reports.'
          : `Assessed (${reportsAssessedForEligibility}) − Excluded (${reportsExcludedAtEligibility}) = ${expectedInc}, differing from Included Reports (${reportsOfIncludedStudies}). Note: unassessed/uncertain records in library may explain this gap.`,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    distinctionSummary: {
      databaseIdentificationRecords: totalRecordsIdentified,
      uniqueDeduplicatedRecords: uniqueClusterKeys.size,
      reportsSoughtOrAssessed: reportsSoughtForRetrieval,
      reportsIncluded: reportsOfIncludedStudies,
      studiesIncluded,
      currentDiskPdfCount: diskPdfCount,
    },
    identifiedByDatabase,
    identifiedByDatabaseVerified,
    totalRecordsIdentified,
    duplicatesRemoved,
    removedOtherReasons,
    recordsScreened,
    recordsExcludedAtScreening,
    reportsSoughtForRetrieval,
    reportsNotRetrieved,
    reportsAssessedForEligibility,
    reportsExcludedAtEligibility,
    reportsExcludedReasons,
    studiesIncluded,
    reportsOfIncludedStudies,
    unverifiedGaps,
    consistencyChecks,
  };
}

export function computeRecoveryPreview(params: {
  project: ReviewProject;
  stagingBatches: RecoveryStagingBatch[];
  scannedPdfs: ScannedDiskPdf[];
  historicalLog?: PrismaHistoricalLog;
}): RecoveryPreviewSummary {
  const { project, stagingBatches, scannedPdfs, historicalLog } = params;
  const articles = project.articles || [];

  // Index existing articles for fast matching
  const byDoi = new Map<string, Article[]>();
  const byNormTitle = new Map<string, Article[]>();
  const byTay = new Map<string, Article[]>();
  const byHash = new Map<string, Article>();

  for (const art of articles) {
    const d = normalizeValidDoi(art.doi);
    if (d) {
      const k = d.toLowerCase();
      byDoi.set(k, [...(byDoi.get(k) || []), art]);
    }
    const tk = compactAlnumKey(art.title);
    if (tk.length >= 15) {
      byNormTitle.set(tk, [...(byNormTitle.get(tk) || []), art]);
    }
    const surname = extractFirstAuthorSurname(art.authors);
    if (tk.length >= 10 && surname && art.year) {
      const tayKey = `${tk.slice(0, 50)}::${surname}::${art.year}`;
      byTay.set(tayKey, [...(byTay.get(tayKey) || []), art]);
    }
    const h = art.pdfStorage?.file_hash || art.file_hash;
    if (h) byHash.set(h, art);
  }

  const pickBestTarget = (cands: Article[]): Article =>
    [...cands].sort((a, b) => articleCompletenessRank(b) - articleCompletenessRank(a))[0];

  // Match staged database records against existing ResearchMate records following 4-tier priority
  const allStagedRecords = stagingBatches.flatMap((b) => b.records);
  const matches: RecoveryCandidateMatch[] = [];
  const clusterGroupsMap = new Map<
    string,
    {
      clusterKey: string;
      canonicalArticleId?: string;
      canonicalTitle: string;
      databases: Set<string>;
      stagedRecordIds: string[];
      existingArticleIds: Set<string>;
    }
  >();

  for (const rec of allStagedRecords) {
    const recDoi = normalizeValidDoi(rec.doi);
    const recTitleKey = compactAlnumKey(rec.title);
    const recSurname = extractFirstAuthorSurname(rec.authors);
    const recTayKey =
      recTitleKey.length >= 10 && recSurname && rec.year
        ? `${recTitleKey.slice(0, 50)}::${recSurname}::${rec.year}`
        : '';

    let matchedTarget: Article | undefined;
    let tier: RecoveryCandidateMatch['matchTier'] = 'unmatched';
    let confidence = 0;
    let requiresManual = false;
    let reason = 'No match found in existing project library.';

    // Priority 1: Exact DOI
    if (recDoi && byDoi.has(recDoi.toLowerCase())) {
      matchedTarget = pickBestTarget(byDoi.get(recDoi.toLowerCase())!);
      tier = 'exact_doi';
      confidence = 100;
      requiresManual = false;
      reason = `Exact DOI match (${recDoi}).`;
    }
    // Priority 2: Exact normalized title
    else if (recTitleKey.length >= 15 && byNormTitle.has(recTitleKey)) {
      matchedTarget = pickBestTarget(byNormTitle.get(recTitleKey)!);
      tier = 'exact_normalized_title';
      confidence = 97;
      requiresManual = false;
      reason = 'Exact normalized title match.';
    }
    // Priority 3: Title + first author + publication year
    else if (recTayKey && byTay.has(recTayKey)) {
      matchedTarget = pickBestTarget(byTay.get(recTayKey)!);
      tier = 'title_first_author_year';
      confidence = 91;
      requiresManual = false;
      reason = `Matched title prefix + first author (${recSurname}) + year (${rec.year}).`;
    }
    // Priority 4: Fuzzy title similarity with manual confirmation
    else {
      let bestSim = 0;
      let bestArt: Article | undefined;
      for (const art of articles) {
        const sim = computeWordJaccardAndDice(rec.title, art.title);
        if (sim > bestSim) {
          bestSim = sim;
          bestArt = art;
        }
      }
      if (bestArt && bestSim >= 0.72) {
        matchedTarget = bestArt;
        tier = 'fuzzy_title_manual';
        confidence = Math.min(89, Math.round(bestSim * 100));
        requiresManual = true;
        reason = `Fuzzy title similarity (${confidence}%) — requires manual researcher confirmation before linking.`;
      }
    }

    const clusterKey = buildDuplicateClusterKey(rec);
    const existingGroup = clusterGroupsMap.get(clusterKey) || {
      clusterKey,
      canonicalArticleId: matchedTarget?.id,
      canonicalTitle: matchedTarget?.title || rec.title,
      databases: new Set<string>(),
      stagedRecordIds: [],
      existingArticleIds: new Set<string>(),
    };
    existingGroup.databases.add(rec.databaseName);
    existingGroup.stagedRecordIds.push(rec.id);
    if (matchedTarget) {
      if (!existingGroup.canonicalArticleId) {
        existingGroup.canonicalArticleId = matchedTarget.id;
        existingGroup.canonicalTitle = matchedTarget.title;
      }
      existingGroup.existingArticleIds.add(matchedTarget.id);
    }
    clusterGroupsMap.set(clusterKey, existingGroup);

    matches.push({
      matchId: `match-${rec.id}`,
      stagedRecordId: rec.id,
      stagedBatchId: rec.searchBatchId,
      databaseName: rec.databaseName,
      stagedTitle: rec.title,
      stagedDoi: rec.doi,
      stagedAuthors: rec.authors,
      stagedYear: rec.year,
      stagedJournal: rec.journal,
      targetArticleId: matchedTarget?.id,
      targetArticleTitle: matchedTarget?.title,
      targetOriginalFilename: matchedTarget?.original_filename || matchedTarget?.sourceFileName,
      targetHasPdf: Boolean(matchedTarget?.pdfStorage?.storage_status === 'stored_disk' || matchedTarget?.file_path),
      targetDecision: matchedTarget?.decision,
      matchTier: tier,
      confidence,
      requiresManualConfirmation: requiresManual,
      reason,
      duplicateClusterKey: clusterKey,
    });
  }

  // Mark across-import duplicates in matches
  for (const m of matches) {
    if (m.duplicateClusterKey) {
      const grp = clusterGroupsMap.get(m.duplicateClusterKey);
      if (grp && (grp.stagedRecordIds.length > 1 || grp.existingArticleIds.size > 1)) {
        m.isDuplicateAcrossImports = true;
      }
    }
  }

  // Also detect duplicates already present inside existing project articles even without staged matches
  for (const art of articles) {
    const ck = buildDuplicateClusterKey(art);
    const grp = clusterGroupsMap.get(ck);
    if (grp) {
      grp.existingArticleIds.add(art.id);
      if (!grp.canonicalArticleId && !art.isDuplicate) {
        grp.canonicalArticleId = art.id;
        grp.canonicalTitle = art.title;
      }
    } else {
      const hasDuplicatesInLib = articles.some(
        (other) => other.id !== art.id && buildDuplicateClusterKey(other) === ck
      );
      if (hasDuplicatesInLib || art.isDuplicate) {
        clusterGroupsMap.set(ck, {
          clusterKey: ck,
          canonicalArticleId: art.isDuplicate ? art.duplicateOfId : art.id,
          canonicalTitle: art.title,
          databases: new Set([art.sourceDatabase || 'Other']),
          stagedRecordIds: [],
          existingArticleIds: new Set([art.id]),
        });
      }
    }
  }

  const duplicateGroups = Array.from(clusterGroupsMap.values())
    .filter((g) => g.stagedRecordIds.length > 1 || g.existingArticleIds.size > 1)
    .map((g) => ({
      clusterKey: g.clusterKey,
      canonicalArticleId: g.canonicalArticleId,
      canonicalTitle: g.canonicalTitle,
      databases: Array.from(g.databases),
      stagedRecordIds: g.stagedRecordIds,
      existingArticleIds: Array.from(g.existingArticleIds),
    }));

  // 4. Existing PDF Reconciliation against ScannedDiskPdf[]
  const pdfMatches: PdfReconciliationCandidate[] = [];
  const unmatchedPdfs: UnmatchedPdfDocument[] = [];
  const matchedPdfByArticleId = new Map<string, ScannedDiskPdf>();

  for (const pdf of scannedPdfs) {
    const directLinked =
      (pdf.linkedArticleId ? articles.find((a) => a.id === pdf.linkedArticleId) : undefined) ||
      articles.find(
        (a) =>
          a.pdfStorage?.stored_filename === pdf.storedFilename ||
          a.stored_filename === pdf.storedFilename ||
          a.file_path === pdf.relativePath
      );

    if (directLinked) {
      matchedPdfByArticleId.set(directLinked.id, pdf);
      pdfMatches.push({
        candidateId: `pdfcand-${pdf.fileHash.slice(0, 12)}-${directLinked.id}`,
        pdfRelativePath: pdf.relativePath,
        pdfStoredFilename: pdf.storedFilename,
        pdfOriginalFilename: pdf.originalFilename,
        pdfFileHash: pdf.fileHash,
        pdfFileSize: pdf.fileSize,
        targetArticleId: directLinked.id,
        targetArticleTitle: directLinked.title,
        targetHasExistingPdf: true,
        targetExistingPdfHash: directLinked.pdfStorage?.file_hash || directLinked.file_hash,
        targetExistingPdfFilename: directLinked.original_filename || directLinked.sourceFileName,
        matchMethod: 'already_linked',
        confidence: 100,
        requiresManualConfirmation: false,
        wouldReplaceExistingPdf: false,
        alreadyMatchingHash: true,
        textExtractionFailed: pdf.textExtractionFailed,
        reason: 'PDF is already linked to this article with verified disk file.',
      });
      continue;
    }

    // Try file hash match
    if (byHash.has(pdf.fileHash)) {
      const art = byHash.get(pdf.fileHash)!;
      matchedPdfByArticleId.set(art.id, pdf);
      pdfMatches.push({
        candidateId: `pdfcand-${pdf.fileHash.slice(0, 12)}-${art.id}`,
        pdfRelativePath: pdf.relativePath,
        pdfStoredFilename: pdf.storedFilename,
        pdfOriginalFilename: pdf.originalFilename,
        pdfFileHash: pdf.fileHash,
        pdfFileSize: pdf.fileSize,
        targetArticleId: art.id,
        targetArticleTitle: art.title,
        targetHasExistingPdf: Boolean(art.pdfStorage?.storage_status === 'stored_disk'),
        targetExistingPdfHash: art.file_hash,
        targetExistingPdfFilename: art.original_filename,
        matchMethod: 'file_hash',
        confidence: 100,
        requiresManualConfirmation: false,
        wouldReplaceExistingPdf: false,
        alreadyMatchingHash: true,
        textExtractionFailed: pdf.textExtractionFailed,
        reason: 'Exact SHA-256 PDF binary hash match.',
      });
      continue;
    }

    // Try DOI inside PDF
    let targetArt: Article | undefined;
    let method: PdfReconciliationCandidate['matchMethod'] = 'unmatched';
    let conf = 0;
    let manual = false;
    let reason = 'Could not match PDF to any article in project library.';

    const pdfDoi = normalizeValidDoi(pdf.extractedDoi);
    if (pdfDoi && byDoi.has(pdfDoi.toLowerCase())) {
      targetArt = pickBestTarget(byDoi.get(pdfDoi.toLowerCase())!);
      method = 'pdf_doi';
      conf = 99;
      reason = `DOI extracted from PDF (${pdfDoi}) matches article record.`;
    } else if (pdf.extractedTitle && compactAlnumKey(pdf.extractedTitle).length >= 14) {
      const pdfTk = compactAlnumKey(pdf.extractedTitle);
      if (byNormTitle.has(pdfTk)) {
        targetArt = pickBestTarget(byNormTitle.get(pdfTk)!);
        method = 'pdf_title_author_year';
        conf = 94;
        reason = 'Extracted PDF title matches article record.';
      } else {
        let bestSim = 0;
        let bestCand: Article | undefined;
        for (const art of articles) {
          const sim = computeWordJaccardAndDice(pdf.extractedTitle, art.title);
          if (sim > bestSim) {
            bestSim = sim;
            bestCand = art;
          }
        }
        if (bestCand && bestSim >= 0.78) {
          targetArt = bestCand;
          method = 'pdf_title_author_year';
          conf = Math.round(bestSim * 100);
          manual = conf < 90;
          reason = `PDF extracted title similarity (${conf}%).`;
        }
      }
    }

    // Fallback: filename similarity -> ALWAYS requires manual confirmation
    if (!targetArt) {
      const nameStem = pdf.originalFilename.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');
      let bestSim = 0;
      let bestCand: Article | undefined;
      for (const art of articles) {
        const sim = computeWordJaccardAndDice(nameStem, art.title);
        if (sim > bestSim) {
          bestSim = sim;
          bestCand = art;
        }
      }
      if (bestCand && bestSim >= 0.6) {
        targetArt = bestCand;
        method = 'filename_fuzzy_manual';
        conf = Math.min(84, Math.round(bestSim * 100));
        manual = true;
        reason = `Filename similarity (${conf}%) — requires manual researcher confirmation.`;
      }
    }

    if (targetArt) {
      const targetHasExistingPdf = Boolean(
        targetArt.pdfStorage?.storage_status === 'stored_disk' ||
          (targetArt.file_path && targetArt.file_hash && targetArt.file_hash !== pdf.fileHash)
      );
      const alreadyMatchingHash = Boolean(
        (targetArt.pdfStorage?.file_hash || targetArt.file_hash) === pdf.fileHash
      );
      const wouldReplaceExistingPdf = targetHasExistingPdf && !alreadyMatchingHash;
      if (wouldReplaceExistingPdf) {
        manual = true;
        reason += ' Warning: article already has a different PDF attached (replacement requires explicit authorization).';
      }
      if (!manual && !wouldReplaceExistingPdf) {
        matchedPdfByArticleId.set(targetArt.id, pdf);
      }
      pdfMatches.push({
        candidateId: `pdfcand-${pdf.fileHash.slice(0, 12)}-${targetArt.id}`,
        pdfRelativePath: pdf.relativePath,
        pdfStoredFilename: pdf.storedFilename,
        pdfOriginalFilename: pdf.originalFilename,
        pdfFileHash: pdf.fileHash,
        pdfFileSize: pdf.fileSize,
        targetArticleId: targetArt.id,
        targetArticleTitle: targetArt.title,
        targetHasExistingPdf,
        targetExistingPdfHash: targetArt.pdfStorage?.file_hash || targetArt.file_hash,
        targetExistingPdfFilename: targetArt.original_filename || targetArt.sourceFileName,
        matchMethod: method,
        confidence: conf,
        requiresManualConfirmation: manual,
        wouldReplaceExistingPdf,
        alreadyMatchingHash,
        textExtractionFailed: pdf.textExtractionFailed,
        reason,
      });
    } else {
      unmatchedPdfs.push({
        relativePath: pdf.relativePath,
        storedFilename: pdf.storedFilename,
        originalFilename: pdf.originalFilename,
        fileHash: pdf.fileHash,
        fileSize: pdf.fileSize,
        extractedDoi: pdf.extractedDoi,
        extractedTitle: pdf.extractedTitle,
        textExtractionFailed: pdf.textExtractionFailed,
        classification: 'unmatched_document',
        notes:
          'Downloaded PDF on disk could not be matched automatically. Classified as unmatched_document pending reconciliation (NOT abstract-only).',
      });
    }
  }

  // 5. Full-Text Availability Correction preview
  let abstractOnlyBeforeCount = 0;
  let projectedAbstractOnlyAfterCount = 0;
  let pdfWithExtractionFailureFullTextCount = 0;
  let articlesWithoutPdfsCount = 0;
  const fullTextTransitions: FullTextClassificationTransition[] = [];

  for (const art of articles) {
    const hadAbstractFlagBefore =
      art.accessStatus === 'abstract_only' ||
      (art.prismaExclusionFlags || []).includes('abstract_only') ||
      Boolean(
        (art.pdfStorage?.storage_status === 'stored_disk' || art.file_path) &&
          !art.fullText?.trim() &&
          (!art.pages || art.pages.length === 0) &&
          art.decision !== 'include'
      );
    if (hadAbstractFlagBefore) abstractOnlyBeforeCount++;

    const linkedScan =
      matchedPdfByArticleId.get(art.id) ||
      scannedPdfs.find(
        (s) =>
          s.linkedArticleId === art.id ||
          s.storedFilename === art.stored_filename ||
          s.fileHash === art.file_hash
      ) ||
      null;

    const statusDetails = computeFullTextAvailability(art, linkedScan);
    if (!statusDetails.pdfAttached) articlesWithoutPdfsCount++;
    if (statusDetails.classification === 'abstract_only') projectedAbstractOnlyAfterCount++;
    if (statusDetails.classification === 'pdf_attached_extraction_failed') {
      pdfWithExtractionFailureFullTextCount++;
    }

    const changed =
      hadAbstractFlagBefore !== (statusDetails.classification === 'abstract_only') ||
      art.fullTextStatusDetails?.classification !== statusDetails.classification ||
      (statusDetails.pdfAccessible && art.accessStatus !== 'downloadable');

    fullTextTransitions.push({
      articleId: art.id,
      title: art.title,
      previousAccessStatus: art.accessStatus,
      previousHadAbstractOnlyFlag: hadAbstractFlagBefore,
      newStatusDetails: statusDetails,
      changed,
      explanation:
        statusDetails.classification === 'pdf_attached_extraction_failed'
          ? 'Reclassified to Full-Text Available (PDF accessible on disk despite text extraction failure).'
          : statusDetails.classificationLabel,
    });
  }

  const autoConfirmed = matches.filter((m) => m.targetArticleId && !m.requiresManualConfirmation);
  const manualMatches = matches.filter((m) => m.targetArticleId && m.requiresManualConfirmation);
  const unmatchedDb = matches.filter((m) => !m.targetArticleId);
  const existingPdfsMatchedCount = pdfMatches.filter((p) => p.targetArticleId).length;
  const screeningRecordsAffectedCount = new Set(
    matches.filter((m) => m.targetArticleId).map((m) => m.targetArticleId!)
  ).size;

  const prismaPreview = buildPrismaReconciliationReport({
    articles,
    stagingBatches,
    historicalLog,
    diskPdfCount: scannedPdfs.length,
    unmatchedPdfCount: unmatchedPdfs.length,
  });

  const prismaStatisticsAffected: string[] = [];
  if (stagingBatches.length > 0) {
    prismaStatisticsAffected.push(
      `Records identified restored to ${prismaPreview.totalRecordsIdentified} across ${Object.keys(prismaPreview.identifiedByDatabase).length} database(s).`
    );
  }
  if (duplicateGroups.length > 0) {
    prismaStatisticsAffected.push(
      `${duplicateGroups.length} cross-database duplicate cluster(s) identified (${prismaPreview.duplicatesRemoved} duplicate records).`
    );
  }
  if (abstractOnlyBeforeCount !== projectedAbstractOnlyAfterCount) {
    prismaStatisticsAffected.push(
      `Abstract-only classification reduced from ${abstractOnlyBeforeCount} to ${projectedAbstractOnlyAfterCount}.`
    );
  }
  if (unmatchedPdfs.length > 0) {
    prismaStatisticsAffected.push(
      `${unmatchedPdfs.length} disk PDF(s) isolated as unmatched_document pending reconciliation.`
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    originalProjectRecordCount: articles.length,
    importedDatabaseRecordCount: allStagedRecords.length,
    identifiedDuplicatesCount: prismaPreview.duplicatesRemoved,
    proposedArticleMatchesCount: autoConfirmed.length + manualMatches.length,
    autoConfirmedMatchesCount: autoConfirmed.length,
    manualConfirmationMatchesCount: manualMatches.length,
    unmatchedDatabaseRecordsCount: unmatchedDb.length,
    existingPdfsMatchedCount,
    unmatchedPdfsCount: unmatchedPdfs.length,
    articlesWithoutPdfsCount,
    abstractOnlyBeforeCount,
    projectedAbstractOnlyAfterCount,
    pdfWithExtractionFailureFullTextCount,
    screeningRecordsAffectedCount,
    prismaStatisticsAffected,
    matches,
    pdfMatches,
    unmatchedPdfs,
    fullTextTransitions,
    duplicateGroups,
    prismaPreview,
  };
}

export interface ApplyReconciliationApprovalPayload {
  approvedMatchIds: string[];
  rejectedMatchIds: string[];
  manualMatchAssignments?: Record<string, string>; // matchId -> targetArticleId
  addUnmatchedDatabaseRecords?: boolean;
  approvedPdfMatchIds?: string[];
  rejectedPdfMatchIds?: string[];
  allowReplaceExistingPdfIds?: string[];
  recalculateFullTextAvailability?: boolean;
  prismaHistoricalLog?: PrismaHistoricalLog;
  appliedBy?: string;
}

export type RecoveryApprovalPayload = ApplyReconciliationApprovalPayload;

export function applyApprovedReconciliation(params: {
  project: ReviewProject;
  stagingBatches: RecoveryStagingBatch[];
  scannedPdfs: ScannedDiskPdf[];
  preview: RecoveryPreviewSummary;
  approval: ApplyReconciliationApprovalPayload;
  backupId: string;
}): {
  updatedProject: ReviewProject;
  operationRecord: ReconciliationOperationRecord;
  prismaReport: PrismaReconciliationReport;
} {
  const { project, stagingBatches, scannedPdfs, preview, approval, backupId } = params;
  const nowIso = new Date().toISOString();
  const reconciliationId = `recon-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const appliedBy = approval.appliedBy || 'Researcher';

  const approvedMatchSet = new Set(approval.approvedMatchIds || []);
  const rejectedMatchSet = new Set(approval.rejectedMatchIds || []);
  const manualMap = approval.manualMatchAssignments || {};
  const approvedPdfSet = new Set(approval.approvedPdfMatchIds || []);
  const rejectedPdfSet = new Set(approval.rejectedPdfMatchIds || []);
  const allowReplacePdfSet = new Set(approval.allowReplaceExistingPdfIds || []);

  const stagedById = new Map<string, DatabaseIdentificationRecord>();
  for (const b of stagingBatches) {
    for (const r of b.records) stagedById.set(r.id, r);
  }
  const scannedByPath = new Map<string, ScannedDiskPdf>(
    scannedPdfs.map((p) => [p.relativePath, p])
  );

  let articlesCopy: Article[] = (project.articles || []).map((a) => ({ ...a }));
  const articleIndexById = new Map<string, number>();
  articlesCopy.forEach((a, idx) => articleIndexById.set(a.id, idx));

  let approvedMatchesApplied = 0;
  let manualMatchesApplied = 0;
  let pdfLinksApplied = 0;
  let pdfReplacementsAuthorized = 0;
  let newUnmatchedRecordsAdded = 0;
  const notes: string[] = [];

  const attachSourceRecordToArticle = (
    art: Article,
    rec: DatabaseIdentificationRecord,
    actionLabel: string
  ): Article => {
    const existingSources = Array.isArray(art.databaseSourceRecords)
      ? [...art.databaseSourceRecords]
      : [];
    const alreadyHasRecord = existingSources.some(
      (s) =>
        s.id === rec.id ||
        (s.searchBatchId === rec.searchBatchId &&
          s.databaseName === rec.databaseName &&
          compactAlnumKey(s.title) === compactAlnumKey(rec.title))
    );
    const nextSources = alreadyHasRecord ? existingSources : [...existingSources, rec];
    const dbNames = Array.from(
      new Set(
        nextSources
          .filter((s) => s.databaseVerified)
          .map((s) => s.databaseName)
          .concat(art.duplicateMatchedDatabases || [])
      )
    );

    const primaryDb =
      rec.databaseVerified &&
      (!art.sourceDatabase ||
        ['manual', 'other', 'unknown', 'local', ''].includes(art.sourceDatabase.toLowerCase()))
        ? rec.databaseName
        : art.sourceDatabase;

    const absCurrent = resolveFullArticleAbstract(art);
    const shouldFillAbstract = absCurrent.isPlaceholder && Boolean(rec.abstract && rec.abstract.trim().length > 25);

    const metadataPatch: Partial<Article> = {
      sourceDatabase: primaryDb,
      databaseSourceRecords: nextSources,
      ...(dbNames.length > 0 ? { duplicateMatchedDatabases: dbNames } : {}),
      ...(!normalizeValidDoi(art.doi) && rec.doi ? { doi: rec.doi } : {}),
      ...((!art.authors || sanitizeAuthorsList(art.authors).length === 0) && rec.authors.length > 0
        ? { authors: rec.authors }
        : {}),
      ...(!art.year && rec.year ? { year: rec.year } : {}),
      ...(!art.journal && rec.journal ? { journal: rec.journal } : {}),
      ...(!art.volume && rec.volume ? { volume: rec.volume } : {}),
      ...(!art.issue && rec.issue ? { issue: rec.issue } : {}),
      ...(!art.pagesStr && rec.pagesStr ? { pagesStr: rec.pagesStr } : {}),
      ...(!art.publisher && rec.publisher ? { publisher: rec.publisher } : {}),
      ...(shouldFillAbstract ? { abstract: rec.abstract } : {}),
      recoveryAuditTrail: [
        ...(art.recoveryAuditTrail || []),
        {
          id: `ra-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: nowIso,
          action: actionLabel,
          details: `Linked verified ${rec.databaseName} export record (${rec.exportFilename}) without altering ID, PDF filename, or screening decision.`,
          batchId: rec.searchBatchId,
        },
      ],
    };

    // Preserve ID, original_filename, screening decision, reviewer comments, exclusion reasons!
    return applyMetadataCorrectionWithCitationSync(
      art,
      metadataPatch,
      'bibliography_import',
      `Database provenance restored from ${rec.databaseName} (${rec.exportFilename})`
    );
  };

  // 1. Apply approved / manual-assigned database matches
  const unmatchedStagedToPotentiallyAdd: DatabaseIdentificationRecord[] = [];
  for (const m of preview.matches) {
    if (rejectedMatchSet.has(m.matchId)) continue;
    const rec = stagedById.get(m.stagedRecordId);
    if (!rec) continue;

    const assignedTargetId = manualMap[m.matchId] || m.targetArticleId;
    const isExplicitApproved = approvedMatchSet.has(m.matchId) || Boolean(manualMap[m.matchId]);

    if (assignedTargetId && isExplicitApproved && articleIndexById.has(assignedTargetId)) {
      const idx = articleIndexById.get(assignedTargetId)!;
      const isManual = Boolean(manualMap[m.matchId]) || m.requiresManualConfirmation;
      articlesCopy[idx] = attachSourceRecordToArticle(
        articlesCopy[idx],
        rec,
        isManual ? 'manual_database_provenance_match' : 'verified_database_provenance_match'
      );
      if (isManual) manualMatchesApplied++;
      else approvedMatchesApplied++;
    } else if (!assignedTargetId && approval.addUnmatchedDatabaseRecords) {
      unmatchedStagedToPotentiallyAdd.push(rec);
    }
  }

  // Group any unmatched database records added as new canonical records (deduplicating across batches so zero double counting!)
  if (approval.addUnmatchedDatabaseRecords && unmatchedStagedToPotentiallyAdd.length > 0) {
    const newByCluster = new Map<string, DatabaseIdentificationRecord[]>();
    for (const rec of unmatchedStagedToPotentiallyAdd) {
      const ck = buildDuplicateClusterKey(rec);
      newByCluster.set(ck, [...(newByCluster.get(ck) || []), rec]);
    }
    for (const [, groupRecs] of newByCluster.entries()) {
      const primary = groupRecs[0];
      const allDbs = Array.from(
        new Set(groupRecs.filter((r) => r.databaseVerified).map((r) => r.databaseName))
      );
      const newArt: Article = {
        id: `art-rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        projectId: project.id,
        title: primary.title,
        authors: primary.authors,
        year: primary.year,
        journal: primary.journal,
        volume: primary.volume,
        issue: primary.issue,
        pagesStr: primary.pagesStr,
        publisher: primary.publisher,
        doi: primary.doi,
        abstract: primary.abstract || 'Imported from recovered bibliographic database export.',
        url: primary.url,
        sourceDatabase: primary.databaseVerified ? primary.databaseName : 'Other',
        databaseSourceRecords: groupRecs,
        duplicateMatchedDatabases: allDbs.length > 0 ? allDbs : undefined,
        screeningStage: 'title_abstract',
        decision: 'unscreened',
        evidenceCitations: [],
        recoveryAuditTrail: [
          {
            id: `ra-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: nowIso,
            action: 'recovered_unmatched_db_record',
            details: `Created unique canonical record from ${groupRecs.length} database export record(s) (${allDbs.join(', ') || primary.databaseName}).`,
            batchId: primary.searchBatchId,
          },
        ],
      };
      newArt.citationVerificationStatus = validateArticleMetadata(newArt).verificationStatus;
      articlesCopy.push(newArt);
      articleIndexById.set(newArt.id, articlesCopy.length - 1);
      newUnmatchedRecordsAdded++;
    }
  }

  // 2. Apply approved PDF links (NEVER replacing an existing PDF without explicit authorization)
  for (const pm of preview.pdfMatches) {
    if (rejectedPdfSet.has(pm.candidateId)) continue;
    if (!pm.targetArticleId || !articleIndexById.has(pm.targetArticleId)) continue;
    if (pm.alreadyMatchingHash) continue; // Already matching binary — skip cleanly
    if (!approvedPdfSet.has(pm.candidateId)) continue;

    if (pm.wouldReplaceExistingPdf && !allowReplacePdfSet.has(pm.candidateId)) {
      notes.push(
        `Skipped replacing existing PDF on "${pm.targetArticleTitle}" because explicit replacement authorization was not granted.`
      );
      continue;
    }

    const idx = articleIndexById.get(pm.targetArticleId)!;
    const art = articlesCopy[idx];
    const scan = scannedByPath.get(pm.pdfRelativePath);
    const preservedOrigName = scan?.originalFilename || pm.pdfOriginalFilename;

    articlesCopy[idx] = {
      ...art,
      original_filename: preservedOrigName,
      sourceFileName: art.sourceFileName || preservedOrigName,
      stored_filename: pm.pdfStoredFilename,
      file_path: pm.pdfRelativePath,
      file_hash: pm.pdfFileHash,
      file_size: pm.pdfFileSize,
      mime_type: 'application/pdf',
      accessStatus: 'downloadable',
      pdfStorage: {
        original_filename: preservedOrigName,
        stored_filename: pm.pdfStoredFilename,
        file_path: pm.pdfRelativePath,
        file_hash: pm.pdfFileHash,
        file_size: pm.pdfFileSize,
        mime_type: 'application/pdf',
        uploaded_at: art.pdfStorage?.uploaded_at || nowIso,
        storage_status: 'stored_disk',
        integrity_verified_at: nowIso,
      },
      recoveryAuditTrail: [
        ...(art.recoveryAuditTrail || []),
        {
          id: `ra-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: nowIso,
          action: pm.wouldReplaceExistingPdf ? 'authorized_pdf_replace' : 'pdf_reconciled',
          details: `Linked PDF "${preservedOrigName}" via ${pm.matchMethod} (SHA-256 ${pm.pdfFileHash.slice(0, 12)}).`,
        },
      ],
    };

    if (pm.wouldReplaceExistingPdf) pdfReplacementsAuthorized++;
    else pdfLinksApplied++;
  }

  // 3. Full-Text Availability Recalculation
  const abstractOnlyBefore = preview.abstractOnlyBeforeCount;
  let fullTextReclassificationsApplied = 0;
  let abstractOnlyAfter = 0;

  if (approval.recalculateFullTextAvailability !== false) {
    articlesCopy = articlesCopy.map((art) => {
      const scan =
        scannedPdfs.find(
          (s) =>
            s.linkedArticleId === art.id ||
            s.storedFilename === art.stored_filename ||
            (art.file_hash && s.fileHash === art.file_hash)
        ) || null;
      const details = computeFullTextAvailability(art, scan);
      if (details.classification === 'abstract_only') abstractOnlyAfter++;

      const nextFlags = Array.isArray(art.prismaExclusionFlags) ? [...art.prismaExclusionFlags] : [];
      const hadAbstractFlag = nextFlags.includes('abstract_only');
      const shouldHaveDownloadable = details.pdfAccessible && details.pdfAttached;

      let updatedFlags = nextFlags;
      if (shouldHaveDownloadable && hadAbstractFlag) {
        updatedFlags = nextFlags.filter((f) => f !== 'abstract_only');
        if (!updatedFlags.includes('clear:abstract_only')) {
          updatedFlags.push('clear:abstract_only');
        }
      }

      const nextAccess = shouldHaveDownloadable
        ? ('downloadable' as const)
        : details.classification === 'abstract_only'
        ? ('abstract_only' as const)
        : art.accessStatus;

      const changed =
        art.fullTextStatusDetails?.classification !== details.classification ||
        art.accessStatus !== nextAccess ||
        (shouldHaveDownloadable && hadAbstractFlag);

      if (changed) fullTextReclassificationsApplied++;

      return {
        ...art,
        accessStatus: nextAccess,
        prismaExclusionFlags: updatedFlags.length > 0 ? updatedFlags : art.prismaExclusionFlags,
        fullTextStatusDetails: details,
      };
    });
  } else {
    abstractOnlyAfter = abstractOnlyBefore;
  }

  const nextHistoricalLog = approval.prismaHistoricalLog || project.workbenchState?.recovery?.prismaHistoricalLog;
  const prismaReport = buildPrismaReconciliationReport({
    articles: articlesCopy,
    stagingBatches,
    historicalLog: nextHistoricalLog,
    diskPdfCount: scannedPdfs.length,
    unmatchedPdfCount: preview.unmatchedPdfsCount,
  });

  const updatedProject: ReviewProject = {
    ...project,
    updatedAt: nowIso,
    articles: articlesCopy,
    workbenchState: {
      ...(project.workbenchState || {}),
      lastAutoSavedAt: nowIso,
      lastSavedModule: 'recovery',
      recovery: {
        ...(project.workbenchState?.recovery || {}),
        lastBackupId: backupId,
        lastReconciliationId: reconciliationId,
        lastReconciledAt: nowIso,
        ...(nextHistoricalLog ? { prismaHistoricalLog: nextHistoricalLog } : {}),
      },
    },
  };

  const operationRecord: ReconciliationOperationRecord = {
    reconciliationId,
    backupId,
    appliedAt: nowIso,
    appliedBy,
    approvedMatchesApplied,
    manualMatchesApplied,
    rejectedMatchesCount: rejectedMatchSet.size,
    newUnmatchedRecordsAdded,
    pdfLinksApplied,
    pdfReplacementsAuthorized,
    fullTextReclassificationsApplied,
    abstractOnlyBefore,
    abstractOnlyAfter,
    duplicatesConsolidated: preview.duplicateGroups.length,
    screeningDecisionsPreserved: project.articles.length,
    notes,
  };

  return {
    updatedProject,
    operationRecord,
    prismaReport,
  };
}

export interface RecoveryDeliverableBundle {
  generatedAt: string;
  projectRecoveryReport: string;
  databaseProvenanceReport: string;
  duplicateResolutionReport: string;
  pdfReconciliationReport: string;
  abstractClassificationReport: string;
  updatedPrismaReport: string;
  screeningDiagnosticsReport: string;
  recoveryAuditLogReport: string;
  combinedMarkdown: string;
}

export function generateRecoveryDeliverables(params: {
  project: ReviewProject;
  preview: RecoveryPreviewSummary;
  stagingBatches: RecoveryStagingBatch[];
  backups: ProjectBackupManifest[];
  auditLog: ReconciliationOperationRecord[];
}): RecoveryDeliverableBundle {
  const { project, preview, stagingBatches, backups, auditLog } = params;
  const generatedAt = new Date().toISOString();
  const prisma = preview.prismaPreview;

  const projectRecoveryReport = [
    `# 1. Project Recovery Report`,
    `Review: ${project.title} (${project.id})`,
    `Generated: ${generatedAt}`,
    `- Original Project Records Preserved: ${preview.originalProjectRecordCount}`,
    `- Staged Database Export Batches: ${stagingBatches.length} (${preview.importedDatabaseRecordCount} identified records)`,
    `- Verified Backups Available for Rollback: ${backups.length}`,
    `- Latest Backup ID: ${backups[0]?.backupId || 'None created yet'}`,
    `- Screening Decisions & Original Article IDs Preserved: 100%`,
  ].join('\n');

  const databaseProvenanceReport = [
    `# 2. Database Provenance Restoration Report`,
    `Total Identified Records: ${prisma.totalRecordsIdentified} (Verified from Exports: ${prisma.identifiedByDatabaseVerified ? 'Yes' : 'Needs Confirmation'})`,
    ...Object.entries(prisma.identifiedByDatabase).map(
      ([db, count]) => `- ${db}: n = ${count}`
    ),
    ``,
    `## Staged Export Batches`,
    ...(stagingBatches.length > 0
      ? stagingBatches.map(
          (b) =>
            `- Batch ${b.batchId}: ${b.databaseName} · File "${b.exportFilename}" (${b.exportFormat.toUpperCase()}) · ${b.recordsCount} records · Search Date: ${b.searchDate || 'Not specified'} · Verified: ${b.databaseVerified ? 'Yes' : 'Pending'}`
        )
      : ['- No external database export batches staged yet.']),
  ].join('\n');

  const duplicateResolutionReport = [
    `# 3. Duplicate Resolution Report`,
    `Total Duplicate Clusters Detected: ${preview.duplicateGroups.length}`,
    `Duplicates Removed Prior to Screening: ${prisma.duplicatesRemoved}`,
    `Unique Deduplicated Records: ${prisma.distinctionSummary.uniqueDeduplicatedRecords}`,
    ...preview.duplicateGroups.slice(0, 60).map(
      (g, i) =>
        `${i + 1}. "${g.canonicalTitle}" · Canonical ID: ${g.canonicalArticleId || 'New Record'} · Sources: ${g.databases.join(' + ')} · Staged Records: ${g.stagedRecordIds.length}`
    ),
  ].join('\n');

  const pdfReconciliationReport = [
    `# 4. PDF Reconciliation Report`,
    `- Existing PDFs Matched: ${preview.existingPdfsMatchedCount}`,
    `- Unmatched PDFs on Disk (Classified as unmatched_document): ${preview.unmatchedPdfsCount}`,
    `- Articles Without Accessible PDFs: ${preview.articlesWithoutPdfsCount}`,
    ...preview.unmatchedPdfs.map(
      (u) => `- Unmatched Disk PDF: "${u.originalFilename}" (${u.fileSize} bytes · SHA-256 ${u.fileHash.slice(0, 12)})`
    ),
  ].join('\n');

  const abstractClassificationReport = [
    `# 5. Abstract-Only Classification Correction Report`,
    `- Abstract-Only Count Before Reconciliation: ${preview.abstractOnlyBeforeCount}`,
    `- Projected Abstract-Only Count After Reconciliation: ${preview.projectedAbstractOnlyAfterCount}`,
    `- PDFs With Extraction Failure Classified as Full-Text Available: ${preview.pdfWithExtractionFailureFullTextCount}`,
    ...preview.fullTextTransitions
      .filter((t) => t.changed)
      .slice(0, 50)
      .map(
        (t) =>
          `- [${t.articleId}] "${t.title}" -> ${t.newStatusDetails.classificationLabel} (${t.explanation})`
      ),
  ].join('\n');

  const updatedPrismaReport = [
    `# 6. Updated PRISMA 2020 Flow Diagram Summary`,
    `Distinction Check: Database Records (${prisma.distinctionSummary.databaseIdentificationRecords}) vs Unique Records (${prisma.distinctionSummary.uniqueDeduplicatedRecords}) vs Reports Sought (${prisma.distinctionSummary.reportsSoughtOrAssessed ?? 'Unverified'}) vs Included Reports (${prisma.distinctionSummary.reportsIncluded}) vs Included Studies (${prisma.distinctionSummary.studiesIncluded}) vs Current Disk PDFs (${prisma.distinctionSummary.currentDiskPdfCount}).`,
    `- Records Identified Total: ${prisma.totalRecordsIdentified}`,
    `- Duplicates Removed: ${prisma.duplicatesRemoved}`,
    `- Records Screened: ${prisma.recordsScreened ?? 'Unverified (Awaiting Historical Log)'}`,
    `- Records Excluded at Screening: ${prisma.recordsExcludedAtScreening ?? 'Unverified'}`,
    `- Reports Sought for Retrieval: ${prisma.reportsSoughtForRetrieval ?? 'Unverified'}`,
    `- Reports Not Retrieved: ${prisma.reportsNotRetrieved ?? 'Unverified'}`,
    `- Reports Assessed for Eligibility: ${prisma.reportsAssessedForEligibility ?? 'Unverified'}`,
    `- Reports Excluded at Eligibility: ${prisma.reportsExcludedAtEligibility ?? 'Unverified'}`,
    `- Studies Included: ${prisma.studiesIncluded}`,
    `- Reports of Included Studies: ${prisma.reportsOfIncludedStudies}`,
  ].join('\n');

  const screeningDiagnosticsReport = [
    `# 7. Screening Diagnostics & PRISMA Consistency Report`,
    `## Consistency Checks`,
    ...prisma.consistencyChecks.map(
      (c) => `- [${c.status.toUpperCase()}] ${c.equationLabel}: Expected=${c.expectedValue ?? 'N/A'}, Actual=${c.actualValue ?? 'N/A'} — ${c.explanation}`
    ),
    ``,
    `## Unverified Historical Gaps`,
    ...(prisma.unverifiedGaps.length > 0
      ? prisma.unverifiedGaps.map((g) => `- ${g}`)
      : ['- No unverified PRISMA historical gaps detected.']),
  ].join('\n');

  const recoveryAuditLogReport = [
    `# 8. Recovery Audit Log`,
    ...(auditLog.length > 0
      ? auditLog.map(
          (op) =>
            `- [${op.appliedAt}] ${op.reconciliationId} (Backup: ${op.backupId}) by ${op.appliedBy}: AutoMatches=${op.approvedMatchesApplied}, ManualMatches=${op.manualMatchesApplied}, PDFsLinked=${op.pdfLinksApplied}, FullTextReclassified=${op.fullTextReclassificationsApplied}, AbstractOnly=${op.abstractOnlyBefore}->${op.abstractOnlyAfter}${op.rolledBackAt ? ` [ROLLED BACK AT ${op.rolledBackAt}]` : ''}`
        )
      : ['- No reconciliation operations have been applied yet (preview/staging mode only).']),
  ].join('\n');

  const combinedMarkdown = [
    projectRecoveryReport,
    databaseProvenanceReport,
    duplicateResolutionReport,
    pdfReconciliationReport,
    abstractClassificationReport,
    updatedPrismaReport,
    screeningDiagnosticsReport,
    recoveryAuditLogReport,
  ].join('\n\n---\n\n');

  return {
    generatedAt,
    projectRecoveryReport,
    databaseProvenanceReport,
    duplicateResolutionReport,
    pdfReconciliationReport,
    abstractClassificationReport,
    updatedPrismaReport,
    screeningDiagnosticsReport,
    recoveryAuditLogReport,
    combinedMarkdown,
  };
}
