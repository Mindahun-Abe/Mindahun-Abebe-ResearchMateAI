import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  mergeProjectsPreservingData,
  clearProjectDeletionTombstones,
} from '../src/utils/syncEngine';
import { computeAuthoritativePrismaCounts } from '../src/utils/deterministicScreeningEngine';
import { Article, OnlineSearchSession, ReviewProject } from '../src/types';

const BASE_URL = 'http://localhost:3000';

function makeTestArticle(id: string, projectId: string, overrides: Partial<Article> = {}): Article {
  return {
    id,
    projectId,
    title: `Soil Erosion Empirical Study ${id}`,
    authors: ['Tesfaye, A.', 'Kassa, B.'],
    year: 2024,
    journal: 'Catena',
    abstract: `Detailed empirical abstract for record ${id} covering gully susceptibility.`,
    sourceDatabase: 'Manual',
    screeningStage: 'title_abstract',
    decision: 'unscreened',
    evidenceCitations: [],
    ...overrides,
  };
}

async function fetchTestProject(projectId: string): Promise<ReviewProject> {
  const res = await fetch(`${BASE_URL}/api/projects`);
  assert.strictEqual(res.ok, true, `GET /api/projects failed: ${res.status}`);
  const data = await res.json();
  const found = (data.projects || []).find((p: ReviewProject) => p.id === projectId);
  assert.ok(found, `Project ${projectId} not found in /api/projects`);
  return found;
}

async function main() {
  const testProjId = `test-del-ret-${Date.now()}`;
  const createdFolderName = `test_del_ret_${Date.now()}`;
  let createdProject: ReviewProject | null = null;

  try {
    console.log('\n=== Running Permanent Deletion, Zero Resurrection & 4-Workflow Retrieval Specs ===');

    // 0. Create isolated temporary project folder on disk via API
    const createRes = await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: {
          id: testProjId,
          title: `Test Deletion & Retrieval Spec ${Date.now()}`,
          databaseFolderName: createdFolderName,
          description: 'Automated test folder (cleaned up in finally)',
          reviewType: 'systematic',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          articles: [],
          inclusionCriteria: [],
          exclusionCriteria: [],
        },
      }),
    });
    assert.strictEqual(createRes.ok, true, `Failed to create temp project: ${createRes.status}`);
    const createJson = await createRes.json();
    createdProject = createJson.project;
    assert.strictEqual(createdProject?.id, testProjId);
    console.log('  [PASS] 0. Created isolated temp review folder');

    // 1. Bulk Add 263 + 17 = 280 articles via chunks (no 256 cap)
    const batch1: Article[] = Array.from({ length: 263 }, (_, i) =>
      makeTestArticle(`art-bulk-${i + 1}`, testProjId, {
        intakeSource: 'bulk_importer',
        sourceFileName: `paper_${i + 1}.pdf`,
        original_filename: `paper_${i + 1}.pdf`,
      })
    );
    const batch2: Article[] = Array.from({ length: 17 }, (_, i) =>
      makeTestArticle(`art-bulk-${264 + i}`, testProjId, {
        intakeSource: 'bulk_importer',
        sourceFileName: `paper_${264 + i}.pdf`,
        original_filename: `paper_${264 + i}.pdf`,
      })
    );

    const chunk1Res = await fetch(`${BASE_URL}/api/projects/${testProjId}/articles/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articles: batch1 }),
    });
    assert.strictEqual(chunk1Res.ok, true);

    const chunk2Res = await fetch(`${BASE_URL}/api/projects/${testProjId}/articles/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articles: batch2 }),
    });
    assert.strictEqual(chunk2Res.ok, true);

    const afterAddProj = await fetchTestProject(testProjId);
    assert.strictEqual(afterAddProj.articles.length, 280, 'Expected 263 + 17 = 280 articles saved');
    console.log('  [PASS] 1. Unlimited multi-folder bulk import persisted 280 articles (no 256 limit)');

    // 2. Delete 256 bulk files permanently -> verify remaining = 24 and zero resurrection on sync merge
    const idsToDelete = batch1.slice(0, 256).map((a) => a.id);
    const del256Res = await fetch(`${BASE_URL}/api/projects/${testProjId}/articles/bulk-remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleIds: idsToDelete, mode: 'ids' }),
    });
    assert.strictEqual(del256Res.ok, true);
    const del256Json = await del256Res.json();
    assert.strictEqual(del256Json.removedCount, 256);
    assert.strictEqual(del256Json.remainingCount, 24);
    assert.strictEqual(del256Json.deletedOnlineCount, 0, 'Deleted online archive must remain 0 (eliminated)');

    // Verify GET reflects 24 after refresh
    const afterDelProj = await fetchTestProject(testProjId);
    assert.strictEqual(afterDelProj.articles.length, 24, 'Disk persistence after deleting 256 must be 24');

    // Verify syncEngine.mergeProjectsPreservingData NEVER resurrects the 256 deleted articles from stale local or cloud snapshots!
    const staleSnapshot280: ReviewProject = {
      ...afterAddProj,
      updatedAt: new Date(Date.now() + 60_000).toISOString(), // Even if stale client timestamp is newer!
      articles: [...batch1, ...batch2],
    };
    const mergedAfter256Del = mergeProjectsPreservingData(
      [afterDelProj],
      [staleSnapshot280],
      [staleSnapshot280]
    );
    assert.strictEqual(mergedAfter256Del.length, 1);
    assert.strictEqual(
      mergedAfter256Del[0].articles.length,
      24,
      `Stale cache/cloud must NEVER resurrect deleted 256 bulk files (got ${mergedAfter256Del[0].articles.length})`
    );
    console.log('  [PASS] 2. Deleted 256 bulk articles stay permanently deleted across refresh & stale cloud/local cache');

    // 3. Clear remaining articles (mode: 'all') + verify deleted-online-articles endpoints eliminated
    const clearRes = await fetch(`${BASE_URL}/api/projects/${testProjId}/articles/bulk-remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'all' }),
    });
    assert.strictEqual(clearRes.ok, true);
    const clearJson = await clearRes.json();
    assert.strictEqual(clearJson.remainingCount, 0);

    const afterClearProj = await fetchTestProject(testProjId);
    assert.strictEqual(afterClearProj.articles.length, 0);

    const mergedAfterClear = mergeProjectsPreservingData(
      [afterClearProj],
      [staleSnapshot280],
      [staleSnapshot280]
    );
    assert.strictEqual(mergedAfterClear[0].articles.length, 0, 'Cleared 256+ folder must stay 0 on refresh');

    const delOnlineGet = await fetch(`${BASE_URL}/api/projects/${testProjId}/deleted-online-articles`);
    const delOnlineJson = await delOnlineGet.json();
    assert.strictEqual(delOnlineJson.count, 0);
    assert.deepStrictEqual(delOnlineJson.items, []);

    const restoreAttempt = await fetch(`${BASE_URL}/api/projects/${testProjId}/deleted-online-articles/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archiveIds: ['any'], restoreMode: 'unscreened' }),
    });
    assert.strictEqual(restoreAttempt.status, 410, 'Restore endpoint must return 410 Gone');
    console.log('  [PASS] 3. Clear all (0 remaining) & eliminated deleted-online restore endpoints (410 Gone)');

    // 4. Seed active intake channels & test Workflow 2 + Workflow 3 Stage A Canonical Dedup + Stage B PRISMA
    const existingSeed: Article[] = [
      makeTestArticle('art-manual-1', testProjId, { intakeSource: 'manual_blank', sourceDatabase: 'Manual' }),
      makeTestArticle('art-manual-2', testProjId, { intakeSource: 'manual_blank', sourceDatabase: 'Manual' }),
      makeTestArticle('art-bulk-keep-1', testProjId, {
        intakeSource: 'bulk_importer',
        sourceFileName: 'existing_study.pdf',
        doi: '10.1000/existing-gully-1',
        sourceDatabase: 'Scopus',
      }),
    ];
    await fetch(`${BASE_URL}/api/projects/${testProjId}/articles`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articles: existingSeed }),
    });

    const sessionPayload: OnlineSearchSession = {
      id: 'sess-spec-1',
      database: 'all',
      databaseLabel: 'All Online DBs',
      query: 'gully erosion susceptibility',
      searchBy: 'keywords',
      externalReportedCount: 450,
      actuallyRetrievedCount: 4,
      withinSessionUniqueCount: 2,
      withinSessionDuplicateCount: 2,
      successfullySavedCount: 0,
      existingLibraryMatchedCount: 0,
      duplicateEventsRemovedCount: 0,
      hasMore: false,
      nextOffset: 4,
      retrievedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      importEvents: [],
    };
    const saveSessRes = await fetch(`${BASE_URL}/api/projects/${testProjId}/online-search-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: sessionPayload }),
    });
    assert.strictEqual(saveSessRes.ok, true);

    // Import 4 retrieved hits: 3 copies of 1 new study across Crossref, OpenAlex, Semantic Scholar + 1 matching existing Scopus study
    const retrievedHits: Partial<Article>[] = [
      {
        id: 'cr-hit-1',
        title: 'Multi-Source Deep Learning for Gully Erosion Mapping',
        authors: ['Alem, T.'],
        year: 2025,
        journal: 'Geomorphology',
        doi: '10.1000/new-multi-db-paper',
        abstract: 'New study retrieved from Crossref.',
        sourceDatabase: 'Crossref',
      },
      {
        id: 'oa-hit-1',
        title: 'Multi-Source Deep Learning for Gully Erosion Mapping',
        authors: ['Alem, T.'],
        year: 2025,
        journal: 'Geomorphology',
        doi: '10.1000/new-multi-db-paper',
        abstract: 'New study retrieved from OpenAlex.',
        sourceDatabase: 'OpenAlex',
      },
      {
        id: 's2-hit-1',
        title: 'Multi-Source Deep Learning for Gully Erosion Mapping',
        authors: ['Alem, T.'],
        year: 2025,
        journal: 'Geomorphology',
        doi: '10.1000/new-multi-db-paper',
        abstract: 'New study retrieved from Semantic Scholar.',
        sourceDatabase: 'Semantic Scholar',
      },
      {
        id: 'cr-existing-1',
        title: 'Soil Erosion Empirical Study art-bulk-keep-1',
        authors: ['Tesfaye, A.'],
        year: 2024,
        journal: 'Catena',
        doi: '10.1000/existing-gully-1',
        abstract: 'Already in library.',
        sourceDatabase: 'Crossref',
      },
    ];

    const importRes = await fetch(`${BASE_URL}/api/projects/${testProjId}/articles/import-retrieved`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'sess-spec-1',
        mode: 'metadata',
        items: retrievedHits,
        batchId: 'sess-spec-1',
        queryUsed: 'gully erosion susceptibility',
        databaseLabel: 'All Online DBs',
      }),
    });
    assert.strictEqual(importRes.ok, true);
    const importJson = await importRes.json();

    assert.strictEqual(importJson.importSummary.uniqueInsertedCount, 1, 'Expected 1 canonical new record');
    assert.strictEqual(importJson.importSummary.existingMatchedCount, 1, 'Expected 1 existing library match');
    assert.strictEqual(
      importJson.importSummary.duplicateEventsRemovedCount,
      3,
      'Expected 3 consolidated duplicate events (2 cross-DB + 1 existing)'
    );
    assert.strictEqual(importJson.importSummary.successfullySavedCount, 4, 'All 4 selected events processed');
    assert.strictEqual(importJson.articles.length, 4, '3 seed + 1 canonical online = 4 unique library records');
    assert.strictEqual(importJson.counters.externalReportedCount, 450);
    assert.strictEqual(importJson.counters.uniqueLibraryCount, 4);
    assert.strictEqual(importJson.counters.existingLibraryMatchedCount, 1);
    assert.strictEqual(importJson.counters.duplicateEventsCount, 3);

    const newCanonical = importJson.articles.find(
      (a: Article) => a.doi?.toLowerCase() === '10.1000/new-multi-db-paper'
    );
    assert.ok(newCanonical, 'Canonical article must exist');
    assert.strictEqual(newCanonical.isDuplicate, false, 'Canonical article must not be flagged isDuplicate');
    assert.strictEqual(
      newCanonical.databaseSourceRecords?.length,
      3,
      'All 3 database provenance records preserved on 1 canonical article'
    );

    // Stage B Read-Only PRISMA verification
    const reloadedProj = await fetchTestProject(testProjId);
    assert.ok((reloadedProj.onlineSearchSessions?.length || 0) >= 1, 'Search session persisted on disk');
    const prismaCounts = computeAuthoritativePrismaCounts(reloadedProj);
    assert.strictEqual(prismaCounts.prismaEquationsValid, true, 'All 5 PRISMA equations must pass');
    assert.strictEqual(prismaCounts.uniqueRecords, 4);
    assert.strictEqual(
      prismaCounts.duplicatesExcluded,
      3,
      'PRISMA duplicatesExcluded summarizes 2 cross-DB consolidated + 1 existing overlap'
    );
    assert.strictEqual(prismaCounts.totalRecords, 7, 'PRISMA totalRecords = 4 unique + 3 duplicatesExcluded');

    // Verify deleting & clearing persisted search sessions without stale-cache resurrection
    const extraSession: OnlineSearchSession = {
      ...sessionPayload,
      id: 'sess-spec-delete-me',
      database: 'google_scholar',
      databaseLabel: 'Google Scholar',
      query: 'gully erosion susceptibility AND machine learning',
      externalReportedCount: 390,
      actuallyRetrievedCount: 312,
    };
    await fetch(`${BASE_URL}/api/projects/${testProjId}/online-search-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: extraSession }),
    });

    const delOneRes = await fetch(
      `${BASE_URL}/api/projects/${testProjId}/online-search-sessions/sess-spec-delete-me`,
      { method: 'DELETE' }
    );
    assert.strictEqual(delOneRes.ok, true);
    const delOneJson = await delOneRes.json();
    assert.strictEqual(delOneJson.removedCount, 1);
    assert.strictEqual(
      delOneJson.sessions.some((s: OnlineSearchSession) => s.id === 'sess-spec-delete-me'),
      false,
      'Deleted search session must be removed from search_sessions.json'
    );

    const projAfterSessionDel = await fetchTestProject(testProjId);
    const staleWithDeletedSession: ReviewProject = {
      ...projAfterSessionDel,
      updatedAt: new Date(Date.now() + 60_000).toISOString(),
      onlineSearchSessions: [extraSession, ...(projAfterSessionDel.onlineSearchSessions || [])],
    };
    const mergedSessionDel = mergeProjectsPreservingData(
      [projAfterSessionDel],
      [staleWithDeletedSession],
      [staleWithDeletedSession]
    );
    assert.strictEqual(
      mergedSessionDel[0].onlineSearchSessions?.some((s) => s.id === 'sess-spec-delete-me'),
      false,
      'Deleted Separate Database Search must never resurrect from stale cache/cloud'
    );

    const clearSessRes = await fetch(`${BASE_URL}/api/projects/${testProjId}/online-search-sessions`, {
      method: 'DELETE',
    });
    assert.strictEqual(clearSessRes.ok, true);
    const clearSessJson = await clearSessRes.json();
    assert.deepStrictEqual(clearSessJson.sessions, [], 'Clear all search sessions must leave empty array');

    console.log('  [PASS] 4. Workflow 2 sessions (incl. delete/clear & zero resurrection), Workflow 3 Stage A canonical dedup, 6 counters & Stage B PRISMA equations');

    // 5. Verify protected live folder untouched (256 records preserved)
    const gullyArticlesPath = path.resolve(
      process.cwd(),
      'database/reviews/Systematic-ReviewGully-Erosion-Susceptibility/articles.json'
    );
    if (fs.existsSync(gullyArticlesPath)) {
      const gullyArts = JSON.parse(fs.readFileSync(gullyArticlesPath, 'utf-8'));
      assert.strictEqual(
        gullyArts.length,
        256,
        `Protected live folder Systematic-ReviewGully-Erosion-Susceptibility must remain 256 articles (got ${gullyArts.length})`
      );
      console.log('  [PASS] 5. Protected live folder Systematic-ReviewGully-Erosion-Susceptibility verified untouched (256 articles)');
    }

    console.log('\nALL PERMANENT DELETION & 4-WORKFLOW RETRIEVAL SPECS PASSED.\n');
  } finally {
    clearProjectDeletionTombstones(testProjId);
    try {
      await fetch(`${BASE_URL}/api/projects/${testProjId}`, { method: 'DELETE' });
    } catch {}
  }
}

main().catch((err) => {
  console.error('Spec verification failed:', err);
  process.exit(1);
});
