import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import { Article, ReviewProject } from '../src/types';
import { evaluateArticleClient, mergeScreeningInsightsIntoExtractedData } from '../src/services/apiService';
import {
  applyManualScreeningDecision,
  buildScreeningReproducibilityCsv,
  buildScreeningReproducibilityPdf,
  buildScreeningReproducibilityXlsxBlob,
  computeAuthoritativePrismaCounts,
  computeProtocolCriteriaDescriptor,
  executeDeterministicBatchScreening,
  investigateScreeningDiscrepancies,
  reconcileScreeningLedger,
} from '../src/utils/deterministicScreeningEngine';
import {
  getScreeningStateForFolder,
  reconcileServerScreening,
  runServerBatchScreening,
  saveServerManualScreeningDecision,
} from '../src/server/screeningRepositoryService';

function buildFixtureProject(projectId: string, articleCount = 256): ReviewProject {
  const articles: Article[] = [];
  for (let i = 0; i < articleCount; i++) {
    const padded = String(i + 1).padStart(3, '0');
    // Mix deterministic included (e.g., UAV landslide/agricultural monitoring in target region & year),
    // excluded-topic, excluded-year, and uncertain records to mirror real 256-record corpora.
    const bucket = i % 6;
    let title = '';
    let abstract = '';
    let year = 2023;
    let studyType = 'Original Research';

    if (bucket === 0) {
      title = `UAV Multispectral Remote Sensing for Early Crop Nitrogen Stress Mapping in Ethiopia (${padded})`;
      abstract = `We conducted an empirical unmanned aerial vehicle (UAV) multispectral field survey across Ethiopia with 4.2 cm GSD ground-truth SPAD validation, achieving R2 = 0.89 and end-to-end processing latency of 12 minutes.`;
      year = 2023;
    } else if (bucket === 1) {
      title = `High-Resolution Drone Photogrammetry and Random Forest Modeling of Landslide Susceptibility (${padded})`;
      abstract = `This study evaluates drone RGB and LiDAR imaging across slope transects in Ethiopia using cross-validation and measured turnaround latency for rapid hazard assessment.`;
      year = 2024;
    } else if (bucket === 2) {
      title = `Clinical Cardiac MRI Deep Learning Benchmark for Arrhythmia Classification (${padded})`;
      abstract = `A retrospective medical cardiology hospital dataset evaluating electrocardiogram and cardiac MRI segmentation performance in clinical patients.`;
      year = 2023;
    } else if (bucket === 3) {
      title = `Systematic Review and Meta-Analysis of Satellite Land Cover Classification (${padded})`;
      abstract = `A narrative literature review summarizing prior satellite remote sensing papers without new primary field experiments.`;
      year = 2022;
      studyType = 'Review Article';
    } else if (bucket === 4) {
      title = `Legacy Aerial Film Digitization Experiment in Northern Europe (${padded})`;
      abstract = `Historical aerial analog photography workflow evaluated in Germany prior to modern digital UAV sensors.`;
      year = 2012;
    } else {
      title = `Autonomous UAV Hyperspectral Calibration Preliminary Note (${padded})`;
      abstract = `Short communication describing sensor radiometric calibration setup for precision agriculture trials.`;
      year = 2023;
    }

    articles.push({
      id: `art-${padded}`,
      projectId,
      title,
      authors: [`Researcher ${padded} A.`, `Coauthor ${padded} B.`],
      year,
      journal: bucket === 2 ? 'Journal of Clinical Cardiology' : 'Remote Sensing of Environment',
      doi: `10.1000/rm.${padded}`,
      abstract,
      sourceDatabase: i % 2 === 0 ? 'Scopus' : 'Web of Science',
      extractedData: { studyType },
      decision: 'unscreened',
      screeningStage: 'title_abstract',
      evidenceCitations: [],
      isStarred: false,
      isDuplicate: false,
    });
  }

  return {
    id: projectId,
    title: 'UAV Remote Sensing & Landslide / Crop Nitrogen Mapping in Ethiopia',
    subtitle: 'Systematic Review Fixture',
    scope: 'UAV empirical sensing studies in Ethiopia',
    articleTypes: 'Original Research',
    uncertainCasesGuidance: 'Flag ambiguous studies for full-text review',
    booleanQuery: '("UAV" OR "drone") AND "Ethiopia"',
    protocolUpdatedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    discipline: 'Remote Sensing & Precision Agriculture',
    methodologyFocus: 'UAV / Drone Optical & Multispectral Field Studies',
    publicationYears: '2018-2026',
    geographicEligibility: 'Ethiopia & East Africa',
    geographicTargetScale: 'country',
    geographicSelections: {
      continent: 'Africa',
      country: 'Ethiopia',
    },
    picoc: {
      population: 'Agricultural plots and terrain sites monitored via UAV platforms',
      intervention: 'UAV multispectral, RGB, or LiDAR sensing with empirical validation',
      comparison: 'Ground-truth field measurements or baseline sensors',
      outcome: 'Mapping accuracy, R2/RMSE/AUC, and processing latency',
      context: 'Ethiopia & East Africa empirical studies (2018-2026)',
    },
    researchQuestions: [
      { code: 'RQ1', question: 'What UAV sensors and GSD settings are used?', mainEvidenceToCollect: 'Sensor specs & GSD' },
      { code: 'RQ2', question: 'What turnaround latency and validation metrics are reported?', mainEvidenceToCollect: 'Latency & accuracy metrics' },
    ],
    inclusionCriteria: [
      {
        id: 'crit-1',
        dimension: 'Platform & Field Focus',
        includeRule: 'UAV / drone multispectral or photogrammetry remote sensing study with field ground truth or validation',
        excludeRule: 'Clinical cardiology, hospital MRI, or systematic review / meta-analysis',
        category: 'inclusion',
      },
      {
        id: 'crit-2',
        dimension: 'Publication Window & Geography',
        includeRule: 'Published 2018-2026 within Ethiopia',
        excludeRule: 'Historical analog film digitization or Northern Europe',
        category: 'inclusion',
      },
    ],
    standardExclusionReasons: [
      'Not relevant to topic / wrong domain',
      'Not primary research (review/conference abstract/editorial)',
      'Outside publication year window',
      'Wrong study area / geographic scope mismatch',
    ],
    articles,
  };
}

function seedFolderOnDisk(folderPath: string, project: ReviewProject) {
  fs.mkdirSync(folderPath, { recursive: true });
  const { articles, ...meta } = project;
  fs.writeFileSync(path.join(folderPath, 'project.json'), JSON.stringify(meta, null, 2), 'utf-8');
  fs.writeFileSync(path.join(folderPath, 'articles.json'), JSON.stringify(articles, null, 2), 'utf-8');
  fs.writeFileSync(path.join(folderPath, 'workbench_state.json'), JSON.stringify({}, null, 2), 'utf-8');
}

async function runTests() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-det-screen-'));
  console.log('Running Deterministic Screening 10-Point Verification Suite...');

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Repeated Screening (256 records x 3 scans -> identical decisions)
    // -------------------------------------------------------------------------
    {
      const folder = path.join(tempRoot, 'test1');
      const project = buildFixtureProject('proj-test-1', 256);
      seedFolderOnDisk(folder, project);

      const r1 = await runServerBatchScreening({
        folderPath: folder,
        projectId: project.id,
        mode: 'incremental',
        batchSize: 64,
        evaluator: evaluateArticleClient,
        mergeInsights: mergeScreeningInsightsIntoExtractedData,
      });
      const r2 = await runServerBatchScreening({
        folderPath: folder,
        projectId: project.id,
        mode: 'incremental',
        batchSize: 64,
        evaluator: evaluateArticleClient,
        mergeInsights: mergeScreeningInsightsIntoExtractedData,
      });
      const r3 = await runServerBatchScreening({
        folderPath: folder,
        projectId: project.id,
        mode: 'rescreen',
        batchSize: 64,
        confirmReplaceDecisions: true,
        evaluator: evaluateArticleClient,
        mergeInsights: mergeScreeningInsightsIntoExtractedData,
      });

      assert.strictEqual(r1.articles.length, 256);
      assert.strictEqual(r2.runRecord.existingDecisionsReused, 256, 'Test 1: Scan 2 should reuse all 256 decisions');
      assert.strictEqual(r2.runRecord.newRecordsScreened, 0, 'Test 1: Scan 2 should screen 0 new records');
      assert.strictEqual(r1.consistencyReport.authoritativeCounts.includedStudies, r2.consistencyReport.authoritativeCounts.includedStudies);
      assert.strictEqual(r1.consistencyReport.authoritativeCounts.includedStudies, r3.consistencyReport.authoritativeCounts.includedStudies);
      assert.strictEqual(r1.consistencyReport.authoritativeCounts.excludedAtFullText, r3.consistencyReport.authoritativeCounts.excludedAtFullText);

      for (let i = 0; i < r1.articles.length; i++) {
        assert.strictEqual(r1.articles[i].decision, r2.articles[i].decision, `Test 1: Scan 2 mismatch at ${r1.articles[i].id}`);
        assert.strictEqual(r1.articles[i].decision, r3.articles[i].decision, `Test 1: Scan 3 mismatch at ${r1.articles[i].id}`);
        assert.strictEqual(r1.articles[i].decisionFingerprint, r2.articles[i].decisionFingerprint);
        assert.strictEqual(r1.articles[i].decisionFingerprint, r3.articles[i].decisionFingerprint);
      }
      assert.strictEqual(r3.consistencyReport.consistencyStatus, 'Consistent');
      console.log(`  ✓ Test 1 Passed: 256 records x 3 runs identical (Included: ${r1.consistencyReport.authoritativeCounts.includedStudies}, Excluded: ${r1.consistencyReport.authoritativeCounts.excludedAtFullText}, Uncertain: ${r1.consistencyReport.authoritativeCounts.uncertainRecords})`);
    }

    // -------------------------------------------------------------------------
    // TEST 2: Batch-Size & Input-Order Independence (1x256 vs 4x64 vs 8x32)
    // -------------------------------------------------------------------------
    {
      const baseProj = buildFixtureProject('proj-test-2', 256);
      const reversedArticles = [...baseProj.articles].reverse();

      const res256 = await executeDeterministicBatchScreening({
        articles: baseProj.articles,
        project: baseProj,
        mode: 'incremental',
        batchSize: 256,
        evaluator: evaluateArticleClient,
        mergeInsights: mergeScreeningInsightsIntoExtractedData,
      });
      const res64 = await executeDeterministicBatchScreening({
        articles: reversedArticles,
        project: baseProj,
        mode: 'incremental',
        batchSize: 64,
        evaluator: evaluateArticleClient,
        mergeInsights: mergeScreeningInsightsIntoExtractedData,
      });
      const res32 = await executeDeterministicBatchScreening({
        articles: [...baseProj.articles.slice(128), ...baseProj.articles.slice(0, 128)],
        project: baseProj,
        mode: 'incremental',
        batchSize: 32,
        evaluator: evaluateArticleClient,
        mergeInsights: mergeScreeningInsightsIntoExtractedData,
      });

      assert.strictEqual(res256.runRecord.includedCount, res64.runRecord.includedCount);
      assert.strictEqual(res256.runRecord.includedCount, res32.runRecord.includedCount);
      assert.strictEqual(res256.runRecord.excludedCount, res64.runRecord.excludedCount);
      assert.strictEqual(res256.runRecord.excludedCount, res32.runRecord.excludedCount);

      for (let i = 0; i < res256.updatedArticles.length; i++) {
        assert.strictEqual(res256.updatedArticles[i].id, res64.updatedArticles[i].id, 'Deterministic sort order mismatch');
        assert.strictEqual(res256.updatedArticles[i].decision, res64.updatedArticles[i].decision);
        assert.strictEqual(res256.updatedArticles[i].decision, res32.updatedArticles[i].decision);
        assert.strictEqual(res256.updatedArticles[i].decisionFingerprint, res32.updatedArticles[i].decisionFingerprint);
      }
      console.log('  ✓ Test 2 Passed: Batch sizes (256 / 64 / 32) and shuffled input ordering yield 100% identical outputs');
    }

    // -------------------------------------------------------------------------
    // TEST 3: Duplicate Batch Submission Protection
    // -------------------------------------------------------------------------
    {
      const folder = path.join(tempRoot, 'test3');
      const project = buildFixtureProject('proj-test-3', 40);
      // Add 4 flagged duplicates (including two that erroneously started as 'include' or 'unscreened')
      for (let d = 0; d < 4; d++) {
        project.articles.push({
          ...project.articles[d],
          id: `dup-00${d + 1}`,
          isDuplicate: true,
          duplicateOfId: project.articles[d].id,
          decision: d < 2 ? 'include' : 'unscreened',
        });
      }
      seedFolderOnDisk(folder, project);

      const runA = await runServerBatchScreening({
        folderPath: folder,
        projectId: project.id,
        mode: 'incremental',
        batchSize: 32,
        evaluator: evaluateArticleClient,
        mergeInsights: mergeScreeningInsightsIntoExtractedData,
      });
      const runB = await runServerBatchScreening({
        folderPath: folder,
        projectId: project.id,
        mode: 'incremental',
        batchSize: 32,
        evaluator: evaluateArticleClient,
        mergeInsights: mergeScreeningInsightsIntoExtractedData,
      });

      const ledgerIds = runB.ledger.map((l) => l.record_id);
      assert.strictEqual(new Set(ledgerIds).size, ledgerIds.length, 'Test 3: Ledger must have unique record_id entries');
      assert.strictEqual(runB.consistencyReport.authoritativeCounts.totalRecords, 44);
      assert.strictEqual(runB.consistencyReport.authoritativeCounts.duplicatesExcluded, 4);
      assert.strictEqual(runB.consistencyReport.authoritativeCounts.uniqueRecords, 40);
      assert.strictEqual(runA.consistencyReport.authoritativeCounts.includedStudies, runB.consistencyReport.authoritativeCounts.includedStudies);
      assert.ok(runB.consistencyReport.authoritativeCounts.prismaEquationsValid, 'Test 3: PRISMA equations must pass');
      console.log('  ✓ Test 3 Passed: Duplicate batch submissions create 0 duplicate ledger rows & exclude duplicates from counts');
    }

    // -------------------------------------------------------------------------
    // TEST 4: Incremental Screening (256 existing + 10 new records)
    // -------------------------------------------------------------------------
    {
      const folder = path.join(tempRoot, 'test4');
      const project = buildFixtureProject('proj-test-4', 256);
      seedFolderOnDisk(folder, project);

      const firstRun = await runServerBatchScreening({
        folderPath: folder,
        projectId: project.id,
        mode: 'incremental',
        evaluator: evaluateArticleClient,
        mergeInsights: mergeScreeningInsightsIntoExtractedData,
      });

      // Append 10 new unscreened records to articles.json
      const extraProj = buildFixtureProject('proj-test-4', 10);
      const tenNew: Article[] = extraProj.articles.map((a, idx) => ({
        ...a,
        id: `art-new-${String(idx + 1).padStart(2, '0')}`,
      }));
      const combinedArticles = [...firstRun.articles, ...tenNew];
      fs.writeFileSync(path.join(folder, 'articles.json'), JSON.stringify(combinedArticles, null, 2), 'utf-8');

      const incRun = await runServerBatchScreening({
        folderPath: folder,
        projectId: project.id,
        mode: 'incremental',
        evaluator: evaluateArticleClient,
        mergeInsights: mergeScreeningInsightsIntoExtractedData,
      });

      assert.strictEqual(incRun.articles.length, 266);
      assert.strictEqual(incRun.runRecord.existingDecisionsReused, 256, 'Test 4: Must reuse all 256 prior decisions');
      assert.strictEqual(incRun.runRecord.newRecordsScreened, 10, 'Test 4: Must screen only 10 new records');

      const firstById = new Map(firstRun.articles.map((a) => [a.id, a]));
      for (const art of incRun.articles) {
        const orig = firstById.get(art.id);
        if (orig) {
          assert.strictEqual(art.decision, orig.decision, `Test 4: Existing decision altered for ${art.id}`);
          assert.strictEqual(art.decisionFingerprint, orig.decisionFingerprint);
        } else {
          assert.notStrictEqual(art.decision, 'unscreened', `Test 4: New record ${art.id} must be screened`);
        }
      }
      console.log('  ✓ Test 4 Passed: Incremental screening reused 256/256 existing decisions and evaluated 10/10 new records');
    }

    // -------------------------------------------------------------------------
    // TEST 5: Manual Decision Preservation (Human Precedence across Mode A & B)
    // -------------------------------------------------------------------------
    {
      const folder = path.join(tempRoot, 'test5');
      const project = buildFixtureProject('proj-test-5', 24);
      seedFolderOnDisk(folder, project);

      await runServerBatchScreening({
        folderPath: folder,
        projectId: project.id,
        mode: 'incremental',
        evaluator: evaluateArticleClient,
        mergeInsights: mergeScreeningInsightsIntoExtractedData,
      });

      // Override an excluded cardiology paper manually to 'include' with custom note
      const targetId = 'art-003'; // clinical cardiology (AI excludes it)
      const manualRes = await saveServerManualScreeningDecision({
        folderPath: folder,
        projectId: project.id,
        articleId: targetId,
        decision: 'include',
        screeningStage: 'final_included',
        reviewerNotes: 'Manual committee inclusion exception',
      });
      assert.strictEqual(manualRes.article?.decision, 'include');
      assert.strictEqual(manualRes.article?.manualOverride, true);
      assert.ok((manualRes.article?.decisionHistory?.length || 0) >= 1);

      // Run Mode A and confirmed Mode B re-screen — manual override must NEVER be overwritten
      await runServerBatchScreening({
        folderPath: folder,
        projectId: project.id,
        mode: 'incremental',
        evaluator: evaluateArticleClient,
        mergeInsights: mergeScreeningInsightsIntoExtractedData,
      });
      const rescreenRes = await runServerBatchScreening({
        folderPath: folder,
        projectId: project.id,
        mode: 'rescreen',
        confirmReplaceDecisions: true,
        evaluator: evaluateArticleClient,
        mergeInsights: mergeScreeningInsightsIntoExtractedData,
      });

      const preserved = rescreenRes.articles.find((a) => a.id === targetId);
      assert.strictEqual(preserved?.decision, 'include', 'Test 5: Manual decision overwritten during Mode B rescreen!');
      assert.strictEqual(preserved?.manualOverride, true);
      assert.ok(rescreenRes.runRecord.manualOverridesPreserved >= 1);
      console.log('  ✓ Test 5 Passed: Manual reviewer overrides preserved with human precedence across Mode A & Mode B batches');
    }

    // -------------------------------------------------------------------------
    // TEST 6: Protocol Modification (Confirmation Gate + Diff Tracking + Audit History)
    // -------------------------------------------------------------------------
    {
      const folder = path.join(tempRoot, 'test6');
      const project = buildFixtureProject('proj-test-6', 30);
      seedFolderOnDisk(folder, project);

      const runBefore = await runServerBatchScreening({
        folderPath: folder,
        projectId: project.id,
        mode: 'incremental',
        evaluator: evaluateArticleClient,
        mergeInsights: mergeScreeningInsightsIntoExtractedData,
      });

      // Modify protocol: tighten publication window so 2022/2023 papers change eligibility
      const updatedProject: ReviewProject = {
        ...project,
        publicationYears: '2024-2026',
        updatedAt: '2026-02-01T00:00:00.000Z',
      };
      const { articles: _, ...metaOnly } = updatedProject;
      fs.writeFileSync(path.join(folder, 'project.json'), JSON.stringify(metaOnly, null, 2), 'utf-8');

      const descBefore = computeProtocolCriteriaDescriptor(project);
      const descAfter = computeProtocolCriteriaDescriptor(updatedProject);
      assert.notStrictEqual(descBefore.criteriaHash, descAfter.criteriaHash, 'Test 6: Criteria hash must change on protocol edit');

      // Mode B WITHOUT confirmation must NOT overwrite finalized records and MUST propose re-evaluations
      const previewRes = await runServerBatchScreening({
        folderPath: folder,
        projectId: project.id,
        mode: 'rescreen',
        confirmReplaceDecisions: false,
        evaluator: evaluateArticleClient,
        mergeInsights: mergeScreeningInsightsIntoExtractedData,
      });
      assert.strictEqual(previewRes.requiresConfirmation, true, 'Test 6: Mode B must require explicit confirmation');
      assert.ok(previewRes.proposedReevaluations.length > 0, 'Test 6: Must surface proposed re-evaluation diff list');
      assert.strictEqual(
        previewRes.consistencyReport.authoritativeCounts.includedStudies,
        runBefore.consistencyReport.authoritativeCounts.includedStudies,
        'Test 6: Finalized included count must not mutate prior to confirmation'
      );

      // Mode B WITH explicit confirmation updates modified records and retains history
      const confirmedRes = await runServerBatchScreening({
        folderPath: folder,
        projectId: project.id,
        mode: 'rescreen',
        confirmReplaceDecisions: true,
        evaluator: evaluateArticleClient,
        mergeInsights: mergeScreeningInsightsIntoExtractedData,
      });
      assert.strictEqual(confirmedRes.requiresConfirmation, false);
      assert.ok(confirmedRes.runRecord.modifiedRecordsRescreened > 0);
      assert.ok(
        confirmedRes.consistencyReport.authoritativeCounts.includedStudies < runBefore.consistencyReport.authoritativeCounts.includedStudies,
        'Test 6: Tightening publicationYears to 2024-2026 should reduce included studies'
      );
      const changedRec = confirmedRes.articles.find(
        (a) => a.previousDecision && a.previousDecision !== a.decision
      );
      assert.ok(changedRec, 'Test 6: Previous decision must be preserved on changed record');
      assert.ok((changedRec?.decisionHistory?.length || 0) >= 2, 'Test 6: Audit history must log both runs');
      console.log('  ✓ Test 6 Passed: Protocol modification detected by SHA-256 hash, gated confirmation before overwrite, and logged decision history');
    }

    // -------------------------------------------------------------------------
    // TEST 7: PRISMA 2020 Synchronization (All 5 Equations Valid + Multi-Stage Check)
    // -------------------------------------------------------------------------
    {
      const project = buildFixtureProject('proj-test-7', 36);
      const det = await executeDeterministicBatchScreening({
        articles: project.articles,
        project,
        mode: 'incremental',
        targetStage: 'full_text',
        evaluator: evaluateArticleClient,
        mergeInsights: mergeScreeningInsightsIntoExtractedData,
      });
      // Simulate realistic mix: 2 title_abstract exclusions, 2 duplicates, 1 manual override
      const patchedArticles = det.updatedArticles.map((art, idx) => {
        if (idx === 2) {
          return applyManualScreeningDecision(art, project, {
            decision: 'exclude',
            screeningStage: 'title_abstract',
            reason: 'Wrong domain at title screening',
          });
        }
        if (idx === 8) {
          return applyManualScreeningDecision(art, project, {
            decision: 'exclude',
            screeningStage: 'title_abstract',
            reason: 'Wrong domain at title screening',
          });
        }
        if (idx === 15) {
          return { ...art, isDuplicate: true, decision: 'exclude' as const, screeningStage: 'excluded' as const };
        }
        return art;
      });
      const syncedProj: ReviewProject = { ...project, articles: patchedArticles };
      const counts = computeAuthoritativePrismaCounts(syncedProj, [det.runRecord]);
      const report = investigateScreeningDiscrepancies(syncedProj, [det.runRecord]);

      assert.strictEqual(counts.totalRecords, 36);
      assert.strictEqual(counts.duplicatesExcluded, 1);
      assert.strictEqual(counts.uniqueRecords, 35);
      assert.strictEqual(counts.excludedAtTitleAbstract, 2);
      assert.strictEqual(counts.prismaEquationsValid, true, 'Test 7: All 5 PRISMA equations must pass');
      assert.ok(report.moduleSyncStatus.length === 12, 'Test 7: All 12 modules tracked in sync status');
      assert.ok(report.moduleSyncStatus.every((m) => m.synced), 'Test 7: Every module must be synced');
      console.log('  ✓ Test 7 Passed: PRISMA 2020 equations (5/5) & 12-module synchronization validated');
    }

    // -------------------------------------------------------------------------
    // TEST 8: Discrepancy Investigation (37 / 49 / 45 Scenario + Reconciliation + Exports)
    // -------------------------------------------------------------------------
    {
      const folder = path.join(tempRoot, 'test8');
      const project = buildFixtureProject('proj-test-8', 60);
      // Craft exact discrepancies:
      // - 45 included non-duplicate records
      // - 10 excluded records (2 accidentally carrying stage='final_included')
      // - 2 duplicate records accidentally marked 'include'
      // - 3 unscreened pending records
      // - Stale lastStats showing included: 49 & historical run showing 37
      project.articles = project.articles.map((art, idx) => {
        if (idx < 45) {
          return {
            ...art,
            decision: 'include',
            screeningStage: idx === 0 ? 'title_abstract' : 'final_included', // idx 0 has stage mismatch!
          };
        }
        if (idx < 55) {
          return {
            ...art,
            decision: 'exclude',
            screeningStage: idx === 46 ? 'final_included' : 'excluded', // idx 46 has incompatible stage!
            decisionReason: 'Excluded criteria test',
          };
        }
        if (idx < 57) {
          return {
            ...art,
            isDuplicate: true,
            decision: 'include', // duplicate wrongly marked include!
            screeningStage: 'final_included',
          };
        }
        return {
          ...art,
          decision: 'unscreened',
          screeningStage: 'title_abstract',
        };
      });

      const oldRun: any = {
        runId: 'run_old_37',
        timestamp: '2026-01-10T10:00:00.000Z',
        mode: 'incremental',
        status: 'completed',
        protocolId: 'proto',
        protocolVersion: 'v1.0',
        criteriaHash: 'hashA',
        datasetVersion: 'ds1',
        modelConfig: { modelIdentifier: 'deterministic', promptVersion: 'p1', seed: 42, deterministicCacheEnabled: true },
        totalRecordsProcessed: 60,
        newRecordsScreened: 60,
        existingDecisionsReused: 0,
        modifiedRecordsRescreened: 0,
        manualOverridesPreserved: 0,
        includedCount: 37,
        excludedCount: 23,
        uncertainCount: 0,
        pendingCount: 0,
        failedCount: 0,
        elapsedSeconds: 0.2,
      };
      const newRun: any = { ...oldRun, runId: 'run_drift_49', timestamp: '2026-01-11T10:00:00.000Z', includedCount: 49, excludedCount: 11 };

      seedFolderOnDisk(folder, project);
      fs.writeFileSync(
        path.join(folder, 'workbench_state.json'),
        JSON.stringify({
          batchScreener: {
            lastStats: {
              runId: 'run_drift_49',
              completedAt: '2026-01-11T10:00:00.000Z',
              mode: 'benchmark',
              processed: 60,
              total: 60,
              included: 49,
              excluded: 11,
              uncertain: 0,
              speed: 300,
              elapsedSeconds: 0.2,
            },
            runs: [newRun, oldRun],
          },
        }, null, 2),
        'utf-8'
      );
      fs.mkdirSync(path.join(folder, 'screening'), { recursive: true });
      fs.writeFileSync(path.join(folder, 'screening', 'screening_runs.json'), JSON.stringify([newRun, oldRun], null, 2), 'utf-8');

      const stateBefore = getScreeningStateForFolder(folder, project.id);
      assert.strictEqual(stateBefore.consistencyReport.consistencyStatus, 'Inconsistent', 'Test 8: Drift scenario must flag Inconsistent');
      assert.strictEqual(stateBefore.consistencyReport.authoritativeCounts.includedStudies, 45, 'Test 8: Authoritative PRISMA count must exclude 2 duplicates = 45');
      assert.ok(stateBefore.consistencyReport.discrepancies.some((d) => d.discrepancy_code === 'duplicate_record_counted'));
      assert.ok(stateBefore.consistencyReport.discrepancies.some((d) => d.discrepancy_code === 'mixed_screening_stage'));
      assert.ok(stateBefore.consistencyReport.discrepancies.some((d) => d.discrepancy_code === 'unscreened_pending_record'));

      // Reconcile server ledger safely (creates backup + normalizes stages & duplicates + syncs lastStats = 45)
      const recRes = await reconcileServerScreening({
        folderPath: folder,
        projectId: project.id,
      });
      assert.ok(recRes.fixedCount >= 4, 'Test 8: Reconcile must fix duplicates, stages, and legacy fingerprints');
      assert.strictEqual(recRes.workbenchState.batchScreener?.lastStats?.included, 45, 'Test 8: Batch summary synced to 45');
      assert.ok(!recRes.articles.some((a) => a.isDuplicate && a.decision !== 'exclude'), 'Test 8: Duplicates normalized to exclude');
      assert.ok(fs.existsSync(path.join(folder, 'backups')), 'Test 8: Pre-migration backup folder must exist');

      // Validate Report Exports (CSV, Excel .xlsx, PDF)
      const csv = buildScreeningReproducibilityCsv(project, stateBefore.consistencyReport, stateBefore.runs);
      assert.ok(csv.includes('DISCREPANCY INVESTIGATION') && csv.includes('run_drift_49'));

      const xlsxBlob = await buildScreeningReproducibilityXlsxBlob(project, stateBefore.consistencyReport, stateBefore.runs);
      const xlsxBuf = Buffer.from(await xlsxBlob.arrayBuffer());
      assert.strictEqual(xlsxBuf[0], 0x50); // 'P'
      assert.strictEqual(xlsxBuf[1], 0x4b); // 'K'
      const zip = await JSZip.loadAsync(xlsxBuf);
      assert.ok(zip.file('xl/worksheets/sheet1.xml') && zip.file('xl/worksheets/sheet3.xml') && zip.file('xl/worksheets/sheet4.xml'));

      const pdfDoc = buildScreeningReproducibilityPdf(project, stateBefore.consistencyReport, stateBefore.runs);
      const pdfBytes = Buffer.from(pdfDoc.output('arraybuffer'));
      assert.ok(pdfBytes.toString('latin1', 0, 5).startsWith('%PDF-'), 'Test 8: Must generate valid PDF');
      console.log('  ✓ Test 8 Passed: Diagnosed 37/49/45 discrepancy causes, reconciled safely with backup, and verified CSV/XLSX/PDF exports');
    }

    // -------------------------------------------------------------------------
    // TEST 9: Database Recovery (Interrupted Batch Resume)
    // -------------------------------------------------------------------------
    {
      const folder = path.join(tempRoot, 'test9');
      const project = buildFixtureProject('proj-test-9', 100);
      seedFolderOnDisk(folder, project);

      const interrupted = await runServerBatchScreening({
        folderPath: folder,
        projectId: project.id,
        mode: 'incremental',
        batchSize: 32,
        simulateInterruptAfter: 40,
        evaluator: evaluateArticleClient,
        mergeInsights: mergeScreeningInsightsIntoExtractedData,
      });

      assert.strictEqual(interrupted.runRecord.status, 'interrupted');
      const midState = getScreeningStateForFolder(folder, project.id);
      assert.ok(midState.interruptedCheckpoint !== null, 'Test 9: Checkpoint must be persisted on interruption');
      assert.strictEqual(midState.interruptedCheckpoint?.processedIds.length, 40);

      // Resume via Mode A
      const resumed = await runServerBatchScreening({
        folderPath: folder,
        projectId: project.id,
        mode: 'incremental',
        batchSize: 32,
        evaluator: evaluateArticleClient,
        mergeInsights: mergeScreeningInsightsIntoExtractedData,
      });
      assert.strictEqual(resumed.runRecord.status, 'completed');
      assert.strictEqual(resumed.runRecord.existingDecisionsReused, 40, 'Test 9: Must reuse 40 checkpointed records');
      assert.strictEqual(resumed.runRecord.newRecordsScreened, 60, 'Test 9: Must evaluate remaining 60 records');
      assert.strictEqual(resumed.ledger.length, 100, 'Test 9: Ledger must contain exact 100 unique records');
      assert.strictEqual(resumed.consistencyReport.authoritativeCounts.pendingRecords, 0);

      // Compare against clean uninterrupted run on identical 100 records
      const cleanFolder = path.join(tempRoot, 'test9-clean');
      seedFolderOnDisk(cleanFolder, buildFixtureProject('proj-test-9-clean', 100));
      const clean = await runServerBatchScreening({
        folderPath: cleanFolder,
        projectId: 'proj-test-9-clean',
        mode: 'incremental',
        batchSize: 32,
        evaluator: evaluateArticleClient,
        mergeInsights: mergeScreeningInsightsIntoExtractedData,
      });
      for (let i = 0; i < 100; i++) {
        assert.strictEqual(resumed.articles[i].decision, clean.articles[i].decision, `Test 9: Resumed decision mismatch at ${i}`);
      }
      console.log('  ✓ Test 9 Passed: Interrupted batch (40/100) resumed via Mode A cleanly with 0 duplicates and identical final decisions');
    }

    // -------------------------------------------------------------------------
    // TEST 10: Concurrent Execution Safety (Mutex Serialization)
    // -------------------------------------------------------------------------
    {
      const folder = path.join(tempRoot, 'test10');
      const project = buildFixtureProject('proj-test-10', 80);
      seedFolderOnDisk(folder, project);

      const results = await Promise.all([
        runServerBatchScreening({
          folderPath: folder,
          projectId: project.id,
          mode: 'incremental',
          batchSize: 32,
          evaluator: evaluateArticleClient,
          mergeInsights: mergeScreeningInsightsIntoExtractedData,
        }),
        runServerBatchScreening({
          folderPath: folder,
          projectId: project.id,
          mode: 'incremental',
          batchSize: 64,
          evaluator: evaluateArticleClient,
          mergeInsights: mergeScreeningInsightsIntoExtractedData,
        }),
        saveServerManualScreeningDecision({
          folderPath: folder,
          projectId: project.id,
          articleId: 'art-003',
          decision: 'include',
          screeningStage: 'final_included',
          reviewerNotes: 'Concurrent human override',
        }),
      ]);

      const finalState = getScreeningStateForFolder(folder, project.id);
      assert.strictEqual(finalState.ledger.length, 80, 'Test 10: Ledger must have exactly 80 records (no corruption or duplicates)');
      assert.strictEqual(new Set(finalState.ledger.map((l) => l.record_id)).size, 80);
      const art3 = finalState.ledger.find((l) => l.record_id === 'art-003');
      assert.strictEqual(art3?.decision, 'include', 'Test 10: Manual decision saved under concurrent execution');
      assert.strictEqual(art3?.manual_override, true);
      assert.ok(results[0].runs.length >= 1 && finalState.runs.length >= 2);
      assert.ok(finalState.consistencyReport.authoritativeCounts.prismaEquationsValid);
      console.log('  ✓ Test 10 Passed: Concurrent overlapping batch runs + manual override serialized safely with 0 race corruption');
    }

    console.log('\nALL 10 DETERMINISTIC SCREENING & PRISMA 2020 ACCEPTANCE TESTS PASSED (10/10)');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
