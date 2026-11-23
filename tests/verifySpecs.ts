import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import {
  applyMetadataCorrectionWithCitationSync,
  deduplicateArticlesForBibliography,
  formatBibTexEntries,
  formatInlineCitation,
  formatReferenceEntry,
  formatReferenceString,
  formatRisEntries,
  normalizeValidDoi,
  validateArticleMetadata,
} from '../src/utils/citationFormatter';
import {
  buildContentDispositionHeader,
  sanitizeOriginalBasename,
} from '../src/server/pdfVaultService';
import { Article, PublicationType } from '../src/types';

const BASE_URL = 'http://localhost:3000';
const BANNED_PLACEHOLDERS = [
  'Author pending sync',
  'Unknown Author',
  'Author Unknown',
  'Author unknown',
  'Unknown Authors',
  'Local Source File',
  'DOI: N/A',
  'Academic Venue',
  'Academic Publication',
  'Academic Journal',
  'Unknown Venue',
];

function assertNoBannedPlaceholders(text: string, context: string) {
  for (const banned of BANNED_PLACEHOLDERS) {
    assert(
      !text.toLowerCase().includes(banned.toLowerCase()),
      `[${context}] Found banned placeholder "${banned}" in output: ${text}`
    );
  }
  assert(
    !/https?:\/\/doi\.org\/\s*([)\]\s]|$)/i.test(text),
    `[${context}] Found empty DOI hyperlink in output: ${text}`
  );
}

function makePdfBuffer(label: string): Buffer {
  const payload = `%PDF-1.4\n% ResearchMate Test Payload: ${label} (${crypto.randomUUID()})\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`;
  return Buffer.from(payload, 'utf8');
}

function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function runSpecATests() {
  console.log('\n=== Running Spec A: APA 7th & Multi-Style Shared Citation Engine Tests ===');

  // 1. Missing authors (with placeholder stripping)
  {
    const art: Article = {
      id: 'spec-a-1',
      title: 'Soil Conservation Structures in Highland Watersheds',
      authors: ['Author pending sync', 'Unknown Author'],
      year: 2023,
      journal: 'Journal of Soil and Water Management',
      volume: '18',
      issue: '2',
      pagesStr: '45-62',
      doi: '10.1016/j.jswm.2023.100012',
      abstract: 'Empirical soil conservation study.',
      sourceDatabase: 'Crossref',
      screeningStage: 'final_included',
      decision: 'include',
      evidenceCitations: [],
    };
    const report = validateArticleMetadata(art);
    assert.strictEqual(report.sanitized.authors.length, 0, 'Placeholder authors must be stripped');
    assert.ok(report.missingFields.includes('Authors'), 'Missing Authors should be flagged');
    assert.ok(
      report.verificationStatus === 'Needs Manual Review' || report.verificationStatus === 'Partially Verified',
      `Unexpected status for missing author: ${report.verificationStatus}`
    );
    const apa = formatReferenceEntry(art, 0, 'apa7');
    assertNoBannedPlaceholders(apa.citationText, 'Missing authors APA');
    assert.ok(
      apa.citationText.startsWith('Soil conservation structures in highland watersheds. (2023).'),
      `APA no-author rule failed: ${apa.citationText}`
    );
    const inline = formatInlineCitation(art, 'apa7', 1);
    assertNoBannedPlaceholders(inline, 'Missing authors inline');
    console.log('  [PASS] 1. Missing authors & placeholder stripping -> APA no-author rule');
  }

  // 2. Multiple authors (2, 5, and 21+ authors ellipsis rule)
  {
    const twoAuthors: Article = {
      id: 'spec-a-2a',
      title: 'Deep Learning for Gully Extraction',
      authors: ['Jane Doe', 'John Smith'],
      year: 2022,
      journal: 'Remote Sensing of Environment',
      volume: '275',
      pagesStr: '112-128',
      doi: '10.1016/j.rse.2022.112',
      abstract: 'Two authors test.',
      sourceDatabase: 'Scopus',
      screeningStage: 'final_included',
      decision: 'include',
      evidenceCitations: [],
    };
    const apa2 = formatReferenceEntry(twoAuthors, 0, 'apa7');
    assert.ok(apa2.citationText.includes('Doe, J., & Smith, J. (2022).'), `Two-author APA mismatch: ${apa2.citationText}`);
    assert.strictEqual(apa2.inTextParenthetical, '(Doe & Smith, 2022)');

    const manyAuthors = Array.from({ length: 22 }, (_, i) => `Author${i + 1}, Test${i + 1}`);
    const twentyTwoArt: Article = {
      ...twoAuthors,
      id: 'spec-a-2b',
      authors: manyAuthors,
    };
    const apa22 = formatReferenceEntry(twentyTwoArt, 0, 'apa7');
    assert.ok(apa22.citationText.includes('...'), `21+ author APA ellipsis missing: ${apa22.citationText}`);
    assert.ok(apa22.citationText.includes('Author22, T.'), `Final (22nd) author missing: ${apa22.citationText}`);
    assert.ok(!apa22.citationText.includes('Author20, T.'), `20th author should be omitted by APA 21+ rule: ${apa22.citationText}`);
    assert.strictEqual(apa22.inTextParenthetical, '(Author1 et al., 2022)');
    console.log('  [PASS] 2. Multiple authors & 21+ authors APA ellipsis rule');
  }

  // 3. Missing publication year -> (n.d.) without fabrication
  {
    const noYear: Article = {
      id: 'spec-a-3',
      title: 'Catchment Erosion Assessment Protocol',
      authors: ['Abebe, Bekele'],
      journal: 'Hydrological Processes',
      doi: '10.1002/hyp.99999',
      abstract: 'No year test.',
      sourceDatabase: 'Manual',
      screeningStage: 'final_included',
      decision: 'include',
      evidenceCitations: [],
    };
    const report = validateArticleMetadata(noYear);
    assert.strictEqual(report.sanitized.year, null);
    assert.ok(report.missingFields.includes('Publication Year'));
    const apa = formatReferenceEntry(noYear, 0, 'apa7');
    assert.ok(apa.citationText.includes('(n.d.).'), `Expected (n.d.) for missing year: ${apa.citationText}`);
    const bib = formatBibTexEntries([noYear]);
    assert.ok(!/year\s*=\s*\{202\d\}/i.test(bib), `BibTeX fabricated a year: ${bib}`);
    console.log('  [PASS] 3. Missing publication year -> (n.d.) & zero fabrication');
  }

  // 4. Missing DOI -> omitted completely, never "DOI: N/A" or empty link
  {
    const noDoi: Article = {
      id: 'spec-a-4',
      title: 'Participatory Watershed Management in Northern Highlands',
      authors: ['Tadesse, M.', 'Kebede, A.'],
      year: 2021,
      journal: 'African Journal of Environmental Science',
      volume: '15',
      pagesStr: '10-22',
      abstract: 'No DOI available.',
      sourceDatabase: 'Manual',
      screeningStage: 'final_included',
      decision: 'include',
      evidenceCitations: [],
    };
    const apa = formatReferenceEntry(noDoi, 0, 'apa7');
    assertNoBannedPlaceholders(apa.citationText, 'Missing DOI');
    assert.strictEqual(apa.doiOrUrl, '');
    assert.ok(!apa.citationText.toLowerCase().includes('doi'), `DOI prefix leaked when DOI missing: ${apa.citationText}`);
    console.log('  [PASS] 4. Missing DOI cleanly omitted');
  }

  // 5. Invalid DOI -> rejected and flagged as conflict
  {
    const badDoi: Article = {
      id: 'spec-a-5',
      title: 'Topographic Wetness Index and Soil Piping',
      authors: ['Mekonnen, G.'],
      year: 2020,
      journal: 'Catena',
      doi: 'https://doi.org/invalid-doi-string',
      abstract: 'Bad DOI test.',
      sourceDatabase: 'Manual',
      screeningStage: 'final_included',
      decision: 'include',
      evidenceCitations: [],
    };
    assert.strictEqual(normalizeValidDoi(badDoi.doi), null, 'Invalid DOI should return null');
    const report = validateArticleMetadata(badDoi);
    assert.strictEqual(report.sanitized.hasInvalidDoi, true);
    assert.strictEqual(report.fieldProvenance.doi.status, 'conflict');
    const apa = formatReferenceEntry(badDoi, 0, 'apa7');
    assertNoBannedPlaceholders(apa.citationText, 'Invalid DOI');
    assert.ok(!apa.citationText.includes('invalid-doi-string'), 'Invalid DOI must not appear in APA citation');
    console.log('  [PASS] 5. Invalid DOI rejected & flagged');
  }

  // 6. Incomplete / filename title
  {
    const badTitle: Article = {
      id: 'spec-a-6',
      title: 'scan_01.pdf',
      authors: ['Tesfaye, H.'],
      year: 2024,
      journal: 'Geomorphology',
      abstract: 'Short test.',
      sourceDatabase: 'Manual',
      screeningStage: 'title_abstract',
      decision: 'unscreened',
      evidenceCitations: [],
    };
    const report = validateArticleMetadata(badTitle);
    assert.strictEqual(report.sanitized.hasValidTitle, false);
    assert.ok(report.conflicts.some((c) => /filename|graphic asset/i.test(c)));
    assert.strictEqual(report.verificationStatus, 'Unresolved');
    console.log('  [PASS] 6. Incomplete / filename title flagged cleanly');
  }

  // 7. Duplicate articles deduplication (DOI + normalized title)
  {
    const dupA: Article = {
      id: 'dup-1',
      title: 'Gully Erosion Susceptibility Mapping Using Ensemble Learning',
      authors: ['Alemu, B.'],
      year: 2023,
      journal: '',
      doi: 'https://doi.org/10.1007/s11069-023-01234-5',
      abstract: 'Short.',
      sourceDatabase: 'Scopus',
      screeningStage: 'final_included',
      decision: 'include',
      evidenceCitations: [],
    };
    const dupB: Article = {
      id: 'dup-2',
      title: 'Gully Erosion Susceptibility Mapping Using Ensemble Learning',
      authors: ['Alemu, B.', 'Girma, T.'],
      year: 2023,
      journal: 'Natural Hazards',
      volume: '115',
      issue: '3',
      pagesStr: '2100-2120',
      doi: '10.1007/s11069-023-01234-5',
      abstract: 'Complete abstract with empirical metrics.',
      sourceDatabase: 'Crossref',
      screeningStage: 'final_included',
      decision: 'include',
      evidenceCitations: [],
    };
    const dupByTitle: Article = {
      id: 'dup-3',
      title: 'Gully erosion susceptibility mapping using ensemble learning!',
      authors: ['Alemu, B.'],
      year: 2023,
      journal: 'Natural Hazards',
      abstract: 'Same title without punctuation.',
      sourceDatabase: 'Manual',
      screeningStage: 'final_included',
      decision: 'include',
      evidenceCitations: [],
    };
    const deduped = deduplicateArticlesForBibliography([dupA, dupB, dupByTitle]);
    assert.strictEqual(deduped.length, 1, `Expected 1 deduplicated record, got ${deduped.length}`);
    assert.strictEqual(deduped[0].id, 'dup-2', 'Deduplication should keep richer Crossref record');
    console.log('  [PASS] 7. Duplicate bibliography entries deduplicated keeping richer verified record');
  }

  // 8. Crossref failure / unavailable live lookup handling (must not crash or inject placeholders)
  {
    const res = await fetch(`${BASE_URL}/api/crossref/lookup?q=`);
    // Empty query should fail gracefully (400/200 JSON) without crashing server
    assert.ok(res.status >= 200 && res.status < 500, `Unexpected HTTP status ${res.status} on empty Crossref lookup`);
    const localAfterCrossrefFail: Article = {
      id: 'spec-a-8',
      title: 'Local Hydrology Report Before Sync',
      authors: [],
      journal: 'Local Source File',
      sourceFileName: 'report_draft.pdf',
      original_filename: 'report_draft.pdf',
      abstract: 'Crossref unavailable fallback record.',
      sourceDatabase: 'Manual',
      screeningStage: 'title_abstract',
      decision: 'unscreened',
      evidenceCitations: [],
    };
    const report = validateArticleMetadata(localAfterCrossrefFail);
    assert.strictEqual(report.sanitized.journalOrSource, null, 'Local Source File must be stripped');
    const apa = formatReferenceEntry(localAfterCrossrefFail, 0, 'apa7');
    assertNoBannedPlaceholders(apa.citationText, 'Crossref failure fallback');
    console.log('  [PASS] 8. Crossref failure fallback & placeholder protection verified');
  }

  // 9. Local PDF without publication metadata
  {
    const localPdf: Article = {
      id: 'spec-a-9',
      title: 'Field Survey Notes on Vertisol Gullies in Amhara Region',
      authors: [],
      journal: 'Local Source File',
      original_filename: '## Field_Survey (Amhara) .pdf',
      sourceFileName: '## Field_Survey (Amhara) .pdf',
      abstract: 'Imported local PDF without bibliographic headers.',
      sourceDatabase: 'Manual',
      screeningStage: 'title_abstract',
      decision: 'unscreened',
      evidenceCitations: [],
    };
    const apa = formatReferenceEntry(localPdf, 0, 'apa7');
    assertNoBannedPlaceholders(apa.citationText, 'Local PDF without metadata');
    assert.ok(
      !apa.citationText.includes('## Field_Survey'),
      'Local filename must not leak as publication journal source'
    );
    console.log('  [PASS] 9. Local PDF without publication metadata avoids fabricating journal/author');
  }

  // 10. All 10 APA 7th publication types (including unpublished manuscript)
  {
    const baseCommon = {
      authors: ['Dawit, S.', 'Lema, K.'],
      year: 2024,
      title: 'Automated Spatial Modeling for Land Degradation Neutrality',
      abstract: 'Test entry',
      sourceDatabase: 'Crossref' as const,
      screeningStage: 'final_included' as const,
      decision: 'include' as const,
      evidenceCitations: [],
    };
    const cases: Array<{ type: PublicationType; extra: Partial<Article>; expectPlainSub: string; expectMdSub?: string }> = [
      {
        type: 'journal_article',
        extra: { journal: 'ISPRS Journal of Photogrammetry', volume: '210', issue: '4', pagesStr: '100-118', doi: '10.1016/j.isprs.2024.01' },
        expectPlainSub: 'ISPRS Journal of Photogrammetry, 210(4), 100–118. https://doi.org/10.1016/j.isprs.2024.01',
        expectMdSub: '*ISPRS Journal of Photogrammetry*, *210*(4), 100–118.',
      },
      {
        type: 'book',
        extra: { journal: '', publisher: 'Springer Nature', edition: '2nd', doi: '10.1007/978-3-030-12345-6' },
        expectPlainSub: 'Springer Nature. https://doi.org/10.1007/978-3-030-12345-6',
        expectMdSub: '*Automated spatial modeling for land degradation neutrality*',
      },
      {
        type: 'book_chapter',
        extra: { bookTitle: 'Handbook of Geomorphology', editors: ['R. Kirkby', 'M. Parsons'], pagesStr: '215-240', publisher: 'Academic Press', doi: '10.1016/B978-0-12-800001-0' },
        expectPlainSub: 'Handbook of geomorphology',
        expectMdSub: '*Handbook of geomorphology*',
      },
      {
        type: 'conference_paper',
        extra: { journal: 'Proceedings of IGARSS 2024', pagesStr: '512-516', publisher: 'IEEE', doi: '10.1109/IGARSS.2024.9911' },
        expectPlainSub: 'Proceedings of IGARSS 2024',
      },
      {
        type: 'thesis_dissertation',
        extra: { journal: 'Doctoral dissertation', institution: 'Addis Ababa University' },
        expectPlainSub: '[Unpublished doctoral dissertation, Addis Ababa University]',
      },
      {
        type: 'report',
        extra: { journal: 'FAO Technical Working Paper', reportNumber: 'WP-2024-09', publisher: 'Food and Agriculture Organization' },
        expectPlainSub: '(Report No. WP-2024-09)',
      },
      {
        type: 'government_publication',
        extra: { journal: 'National Soil Conservation Directive', reportNumber: 'Pub. No. 44-A', publisher: 'Ministry of Agriculture' },
        expectPlainSub: 'Ministry of Agriculture',
      },
      {
        type: 'preprint',
        extra: { journal: 'EarthArXiv', doi: '10.31223/X50011', publicationStatus: 'preprint' },
        expectPlainSub: 'EarthArXiv. https://doi.org/10.31223/X50011',
      },
      {
        type: 'unpublished_manuscript',
        extra: { journal: '', institution: 'Bahir Dar University', publicationStatus: 'unpublished' },
        expectPlainSub: 'Unpublished manuscript',
      },
      {
        type: 'web_publication',
        extra: { journal: 'Global Soil Partnership Portal', url: 'https://www.fao.org/global-soil-partnership/assessment', publishedMonthDay: 'May 14' },
        expectPlainSub: 'https://www.fao.org/global-soil-partnership/assessment',
      },
    ];

    for (const tc of cases) {
      const a: Article = {
        ...baseCommon,
        id: `pubtype-${tc.type}`,
        journal: tc.extra.journal ?? '',
        publicationType: tc.type,
        ...tc.extra,
      };
      const mdRendered = formatReferenceString(a, 'apa7', 1, tc.type);
      const entry = formatReferenceEntry(a, 0, 'apa7', tc.type);
      assertNoBannedPlaceholders(entry.citationText, `APA7 ${tc.type}`);
      assert.ok(
        entry.citationText.includes(tc.expectPlainSub),
        `Publication type ${tc.type} missing expected plain fragment "${tc.expectPlainSub}" in: ${entry.citationText}`
      );
      if (tc.expectMdSub) {
        assert.ok(
          mdRendered.includes(tc.expectMdSub),
          `Publication type ${tc.type} missing expected italic fragment "${tc.expectMdSub}" in: ${mdRendered}`
        );
      }
    }
    console.log('  [PASS] 10. All 10 APA 7th publication types formatted accurately');
  }

  // 11. Conflicts, Auto Citation Sync, Audit History & Multi-style (Harvard, Vancouver, IEEE, Chicago, RIS, BibTeX)
  {
    const initial: Article = {
      id: 'article-sync-keep-id',
      original_filename: '## Results for Included Studies .pdf',
      sourceFileName: '## Results for Included Studies .pdf',
      title: 'UAV Photogrammetry for Gully Monitoring',
      authors: ['Unknown Author', 'Yilma, D.'],
      journal: 'Local Source File',
      doi: 'bad-doi',
      abstract: 'Initial unverified record.',
      sourceDatabase: 'Manual',
      screeningStage: 'final_included',
      decision: 'include',
      evidenceCitations: [],
    };
    const updated = applyMetadataCorrectionWithCitationSync(
      initial,
      {
        authors: ['Yilma, D.', 'Hailu, T.'],
        year: 2024,
        journal: 'Earth Surface Processes and Landforms',
        volume: '49',
        issue: '6',
        pagesStr: '1820-1838',
        doi: '10.1002/esp.5812',
        publicationType: 'journal_article',
      },
      'manual_edit',
      'Reviewer verified journal issue & DOI'
    );
    assert.strictEqual(updated.id, 'article-sync-keep-id', 'Article ID must be preserved on metadata correction');
    assert.strictEqual(
      updated.original_filename,
      '## Results for Included Studies .pdf',
      'original_filename must NEVER be altered during metadata sync'
    );
    assert.strictEqual(updated.citationVerificationStatus, 'Verified');
    assert.ok(updated.citationAuditHistory && updated.citationAuditHistory.length >= 1, 'Audit history must record citation sync');
    assert.ok(updated.citationCache?.referenceText?.includes('10.1002/esp.5812'));

    // Check Harvard, Vancouver, IEEE, Chicago, RIS, BibTeX
    for (const style of ['apa7', 'harvard', 'vancouver', 'ieee', 'chicago_author', 'chicago_notes'] as const) {
      const formatted = formatReferenceEntry(updated, 0, style);
      assertNoBannedPlaceholders(formatted.citationText, `Style ${style}`);
      assert.ok(formatted.citationText.length > 25, `Style ${style} produced too short output`);
    }
    const ris = formatRisEntries([updated]);
    assert.ok(ris.includes('TY  - JOUR') && ris.includes('DO  - 10.1002/esp.5812'));
    const bib = formatBibTexEntries([updated]);
    assert.ok(bib.includes('@article{') && bib.includes('doi = {10.1002/esp.5812}'));
    console.log('  [PASS] 11. Metadata correction preserves ID & original_filename, logs audit history, & passes Harvard/Vancouver/IEEE/Chicago/RIS/BibTeX');
  }
}

async function runSpecBTests() {
  console.log('\n=== Running Spec B: Original Filename Preservation & Bulk ZIP PDF Export Tests ===');

  // 1. Unit tests for sanitizeOriginalBasename and Content-Disposition RFC 5987
  const specialNames = [
    '## Results for Included Studies .pdf',
    'v1.2.study.final.pdf',
    'Study (Ethiopia — 2024)_final[1].pdf',
    'résumé_gully_#1 (copy).PDF',
  ];
  for (const name of specialNames) {
    assert.strictEqual(
      sanitizeOriginalBasename(name),
      name,
      `sanitizeOriginalBasename mutated valid characters/spaces in "${name}"`
    );
    const cd = buildContentDispositionHeader(name, false);
    assert.ok(cd.includes(`filename*=UTF-8''${encodeURIComponent(name).replace(/['()*!]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`));
  }
  assert.strictEqual(
    sanitizeOriginalBasename('../../../secret/## Results for Included Studies .pdf'),
    '## Results for Included Studies .pdf',
    'Path traversal segments must be stripped while preserving exact basename'
  );
  console.log('  [PASS] 1. Filename sanitization & RFC 5987 Content-Disposition unit tests');

  // 2. Live HTTP end-to-end tests against isolated temp review folder
  const tempProjectId = `test-spec-verify-${Date.now()}`;
  const dbReviewsRoot = path.resolve(process.cwd(), 'database', 'reviews');
  const preExistingFolders = fs.existsSync(dbReviewsRoot) ? new Set(fs.readdirSync(dbReviewsRoot)) : new Set<string>();

  try {
    // Build 17 articles: 16 with PDFs (including special chars & collisions) + 1 missing binary
    const testFilenames = [
      '## Results for Included Studies .pdf',
      'Study.pdf',
      'Study.pdf', // duplicate name #2 -> Study (2).pdf
      'Study (2).pdf', // already exists! So 2nd Study.pdf colliding or this should not overwrite -> Study (2) (2).pdf or Study (3).pdf
      'v1.2.study.final.pdf',
      'Ethiopia_Gully — Assessment (2024).pdf',
      'Paper_07_UAV.pdf',
      'Paper_08_SAR.pdf',
      'Paper_09_DEM.pdf',
      'Paper_10_LULC.pdf',
      'Paper_11_RUSLE.pdf',
      'Paper_12_ML.pdf',
      'Paper_13_RF.pdf',
      'Paper_14_XGB.pdf',
      'Paper_15_MaxEnt.pdf',
      'Paper_16_WOE.pdf',
    ];

    const articles: Article[] = testFilenames.map((fname, idx) => ({
      id: `vault-art-${idx + 1}`,
      projectId: tempProjectId,
      original_filename: fname,
      sourceFileName: fname,
      title: `Different Article Title ${idx + 1} About Hydrology`,
      authors: [`Researcher${idx + 1}, A.`],
      year: 2024,
      journal: 'Hydrology Research',
      doi: `10.1234/hydro.2024.${idx + 1}`,
      abstract: `Empirical study #${idx + 1}`,
      sourceDatabase: 'Manual',
      screeningStage: idx % 2 === 0 ? 'final_included' : 'excluded',
      decision: idx % 2 === 0 ? 'include' : 'exclude',
      evidenceCitations: [],
    }));

    const missingPdfArt: Article = {
      id: 'vault-art-missing',
      projectId: tempProjectId,
      original_filename: 'missing_paper.pdf',
      sourceFileName: 'missing_paper.pdf',
      title: 'Article Without Binary Payload',
      authors: ['Absent, B.'],
      year: 2023,
      journal: 'Hydrology Research',
      abstract: 'No PDF uploaded.',
      sourceDatabase: 'Manual',
      screeningStage: 'title_abstract',
      decision: 'unscreened',
      evidenceCitations: [],
    };
    articles.push(missingPdfArt);

    // Create temp project via POST /api/projects
    const createRes = await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: {
          id: tempProjectId,
          title: 'Automated Verification Temp Review',
          databaseFolderName: tempProjectId,
          discipline: 'Hydrology',
          publicationYears: '2020-2025',
          picoc: { population: 'P', intervention: 'I', comparison: 'C', outcome: 'O', context: 'C' },
          inclusionCriteria: [],
          standardExclusionReasons: ['Wrong study area'],
          searchStrings: [],
          articles,
        },
      }),
    });
    assert.strictEqual(createRes.status, 200, 'Failed to create temp test project');

    // Upload real distinct binary buffers for all 16 PDFs
    const expectedBuffers = new Map<string, { origName: string; buf: Buffer; hash: string }>();
    for (let i = 0; i < testFilenames.length; i++) {
      const art = articles[i];
      const origName = testFilenames[i];
      const buf = makePdfBuffer(`${art.id}::${origName}`);
      const hash = sha256(buf);
      expectedBuffers.set(art.id, { origName, buf, hash });

      const upRes = await fetch(
        `${BASE_URL}/api/projects/${encodeURIComponent(tempProjectId)}/articles/${encodeURIComponent(art.id)}/pdf-upload`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/pdf',
            'X-Original-Filename': encodeURIComponent(origName),
          },
          body: new Uint8Array(buf),
        }
      );
      assert.strictEqual(upRes.status, 200, `Upload failed for ${art.id}`);
      const upJson: any = await upRes.json();
      assert.strictEqual(upJson.article.original_filename, origName, 'Server altered original_filename on upload!');
      assert.strictEqual(upJson.pdfStorage?.storage_status, 'stored_disk');
      assert.strictEqual(upJson.pdfStorage?.file_hash, hash);
    }
    console.log('  [PASS] 2. Uploaded 16 PDFs to disk vault with SHA-256 verification & exact filenames');

    // Move screening stage & run metadata sync via PUT /api/projects/:id/articles, then verify filename persists unchanged
    const syncedArt0 = applyMetadataCorrectionWithCitationSync(
      {
        ...articles[0],
        screeningStage: 'excluded',
        decision: 'exclude',
      },
      { title: 'Completely Changed Academic Title After Crossref Sync', journal: 'Nature Water' },
      'crossref',
      'Testing filename immutability'
    );
    const putArtsRes = await fetch(`${BASE_URL}/api/projects/${encodeURIComponent(tempProjectId)}/articles`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articles: [syncedArt0, ...articles.slice(1)] }),
    });
    assert.strictEqual(putArtsRes.status, 200, 'PUT articles failed');

    // Individual GET download of "## Results for Included Studies .pdf"
    const dl0Res = await fetch(
      `${BASE_URL}/api/projects/${encodeURIComponent(tempProjectId)}/articles/${encodeURIComponent(articles[0].id)}/pdf`
    );
    assert.strictEqual(dl0Res.status, 200, 'Individual PDF export failed');
    const cdHeader = dl0Res.headers.get('content-disposition') || '';
    const xOrigHeader = decodeURIComponent(dl0Res.headers.get('x-original-filename') || '');
    assert.strictEqual(xOrigHeader, '## Results for Included Studies .pdf');
    assert.ok(cdHeader.includes(encodeURIComponent('## Results for Included Studies .pdf').replace(/['()*!]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)));
    const dl0Buf = Buffer.from(await dl0Res.arrayBuffer());
    assert.strictEqual(sha256(dl0Buf), expectedBuffers.get(articles[0].id)!.hash, 'Individual PDF bytes corrupted!');
    console.log('  [PASS] 3. Individual original PDF download preserved exact name & SHA-256 after metadata/screening changes');

    // Export readiness check (16 ready + 1 missing binary)
    const allIds = articles.map((a) => a.id);
    const sumRes = await fetch(`${BASE_URL}/api/projects/${encodeURIComponent(tempProjectId)}/pdfs/export-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleIds: allIds, fetchRemoteIfMissing: false }),
    });
    assert.strictEqual(sumRes.status, 200);
    const sumJson: any = await sumRes.json();
    assert.strictEqual(sumJson.readyCount, 16);
    assert.strictEqual(sumJson.failedCount, 1);
    assert.strictEqual(sumJson.failedFiles[0].articleId, 'vault-art-missing');

    // Bulk ZIP export including all 17 (16 valid + 1 missing)
    const zipRes = await fetch(`${BASE_URL}/api/projects/${encodeURIComponent(tempProjectId)}/pdfs/export-zip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        articleIds: allIds,
        archiveName: 'spec-b-bulk-check.zip',
        fetchRemoteIfMissing: false,
      }),
    });
    assert.strictEqual(zipRes.status, 200, 'Bulk ZIP export failed');
    const summaryHeaderB64 = zipRes.headers.get('x-pdf-export-summary') || '';
    assert.ok(summaryHeaderB64, 'Missing X-PDF-Export-Summary header');
    const exportSummary = JSON.parse(Buffer.from(summaryHeaderB64, 'base64').toString('utf8'));
    assert.strictEqual(exportSummary.exportedCount, 16);
    assert.strictEqual(exportSummary.failedCount, 1);
    assert.strictEqual(exportSummary.failedFiles[0].articleId, 'vault-art-missing');

    // Extract & verify every single entry in the ZIP
    const zipBuf = Buffer.from(await zipRes.arrayBuffer());
    const loadedZip = await JSZip.loadAsync(zipBuf);
    const zipEntries = Object.keys(loadedZip.files);
    assert.strictEqual(zipEntries.length, 16, `Expected 16 ZIP files, found ${zipEntries.length}`);
    assert.ok(zipEntries.includes('## Results for Included Studies .pdf'), 'Special symbol+trailing space filename missing from ZIP');
    assert.ok(zipEntries.includes('Study.pdf'), 'First Study.pdf missing');
    assert.ok(zipEntries.includes('Study (2).pdf'), 'Second Study.pdf collision suffix missing');
    assert.ok(
      zipEntries.includes('Study (2) (2).pdf') || zipEntries.includes('Study (3).pdf'),
      `Third Study collision file did not get non-overwriting suffix. Entries: ${zipEntries.join(', ')}`
    );

    // Verify exact SHA-256 byte identity of every extracted file in ZIP
    for (const exportedMeta of exportSummary.exportedFiles) {
      const entry = loadedZip.file(exportedMeta.zipFilename);
      assert.ok(entry, `Missing ZIP entry for ${exportedMeta.zipFilename}`);
      const extractedBytes = Buffer.from(await entry.async('nodebuffer'));
      const expected = expectedBuffers.get(exportedMeta.articleId);
      assert.ok(expected, `Unexpected articleId in ZIP summary: ${exportedMeta.articleId}`);
      assert.strictEqual(
        sha256(extractedBytes),
        expected.hash,
        `Byte hash mismatch inside ZIP for ${exportedMeta.zipFilename}`
      );
    }
    console.log('  [PASS] 4. Bulk ZIP export (16 PDFs + collision suffixes + partial missing summary) verified with JSZip SHA-256');

    // Negative test: requesting ONLY missing_binary article -> HTTP 422 explicit error
    const failOnlyRes = await fetch(`${BASE_URL}/api/projects/${encodeURIComponent(tempProjectId)}/pdfs/export-zip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleIds: ['vault-art-missing'], fetchRemoteIfMissing: false }),
    });
    assert.strictEqual(failOnlyRes.status, 422, 'Expected HTTP 422 when 0 PDFs exist to package');
    const failOnlyJson: any = await failOnlyRes.json();
    assert.strictEqual(failOnlyJson.summary.failedCount, 1);
    console.log('  [PASS] 5. Zero-available bulk export returns HTTP 422 with explicit missing-binary report');
  } finally {
    // Clean up ONLY the temp review folder created by this test
    await fetch(`${BASE_URL}/api/projects/${encodeURIComponent(tempProjectId)}`, {
      method: 'DELETE',
    }).catch(() => {});
    const remainingFolders = fs.existsSync(dbReviewsRoot) ? fs.readdirSync(dbReviewsRoot) : [];
    assert.ok(
      !remainingFolders.includes(tempProjectId),
      `Temp test folder ${tempProjectId} was not cleaned up`
    );
    for (const existing of preExistingFolders) {
      assert.ok(
        remainingFolders.includes(existing),
        `CRITICAL: Pre-existing review folder "${existing}" was modified or removed!`
      );
    }
    console.log('  [PASS] 6. Temp test review folder cleaned up; pre-existing database/reviews/ untouched');
  }
}

async function main() {
  try {
    await runSpecATests();
    await runSpecBTests();
    console.log('\nALL SPEC A & SPEC B AUTOMATED VERIFICATION TESTS PASSED.\n');
  } catch (err) {
    console.error('\nTEST FAILURE:', err);
    process.exit(1);
  }
}

main();
