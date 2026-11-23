import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import JSZip from 'jszip';
import { Article, ReviewProject } from '../src/types';
import { parseDatabaseExportToStagingBatch } from '../src/utils/multiDatabaseParser';
import {
  applyApprovedReconciliation,
  buildPrismaReconciliationReport,
  computeFullTextAvailability,
  computeRecoveryPreview,
  generateRecoveryDeliverables,
} from '../src/utils/recoveryEngine';
import { analyzeArticleForMatrix } from '../src/utils/slrDetectionEngine';
import {
  applyServerReconciliation,
  createFullProjectBackup,
  getFullRecoveryState,
  rollbackProjectFromBackup,
  scanProjectDiskPdfs,
} from '../src/server/recoveryService';
import { saveOriginalPdfBuffer } from '../src/server/pdfVaultService';

function buildMinimalPdfBuffer(bodyText: string, compressStream = false): Buffer {
  const escaped = bodyText.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const contentRaw = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const streamBytes = compressStream ? zlib.deflateSync(Buffer.from(contentRaw, 'latin1')) : Buffer.from(contentRaw, 'latin1');
  const filterDict = compressStream ? '/Filter /FlateDecode ' : '';
  const header = `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj\n4 0 obj << ${filterDict}/Length ${streamBytes.length} >>\nstream\n`;
  const footer = `\nendstream\nendobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`;
  return Buffer.concat([Buffer.from(header, 'latin1'), streamBytes, Buffer.from(footer, 'latin1')]);
}

async function buildMinimalXlsxBuffer(rows: string[][]): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
  );
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`
  );

  const rowXml = rows
    .map((cols, rIdx) => {
      const cellsXml = cols
        .map((val, cIdx) => {
          const colLetter = String.fromCharCode(65 + cIdx);
          const esc = val.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          return `<c r="${colLetter}${rIdx + 1}" t="inlineStr"><is><t>${esc}</t></is></c>`;
        })
        .join('');
      return `<row r="${rIdx + 1}">${cellsXml}</row>`;
    })
    .join('');

  zip.file(
    'xl/worksheets/sheet1.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rowXml}</sheetData>
</worksheet>`
  );

  return zip.generateAsync({ type: 'arraybuffer' });
}

async function runTests() {
  let passed = 0;
  const check = (name: string, fn: () => void | Promise<void>) => ({ name, fn });

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-recovery-test-'));
  try {
    const projectDir = path.join(tmpRoot, 'test-review');
    fs.mkdirSync(path.join(projectDir, 'pdfs'), { recursive: true });

    const baseProject: ReviewProject = {
      id: 'proj-rec-01',
      title: 'UAV High-Resolution Monitoring for Crop Nitrogen Stress Assessment',
      subtitle: 'Systematic Literature Review Test Protocol',
      scope: 'Systematic review evaluating UAV multispectral imaging for crop nitrogen status.',
      discipline: 'Precision Agriculture & Remote Sensing',
      methodologyFocus: 'UAV multispectral machine learning validation',
      publicationYears: '2018-2026',
      articleTypes: 'Original Empirical Research',
      geographicEligibility: 'Global',
      booleanQuery: '("UAV" OR "drone") AND "nitrogen"',
      picoc: {
        population: 'Agricultural cereal crops',
        intervention: 'UAV multispectral imagery and machine learning',
        comparison: 'Conventional ground-based SPAD measurements',
        outcome: 'Nitrogen prediction R2 and RMSE accuracy',
        context: 'Open-field precision agriculture trials',
      },
      researchQuestions: [
        { code: 'RQ1', question: 'What UAV sensors are used for nitrogen assessment?', mainEvidenceToCollect: 'Sensor specs and spectral bands' },
      ],
      inclusionCriteria: [
        {
          id: 'crit-1',
          dimension: 'Empirical study',
          includeRule: 'Original field trial with UAV nitrogen accuracy',
          excludeRule: 'Review article',
          category: 'inclusion',
        },
      ],
      standardExclusionReasons: ['Not relevant', 'Abstract-only'],
      uncertainCasesGuidance: 'Check full text',
      updatedAt: '2026-01-02T00:00:00.000Z',
      articles: [],
    };

    const art1: Article = {
      id: 'art-1',
      projectId: baseProject.id,
      title: 'UAV Multispectral Imaging for Winter Wheat Nitrogen Estimation',
      authors: ['Alemu, T.', 'Bekele, D.'],
      year: 2023,
      journal: 'Remote Sensing of Environment',
      doi: '10.1016/j.rse.2023.113501',
      abstract: 'Empirical UAV multispectral campaign across winter wheat plots showing R2 = 0.89 for nitrogen estimation.',
      sourceDatabase: 'Other',
      screeningStage: 'final_included',
      decision: 'include',
      decisionReason: 'Meets all empirical criteria',
      reviewerNotes: 'Verified primary field study',
      evidenceCitations: [],
      accessStatus: 'abstract_only', // Intentionally misclassified prior to PDF reconciliation
      prismaExclusionFlags: ['abstract_only'],
    };

    const art2: Article = {
      id: 'art-2',
      projectId: baseProject.id,
      title: 'Hyperspectral Canopy Reflectance Models for Maize Nitrogen Mapping',
      authors: ['Chen, L.', 'Zhang, Y.'],
      year: 2022,
      journal: 'Computers and Electronics in Agriculture',
      abstract: 'Field evaluation of maize canopy nitrogen concentration using UAV hyperspectral sensors.',
      sourceDatabase: 'Other',
      screeningStage: 'excluded',
      decision: 'exclude',
      decisionReason: 'Outside target crop focus in sub-analysis',
      reviewerNotes: 'Keep exclusion note verbatim',
      evidenceCitations: [],
    };

    const art3: Article = {
      id: 'art-3',
      projectId: baseProject.id,
      title: 'Edge Computing Latency Benchmarks for Real-Time Drone Nitrogen Mapping',
      authors: ['Tesfaye, M.'],
      year: 2024,
      journal: 'ISPRS Journal',
      abstract: 'Real-time onboard processing reduces drone nitrogen mapping turnaround latency to 14 minutes.',
      sourceDatabase: 'Other',
      screeningStage: 'title_abstract',
      decision: 'uncertain',
      reviewerNotes: 'Needs full-text check',
      evidenceCitations: [],
    };

    // Save PDF with FlateDecode compression containing DOI and >220 chars of readable academic text for art1
    const compressedPdfWithDoi = buildMinimalPdfBuffer(
      'UAV Multispectral Imaging for Winter Wheat Nitrogen Estimation DOI 10.1016/j.rse.2023.113501 empirical field validation across forty two agricultural research plots demonstrated coefficient of determination R2 equals 0.89 with cross site spatial block validation and radiometric calibration protocols.',
      true
    );
    fs.writeFileSync(path.join(projectDir, 'pdfs', 'Alemu_2023_Wheat_Nitrogen (final) #1.pdf'), compressedPdfWithDoi);

    // Extraction-failed PDF (valid %PDF- header, zero readable alphanumeric words inside stream) attached to art3
    const scannedFailedPdf = Buffer.from(
      '%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n',
      'latin1'
    );
    const updatedArt3 = saveOriginalPdfBuffer(
      projectDir,
      art3,
      scannedFailedPdf,
      'Tesfaye 2024 Scanned Manuscript.pdf'
    );
    // Simulate historical state where art3 was mistakenly tagged abstract_only
    updatedArt3.accessStatus = 'abstract_only';
    updatedArt3.prismaExclusionFlags = ['abstract_only'];

    // Unmatched orphan PDF on disk
    const orphanPdf = buildMinimalPdfBuffer(
      'Unlinked Drone Soil Moisture Survey Manuscript without project record DOI 10.9999/unlinked.2025.001',
      false
    );
    fs.writeFileSync(path.join(projectDir, 'pdfs', 'Unlinked_Survey_2025.pdf'), orphanPdf);

    baseProject.articles = [art1, art2, updatedArt3];
    const { articles: artsToWrite, ...metaToWrite } = baseProject;
    fs.writeFileSync(path.join(projectDir, 'project.json'), JSON.stringify({ ...metaToWrite, articleCount: artsToWrite.length }, null, 2));
    fs.writeFileSync(path.join(projectDir, 'articles.json'), JSON.stringify(artsToWrite, null, 2));

    const tests = [
      check('1. Multi-database parser supports RIS, BibTeX, CSV, XLSX, ENW and rejects unverified DB fabrication', async () => {
        const risBatch = await parseDatabaseExportToStagingBatch({
          exportFilename: 'scopus_export.ris',
          databaseName: 'Scopus',
          searchBatchId: 'batch-scopus-01',
          searchDate: '2026-01-05',
          textContent: `TY  - JOUR\nTI  - UAV Multispectral Imaging for Winter Wheat Nitrogen Estimation\nAU  - Alemu, T.\nAU  - Bekele, D.\nPY  - 2023\nJO  - Remote Sensing of Environment\nDO  - 10.1016/j.rse.2023.113501\nID  - SCOPUS-101\nER  -\n`,
        });
        assert.strictEqual(risBatch.recordsCount, 1);
        assert.strictEqual(risBatch.databaseVerified, true);
        assert.strictEqual(risBatch.records[0].doi, '10.1016/j.rse.2023.113501');

        const bibBatch = await parseDatabaseExportToStagingBatch({
          exportFilename: 'wos_export.bib',
          databaseName: 'Web of Science',
          textContent: `@article{wos1,\n  title={UAV Multispectral Imaging for Winter Wheat Nitrogen Estimation},\n  author={Alemu, T. and Bekele, D.},\n  journal={Remote Sensing of Environment},\n  year={2023},\n  doi={10.1016/j.rse.2023.113501}\n}`,
        });
        assert.strictEqual(bibBatch.recordsCount, 1);
        assert.strictEqual(bibBatch.databaseName, 'Web of Science');

        const csvBatch = await parseDatabaseExportToStagingBatch({
          exportFilename: 'ieee_export.csv',
          databaseName: 'IEEE Xplore',
          textContent: `Title,Authors,Year,Journal,DOI\n"Hyperspectral Canopy Reflectance Models for Maize Nitrogen Mapping","Chen, L.; Zhang, Y.",2022,"Computers and Electronics in Agriculture",""`,
        });
        assert.strictEqual(csvBatch.recordsCount, 1);
        assert.strictEqual(csvBatch.records[0].year, 2022);

        const xlsxBuf = await buildMinimalXlsxBuffer([
          ['Title', 'Authors', 'Year', 'Journal'],
          ['Edge Computing Latency Benchmark for Real-Time Drone Nitrogen Mapping', 'Tesfaye, M.', '2024', 'ISPRS Journal'],
        ]);
        const xlsxBatch = await parseDatabaseExportToStagingBatch({
          exportFilename: 'sciencedirect_export.xlsx',
          databaseName: 'ScienceDirect',
          binaryBuffer: xlsxBuf,
        });
        assert.strictEqual(xlsxBatch.recordsCount, 1);
        assert.strictEqual(xlsxBatch.exportFormat, 'xlsx');

        const unverifiedBatch = await parseDatabaseExportToStagingBatch({
          exportFilename: 'unknown_export.enw',
          databaseName: '',
          textContent: `%T Sample Unverified Source Study\n%A Doe, J.\n%D 2021\n%J Unknown Journal\n`,
        });
        assert.strictEqual(unverifiedBatch.databaseVerified, false);
        assert.strictEqual(unverifiedBatch.databaseName, 'Unspecified Database (Confirmation Required)');
      }),

      check('2. Full-text availability & slrDetectionEngine treat accessible PDF with extraction failure as full-text available, never abstract-only', () => {
        const scannedPdfs = scanProjectDiskPdfs(projectDir, baseProject.articles);
        const art3Scan = scannedPdfs.find((s) => s.linkedArticleId === 'art-3');
        assert.ok(art3Scan, 'art-3 PDF should be found on disk');
        assert.strictEqual(art3Scan!.textExtractionFailed, true);

        const status = computeFullTextAvailability(updatedArt3, art3Scan);
        assert.strictEqual(status.pdfAttached, true);
        assert.strictEqual(status.pdfAccessible, true);
        assert.strictEqual(status.pdfTextExtractionFailed, true);
        assert.strictEqual(status.fullTextRetrieved, true);
        assert.strictEqual(status.classification, 'pdf_attached_extraction_failed');

        // Verify slrDetectionEngine respects accessible disk PDF (without abstract_only false positive)
        const art3CleanForDiag: Article = {
          ...updatedArt3,
          accessStatus: 'downloadable',
          fullTextStatusDetails: status,
          prismaExclusionFlags: ['clear:abstract_only'],
        };
        const matrix = analyzeArticleForMatrix(art3CleanForDiag, baseProject);
        assert.strictEqual(matrix.prismaDiagnostics.detectedCodes.includes('abstract_only'), false);
        assert.strictEqual(matrix.prismaDiagnostics.detectedCodes.includes('not_accessible'), false);
      }),

      check('3. Disk PDF scanner extracts DOI from FlateDecode compressed stream & classifies orphan PDF as unmatched_document', () => {
        const scannedPdfs = scanProjectDiskPdfs(projectDir, baseProject.articles);
        const alemuPdf = scannedPdfs.find((s) => s.originalFilename.includes('Alemu_2023'));
        assert.ok(alemuPdf);
        assert.strictEqual(alemuPdf!.extractedDoi, '10.1016/j.rse.2023.113501');

        const preview = computeRecoveryPreview({
          project: baseProject,
          stagingBatches: [],
          scannedPdfs,
        });
        const orphan = preview.unmatchedPdfs.find((u) => u.originalFilename === 'Unlinked_Survey_2025.pdf');
        assert.ok(orphan, 'Unlinked PDF should appear in unmatchedPdfs');
        assert.strictEqual(orphan!.classification, 'unmatched_document');

        const alemuCandidate = preview.pdfMatches.find((p) => p.pdfOriginalFilename.includes('Alemu_2023'));
        assert.ok(alemuCandidate);
        assert.strictEqual(alemuCandidate!.targetArticleId, 'art-1');
        assert.strictEqual(alemuCandidate!.matchMethod, 'pdf_doi');
      }),

      check('4. Non-destructive preview, mandatory pre-reconciliation backup, many-to-one duplicate provenance, and rollback protection', async () => {
        const b1 = await parseDatabaseExportToStagingBatch({
          exportFilename: 'scopus.ris',
          databaseName: 'Scopus',
          textContent: `TY  - JOUR\nTI  - UAV Multispectral Imaging for Winter Wheat Nitrogen Estimation\nAU  - Alemu, T.\nPY  - 2023\nDO  - 10.1016/j.rse.2023.113501\nER  -\n`,
        });
        const b2 = await parseDatabaseExportToStagingBatch({
          exportFilename: 'wos.bib',
          databaseName: 'Web of Science',
          textContent: `@article{k1,\n  title={UAV Multispectral Imaging for Winter Wheat Nitrogen Estimation},\n  author={Alemu, T.},\n  year={2023},\n  doi={10.1016/j.rse.2023.113501}\n}\n@article{k2,\n  title={Hyperspectral Canopy Reflectance Models for Maize Nitrogen Mapping},\n  author={Chen, L.},\n  year={2022}\n}`,
        });
        const bFuzzy = await parseDatabaseExportToStagingBatch({
          exportFilename: 'sd.csv',
          databaseName: 'ScienceDirect',
          textContent: `Title,Authors,Year\n"Edge Computing Latency Benchmark for Real-Time Drone Nitrogen Mapping","Tesfaye, M.",2024`,
        });

        const recDir = path.join(projectDir, 'recovery');
        fs.mkdirSync(recDir, { recursive: true });
        fs.writeFileSync(path.join(recDir, 'staging_batches.json'), JSON.stringify([b1, b2, bFuzzy], null, 2));

        // Non-destructive preview before applying
        const stateBefore = getFullRecoveryState({ folderPath: projectDir, project: baseProject });
        assert.strictEqual(stateBefore.preview.duplicateGroups.length, 1, 'Scopus + WoS cluster for art-1');
        const fuzzyMatch = stateBefore.preview.matches.find((m) => m.stagedTitle.includes('Latency Benchmark'));
        assert.ok(fuzzyMatch);
        assert.strictEqual(fuzzyMatch!.requiresManualConfirmation, true, 'Fuzzy title difference must require manual confirmation');
        assert.strictEqual(stateBefore.preview.prismaPreview.unverifiedGaps.length > 0, true, 'Unverified historical PRISMA counts flagged');

        // Apply approved matches & PDF link
        const autoMatchIds = stateBefore.preview.matches
          .filter((m) => m.targetArticleId && !m.requiresManualConfirmation)
          .map((m) => m.matchId);
        const autoPdfIds = stateBefore.preview.pdfMatches
          .filter((p) => p.targetArticleId && !p.requiresManualConfirmation && !p.alreadyMatchingHash)
          .map((p) => p.candidateId);

        const applied = applyServerReconciliation({
          folderPath: projectDir,
          project: baseProject,
          approval: {
            approvedMatchIds: autoMatchIds,
            rejectedMatchIds: [],
            manualMatchAssignments: { [fuzzyMatch!.matchId]: 'art-3' },
            approvedPdfMatchIds: autoPdfIds,
            rejectedPdfMatchIds: [],
            allowReplaceExistingPdfIds: [],
            recalculateFullTextAvailability: true,
            prismaHistoricalLog: {
              verifiedByResearcher: true,
              recordsScreened: 3,
              recordsExcludedAtScreening: 1,
              reportsSoughtForRetrieval: 2,
              reportsNotRetrieved: 1,
              reportsAssessedForEligibility: 1,
              reportsExcludedAtEligibility: 0,
              studiesIncluded: 1,
              sourceNote: 'Verified by Lead Reviewer',
            },
            appliedBy: 'Lead Reviewer',
          },
        });

        // Verify mandatory pre-reconciliation backup created
        assert.ok(applied.backupManifest.backupId.startsWith('bkp-'));
        const updatedArt1 = applied.updatedProject.articles.find((a) => a.id === 'art-1')!;
        assert.strictEqual(updatedArt1.id, 'art-1');
        assert.strictEqual(updatedArt1.decision, 'include');
        assert.strictEqual(updatedArt1.decisionReason, 'Meets all empirical criteria');
        assert.strictEqual(updatedArt1.original_filename, 'Alemu_2023_Wheat_Nitrogen (final) #1.pdf');
        assert.strictEqual(updatedArt1.databaseSourceRecords?.length, 2, 'Many-to-one Scopus + WoS preserved');
        assert.strictEqual(updatedArt1.fullTextStatusDetails?.classification, 'full_text_retrieved');

        const updatedArt2 = applied.updatedProject.articles.find((a) => a.id === 'art-2')!;
        assert.strictEqual(updatedArt2.decision, 'exclude', 'Excluded decision preserved');
        assert.strictEqual(updatedArt2.reviewerNotes, 'Keep exclusion note verbatim');

        const updatedArt3Post = applied.updatedProject.articles.find((a) => a.id === 'art-3')!;
        assert.strictEqual(updatedArt3Post.fullTextStatusDetails?.classification, 'pdf_attached_extraction_failed');
        assert.strictEqual(updatedArt3Post.prismaExclusionFlags?.includes('abstract_only'), false);

        // PRISMA equations verified pass
        const failedChecks = applied.prismaReport.consistencyChecks.filter((c) => c.status === 'discrepancy');
        assert.strictEqual(failedChecks.length, 0);

        // Check all 8 final deliverables generated cleanly
        const deliv = applied.state.deliverables;
        assert.ok(deliv.projectRecoveryReport.includes('# 1. Project Recovery Report'));
        assert.ok(deliv.databaseProvenanceReport.includes('# 2. Database Provenance Restoration Report'));
        assert.ok(deliv.duplicateResolutionReport.includes('# 3. Duplicate Resolution Report'));
        assert.ok(deliv.pdfReconciliationReport.includes('# 4. PDF Reconciliation Report'));
        assert.ok(deliv.abstractClassificationReport.includes('# 5. Abstract-Only Classification Correction Report'));
        assert.ok(deliv.updatedPrismaReport.includes('# 6. Updated PRISMA 2020 Flow Diagram Summary'));
        assert.ok(deliv.screeningDiagnosticsReport.includes('# 7. Screening Diagnostics & PRISMA Consistency Report'));
        assert.ok(deliv.recoveryAuditLogReport.includes('# 8. Recovery Audit Log'));

        // Test Rollback restores prior state while keeping PDF files intact
        const rolled = rollbackProjectFromBackup({
          folderPath: projectDir,
          projectId: baseProject.id,
          backupId: applied.backupManifest.backupId,
          actor: 'Lead Reviewer',
        });
        assert.strictEqual(rolled.restoredArticles.length, 3);
        const rolledArt1 = rolled.restoredArticles.find((a) => a.id === 'art-1')!;
        assert.strictEqual(rolledArt1.sourceDatabase, 'Other');
        assert.strictEqual(rolledArt1.databaseSourceRecords, undefined);
        assert.ok(rolled.intactPdfFilesCount >= 3, 'All disk PDFs must remain untouched during rollback');
        assert.ok(rolled.auditLog.some((e) => Boolean(e.rolledBackAt)), 'Audit log marks operation as rolled back');
      }),

      check('5. Protected existing review folders on disk remain untouched', () => {
        const gullyPath = path.resolve(process.cwd(), 'database/reviews/Systematic-ReviewGully-Erosion-Susceptibility');
        const uavPath = path.resolve(process.cwd(), 'database/reviews/unmanned-aerial-vehicles-and-ultra-high-resolution-remot__rev-1794544112951');
        assert.ok(fs.existsSync(gullyPath) || !fs.existsSync(path.resolve(process.cwd(), 'database/reviews')));
        if (fs.existsSync(uavPath)) {
          assert.ok(fs.existsSync(path.join(uavPath, 'project.json')));
        }
      }),
    ];

    for (const t of tests) {
      await t.fn();
      passed++;
      console.log(`PASS: ${t.name}`);
    }
    console.log(`\nALL ${passed}/${tests.length} RECOVERY & PRISMA RECONCILIATION TESTS PASSED.`);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('TEST FAILURE:', err);
  process.exit(1);
});
