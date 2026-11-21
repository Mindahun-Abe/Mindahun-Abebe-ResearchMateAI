import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  Download,
  FileText,
  Printer,
  Search,
  X,
} from 'lucide-react';

export interface DocumentationStep {
  title: string;
  detail: string;
}

export interface DocumentationSection {
  id: string;
  number: string;
  category:
    | 'Setup & Protocol'
    | 'Retrieval & Screening'
    | 'Appraisal & Synthesis'
    | 'Reporting, Backup & Plans';
  title: string;
  summary: string;
  targetTab?: string;
  targetTabLabel?: string;
  whenToUse: string;
  steps: DocumentationStep[];
  keyCapabilities: string[];
  tipsAndSafeguards: string[];
}

export const SLR_DOCUMENTATION_SECTIONS: DocumentationSection[] = [
  {
    id: 'getting-started',
    number: '01',
    category: 'Setup & Protocol',
    title: 'Workspace Setup, Review Folders & Auto-Save',
    summary:
      'Create isolated systematic review folders, switch between projects cleanly, and verify disk and cloud auto-save protection.',
    targetTab: 'folders',
    targetTabLabel: 'Open Saved Folders',
    whenToUse:
      'Start here whenever launching a new systematic literature review or switching between distinct research topics.',
    steps: [
      {
        title: 'Create a New Blank Review or Select Active Review',
        detail:
          'Click "+ New Review (Manual Blank)" on the Dashboard or top bar to initialize a clean project with your title, discipline, review type (SLR, Scoping, Rapid, Meta-Analysis, Umbrella), and framework (PICOC, PICO, PECO, PCC, SPIDER, SPICE, PICOS, CIMO). Switch reviews anytime from the top project dropdown or the Saved Folders tab.',
      },
      {
        title: 'Strict Folder & Article Partitioning',
        detail:
          'Each review writes to its own folder under the local database directory (project.json, articles.json, workbench_state.json, and protocol_vault.json). Articles imported into one review never leak into another review.',
      },
      {
        title: 'Verify Continuous Auto-Save',
        detail:
          'Every edit triggers instant browser vault caching and debounced server disk persistence. Before closing or refreshing, pending edits flush automatically via keepalive so recent work is preserved.',
      },
      {
        title: 'Manage Folder Names & Manual Save',
        detail:
          'Inside Saved Folders, you can rename the disk folder independently of your formal manuscript title, push an explicit Save Changes sync, or delete unneeded reviews.',
      },
    ],
    keyCapabilities: [
      'Isolated per-review disk folders (project.json, articles.json, workbench_state.json)',
      'Auto-save status indicator on the Dashboard banner',
      'Offline browser cache with automatic reconciliation when reconnecting',
    ],
    tipsAndSafeguards: [
      'Never store sensitive API keys inside review titles or custom notes; server routes handle model keys safely.',
      'Use "Backup Review (.json)" on the Dashboard before major bulk deletions to keep a portable single-file archive.',
    ],
  },
  {
    id: 'protocol-framework',
    number: '02',
    category: 'Setup & Protocol',
    title: 'Protocol & Framework (PICOC, RQs, Rules, Exclusions & Boolean)',
    summary:
      'Configure your five core protocol pillars, edit them anytime without losing existing work, and manage disruption-proof checkpoints.',
    targetTab: 'picoc',
    targetTabLabel: 'Open Protocol & Framework',
    whenToUse:
      'Define and refine your research scope, questions, eligibility rules, exclusion codes, and multi-database search queries before and during screening.',
    steps: [
      {
        title: '1. Configure Framework Matrix (PICOC / PICO / PECO / SPIDER / etc.)',
        detail:
          'Select your synthesis methodology, PRISMA reporting standard (PRISMA 2020, PRISMA-ScR, Cochrane, Campbell), and analytical focus. Edit Population, Intervention, Comparison, Outcome, and Context fields directly in place without deleting rows.',
      },
      {
        title: '2. Author & Edit SLR Research Questions (RQ1–RQn)',
        detail:
          'Add, revise, or reorder your structured research questions along with the primary evidence required to answer each question during extraction and synthesis.',
      },
      {
        title: '3. Maintain the Explicit Eligibility Rules Matrix',
        detail:
          'Define explicit Inclusion and Exclusion criteria per dimension (Geography, Population, Modeling/Methodology, Validation Metrics, Timeframe, Document Type). Click "Sync Rules to Screening Engine" so automated evaluation uses your updated criteria immediately.',
      },
      {
        title: '4. Standardize PRISMA Full-Text Exclusion Reasons',
        detail:
          'Maintain canonical exclusion reason labels plus borderline decision guidance for reviewers so PRISMA 2020 full-text attrition counts aggregate cleanly.',
      },
      {
        title: '5. Build Multi-Database Boolean Search Syntax',
        detail:
          'Draft your master Boolean query and customize database-specific syntax overrides for Scopus, Web of Science, PubMed, ScienceDirect, IEEE Xplore, and Google Scholar.',
      },
      {
        title: '6. Use the Disruption-Proof Protocol & Framework Vault',
        detail:
          'Click "Save Checkpoint" to record a named snapshot across browser + server vaults. Open "Checkpoints & Restore" to roll back any of the five protocol pillars without altering imported articles, or use Export/Import JSON for portable protocol sharing.',
      },
    ],
    keyCapabilities: [
      'Non-destructive edits across all 5 protocol pillars with schema-upgrade merge protection',
      'Rolling local & server checkpoint history (protocol_vault.json) independent of articles',
      'Master Boolean query + per-database syntax overrides (Scopus, WoS, PubMed, ScienceDirect, IEEE, Scholar)',
    ],
    tipsAndSafeguards: [
      'Protocol edits never overwrite or wipe imported articles when you save a checkpoint or restore a prior protocol version.',
      'Re-sync eligibility rules after major edits to re-score borderline papers consistently.',
    ],
  },
  {
    id: 'protocol-builder-16',
    number: '03',
    category: 'Setup & Protocol',
    title: '16-Step Intelligent Protocol Builder (PRISMA-P / PROSPERO)',
    summary:
      'Generate, validate, version, and activate a complete 16-stage review protocol aligned with PRISMA-P, PRISMA-S, and Cochrane standards.',
    targetTab: 'protocol_builder',
    targetTabLabel: 'Open 16-Step Protocol Builder',
    whenToUse:
      'Use when drafting a formal thesis/journal protocol or converting a research topic into a structured multi-database strategy.',
    steps: [
      {
        title: 'Progress Through Guided Steps 1–16',
        detail:
          'Complete topic formulation, rationale, framework decomposition, search strategy design, PRISMA-S search reporting, screening calibration, risk-of-bias tool selection, synthesis plan, and dissemination timeline.',
      },
      {
        title: 'Run Syntax & Consistency Validation',
        detail:
          'Check parentheses balance, operator precedence (AND/OR/NOT), and alignment between research questions and planned data extraction variables.',
      },
      {
        title: 'Activate Protocol into Your Active Review',
        detail:
          'Click "Activate in Project" to push generated PICOC fields, RQs, inclusion/exclusion rules, and Boolean queries straight into your active review workspace with version numbering.',
      },
    ],
    keyCapabilities: [
      '16 structured stages covering PRISMA-P and PRISMA-S transparency',
      'Live protocol versioning and one-click activation into the active workbench',
    ],
    tipsAndSafeguards: [
      'Activation merges into your project safely via the Protocol Vault so prior custom rules are preserved or checkpointed first.',
    ],
  },
  {
    id: 'geographic-eligibility',
    number: '04',
    category: 'Setup & Protocol',
    title: 'Multi-Scale Geographic Eligibility & Boundary File Screening',
    summary:
      'Restrict screening strictly to Global, Continental, Country, Regional, Zonal, Woreda, or Watershed study areas using dropdowns or uploaded spatial boundary files.',
    targetTab: 'picoc',
    targetTabLabel: 'Configure Geographic Scope',
    whenToUse:
      'Essential when your review targets a specific country, basin, or administrative unit (for example, Ethiopia or a specific watershed) and must exclude out-of-region studies (such as China, Brazil, or Iran).',
    steps: [
      {
        title: 'Select Target Geographic Scale & Hierarchy',
        detail:
          'Choose Global, Continental, Country, Regional, Zonal, Woreda, or Watershed. Pick continents, countries, regions, zones, woredas, or watershed names from cascading dropdown lists or enter custom local place names.',
      },
      {
        title: 'Optionally Upload a Study Area Map / Boundary File',
        detail:
          'Upload a study area boundary file (.geojson, .json, .kml, .csv with coordinates/place columns, or .shp/.zip metadata) so place names and bounding coordinates extract automatically.',
      },
      {
        title: 'Connect Geographic Sensing to Screening & PRISMA Reasons',
        detail:
          'During screening and fast batch screening, the engine cross-checks titles, abstracts, study area text, coordinates, and full text to connect each paper to its true study location and automatically flag out-of-bounds studies with explicit geographic exclusion reasons.',
      },
    ],
    keyCapabilities: [
      'Cascading dropdown selectors (Continent -> Country -> Region -> Zone -> Woreda -> Watershed)',
      'Study area boundary file ingestion (.geojson, .csv, .kml, .shp/.zip)',
      'Interpretive geographic outcome summary fed directly into PRISMA eligibility reporting',
    ],
    tipsAndSafeguards: [
      'Avoid leaving Geographic Target Scale on "Any" when performing country- or basin-specific reviews so out-of-region articles are filtered out reliably.',
    ],
  },
  {
    id: 'importing-articles',
    number: '05',
    category: 'Retrieval & Screening',
    title: 'Importing Literature (Bulk Files, Manual Entry & Online Databases)',
    summary:
      'Populate your Article Library from RIS, BibTeX, CSV/TSV, EndNote XML, PDFs, manual metadata forms, Crossref DOI lookup, or federated database search.',
    targetTab: 'library',
    targetTabLabel: 'Open Article Library',
    whenToUse:
      'Run after finalizing your search strings to bring database exports or local full-text PDFs into your review folder.',
    steps: [
      {
        title: 'Bulk File Import (RIS, BibTeX, CSV, PDFs)',
        detail:
          'Click "Bulk Import" from the header or Dashboard. Upload multiple exports from Scopus, Web of Science, PubMed, ScienceDirect, or local PDF papers. Multi-page PDF text extracts automatically for full-text screening.',
      },
      {
        title: 'Online Database & Crossref Retrieval',
        detail:
          'Use the Online Search tab inside Bulk Import (or Crossref DOI Lookup in Article Library) to fetch real bibliographic records from OpenAlex, Crossref, Europe PMC, arXiv, or PubMed.',
      },
      {
        title: 'Direct Add inside Any Module & Manual Paper Entry',
        detail:
          'Use "+ Manual Paper" to type a paper record manually, or drop RIS/BibTeX/CSV/PDF files into the Module Workbench bar inside any tab with optional auto-screening.',
      },
      {
        title: 'Deleted Online Archive Recovery',
        detail:
          'If records fetched from online search are later removed via module resets, open "Deleted Online Archive" in the library to selectively restore any needed papers.',
      },
    ],
    keyCapabilities: [
      'Supports RIS, BibTeX (.bib), CSV/TSV, JSON, TXT, and multi-page PDF full-text parsing',
      'Source database provenance tracking for PRISMA identification counts',
      'Deleted Online Archive safety net for recoverable online-search removals',
    ],
    tipsAndSafeguards: [
      'Always tag the correct Source Database during bulk import so PRISMA Identification boxes break down records per database accurately.',
    ],
  },
  {
    id: 'duplicate-detection',
    number: '06',
    category: 'Retrieval & Screening',
    title: 'Duplicate Detection & Cluster Resolution',
    summary:
      'Identify exact DOI matches and fuzzy title/author overlaps across multi-database exports and merge or resolve clusters safely.',
    targetTab: 'duplicates',
    targetTabLabel: 'Open Duplicate Detection',
    whenToUse:
      'Always run right after importing records from two or more bibliographic databases, before title screening begins.',
    steps: [
      {
        title: 'Scan for Exact DOI & Normalized Title Matches',
        detail:
          'Open Duplicate Detection to inspect automatically grouped duplicate clusters along with similarity confidence and source database labels.',
      },
      {
        title: 'Compare Records Side-by-Side',
        detail:
          'Inspect abstracts, years, and DOI completeness across records in each cluster so the richest primary record (e.g., the one with a full abstract or PDF attached) is retained.',
      },
      {
        title: 'Resolve & Feed PRISMA Deduplication Counts',
        detail:
          'Confirm duplicate marks so duplicate records are excluded from screening queues and counted cleanly in PRISMA Box 2 ("Duplicate records removed before screening").',
      },
    ],
    keyCapabilities: [
      'DOI-first + fuzzy title deduplication across Scopus, WoS, PubMed, and manual imports',
      'Side-by-side record inspection preserving richest abstract/PDF metadata',
    ],
    tipsAndSafeguards: [
      'Do not delete records permanently until deduplication is verified; marking duplicates preserves full PRISMA audit numbers.',
    ],
  },
  {
    id: 'title-and-batch-screening',
    number: '07',
    category: 'Retrieval & Screening',
    title: 'Title Screening & High-Throughput Fast Batch Screener',
    summary:
      'Rapidly triage large libraries by title/abstract using keyboard hotkeys, compound domain phrase matching, or the Fast Batch Screener.',
    targetTab: 'title_screening',
    targetTabLabel: 'Open Title Screening',
    whenToUse:
      'Best for first-pass triage across hundreds of imported citations before deep full-text assessment.',
    steps: [
      {
        title: 'Rapid Title & Abstract Triage',
        detail:
          'Open Title Screening to review highlighted PICOC/methodology keywords, geographic terms, and compound domain phrases (e.g., matching "gully erosion susceptibility" alongside validation models and conditioning factors rather than isolated words).',
      },
      {
        title: 'Launch Fast Batch Screener',
        detail:
          'Click "Fast Batch Screener" from the Dashboard or Article Library to run deterministic + rule-calibrated batch evaluation across unscreened records, producing include/exclude/uncertain recommendations with transparent rationale.',
      },
      {
        title: 'Star Priority Benchmark Studies',
        detail:
          'Click the star icon on pivotal papers so they appear in the Interesting tab and Dashboard Priority Studies panel for deeper review.',
      },
    ],
    keyCapabilities: [
      'Compound multi-word domain phrase & methodology/application/validation coupling',
      'Fast Batch Screener excluding archived deleted items automatically',
      'Priority starring for key benchmark papers',
    ],
    tipsAndSafeguards: [
      'Review "Uncertain / Borderline" decisions in Full-Text Eligibility rather than discarding ambiguous abstracts early.',
    ],
  },
  {
    id: 'full-text-screening',
    number: '08',
    category: 'Retrieval & Screening',
    title: 'Full-Text Eligibility, Query Q&A Rescan & Iteration Review',
    summary:
      'Evaluate full-text papers page by page, run natural-language Query Q&A rescans, and include or exclude processed papers non-destructively.',
    targetTab: 'screening',
    targetTabLabel: 'Open Eligibility & Screening',
    whenToUse:
      'Use after title/abstract triage to verify full-text eligibility, inspect pinned evidence pages, or re-screen processed papers against refined criteria.',
    steps: [
      {
        title: 'Inspect Full Text & Multi-Scale Rule Checks',
        detail:
          'Open any record in Eligibility & Screening to view full PDF text/pages, geographic study-site checks, inclusion matrix alignment, and standard exclusion reason selectors.',
      },
      {
        title: 'Include / Exclude / Uncertain Iteration Review (Never Delete)',
        detail:
          'Toggle decisions directly between Include, Exclude (with PRISMA reason), and Uncertain during iterative calibration without deleting records from your library.',
      },
      {
        title: 'Run Query Q&A Rescans from Any Module Bar',
        detail:
          'Enter a targeted screening or extraction question in the Query Q&A bar (present across modules) to rescan active non-duplicate papers, store cited Q&A audit cards, and optionally apply screening updates.',
      },
    ],
    keyCapabilities: [
      'Non-destructive status iteration between Include, Exclude, and Uncertain',
      'Query Q&A Rescan persisted in workbench_state.json per module',
      'Standardized PRISMA exclusion reason assignment',
    ],
    tipsAndSafeguards: [
      'Assign an explicit Standard Exclusion Reason whenever marking a full-text paper as Excluded so PRISMA Box 5 stays 100% consistent.',
    ],
  },
  {
    id: 'evidence-extraction',
    number: '09',
    category: 'Appraisal & Synthesis',
    title: 'Record Evidence & Structured Extraction Matrix',
    summary:
      'Extract and edit structured empirical fields (models, conditioning factors, sensors, validation metrics, latency, study region) across all included studies.',
    targetTab: 'extraction',
    targetTabLabel: 'Open Record Evidence',
    whenToUse:
      'Use once studies pass full-text inclusion to build your standardized evidence table prior to quality appraisal and quantitative synthesis.',
    steps: [
      {
        title: 'Review Auto-Extracted & Manual Matrix Columns',
        detail:
          'Inspect study design, geographic site, conditioning factors/predictors, modeling algorithms, validation strategies (e.g., spatial block CV vs. random split), AUC-ROC/RMSE/accuracy metrics, and turnaround latency.',
      },
      {
        title: 'Edit Cells Inline or Re-Extract',
        detail:
          'Update any extracted value directly in the matrix; changes auto-save into your active folder and immediately feed Results Synthesis and Meta-Analysis.',
      },
      {
        title: 'Export or Proceed to Meta-Analysis',
        detail:
          'Jump directly from the Extraction Matrix into Quantitative Synthesis once numeric outcomes and sample sizes are verified.',
      },
    ],
    keyCapabilities: [
      'Structured extraction table aligned to your Research Questions (RQ1–RQn)',
      'Tracks validation rigor, spatial autocorrelation checks, and operational latency',
    ],
    tipsAndSafeguards: [
      'Verify units and effect directions (e.g., AUC 0–1 vs. percentage 0–100) before running pooled quantitative models.',
    ],
  },
  {
    id: 'quality-appraisal',
    number: '10',
    category: 'Appraisal & Synthesis',
    title: '13-Point Critical Appraisal & Risk-of-Bias Assessment',
    summary:
      'Score included papers across 13 structured methodological criteria with traffic-light risk-of-bias summaries and radar visualization.',
    targetTab: 'appraisal',
    targetTabLabel: 'Open Quality Appraisal',
    whenToUse:
      'Perform on all finally included studies to document methodological quality and sensitivity/sub-group reliability.',
    steps: [
      {
        title: 'Score Each Study on the 13-Point Worksheet',
        detail:
          'Evaluate clarity of aims, sampling/study-area rigor, predictor independence, validation protocol (e.g., spatial CV leakage control), confounding management, and reproducibility.',
      },
      {
        title: 'Inspect Traffic-Light & Overall Score',
        detail:
          'Each criterion records Low / Moderate / High risk or Yes / Partial / No with reviewer justification notes, automatically computing overall appraisal score.',
      },
      {
        title: 'Compare Quality Across Studies',
        detail:
          'Switch seamlessly between included papers using the article selector to complete quality assessment for the entire synthesis cohort.',
      },
    ],
    keyCapabilities: [
      '13-criterion appraisal worksheet with criterion-level justification notes',
      'Live progress counter on Dashboard KPI grid and PRISMA/Proposal reports',
    ],
    tipsAndSafeguards: [
      'Document why spatial or temporal validation scored High Risk when models rely solely on random split sampling over clustered geospatial data.',
    ],
  },
  {
    id: 'prisma-flow',
    number: '11',
    category: 'Appraisal & Synthesis',
    title: 'PRISMA 2020 Interactive Flow Diagram (Page et al., 2021)',
    summary:
      'Inspect live identification, deduplication, screening, retrieval, and full-text exclusion counts with clickable paper drill-down.',
    targetTab: 'prisma',
    targetTabLabel: 'Open PRISMA 2020 Flow',
    whenToUse:
      'Use throughout screening to audit review attrition and at completion to export your publication-ready PRISMA 2020 diagram.',
    steps: [
      {
        title: 'Audit Live Flow Boxes & Exclusion Breakdown',
        detail:
          'Verify counts from Identification (per database + registers), Duplicates removed, Records screened, Reports sought/not retrieved, Reports assessed for eligibility, Full-text excluded with itemized reasons, and Final Studies Included.',
      },
      {
        title: 'Inspect Interpretive Geographic Eligibility Summary',
        detail:
          'View geographic eligibility attrition alongside overall PRISMA counts to justify spatial scoping transparently.',
      },
      {
        title: 'Click Counts to Re-Review Records',
        detail:
          'Drill into excluded or included lists and adjust decisions non-destructively without losing any citation metadata.',
      },
    ],
    keyCapabilities: [
      'Strict PRISMA 2020 compliance (Page et al., 2021)',
      'Itemized full-text exclusion reasons synced dynamically from Screening & Protocol',
    ],
    tipsAndSafeguards: [
      'Confirm zero "Unscreened" records remain before freezing your final PRISMA flow counts for manuscript submission.',
    ],
  },
  {
    id: 'results-and-meta',
    number: '12',
    category: 'Appraisal & Synthesis',
    title: 'Results Synthesis & Quantitative Meta-Analysis Engine',
    summary:
      'Generate narrative cross-tabulations, descriptive statistics, Fixed/Random-Effects pooled models, heterogeneity (I², Q, tau²), and 8 SVG scientific plots.',
    targetTab: 'quant_synthesis',
    targetTabLabel: 'Open Quant / Meta-Analysis',
    whenToUse:
      'Open Results for Included first for structured thematic tables, then launch Quantitative Synthesis for pooled statistical modeling and plots.',
    steps: [
      {
        title: 'Qualitative & Narrative Cross-Tabulation (Results Tab)',
        detail:
          'Examine included study summaries mapped directly to Research Questions, study regions, and benchmark findings.',
      },
      {
        title: 'Select Effect-Size Metric & Statistical Model',
        detail:
          'Inside Quantitative Synthesis, pick Fixed-Effects (Inverse-Variance) or Random-Effects (DerSimonian-Laird / REML), inspect study weights, 95% confidence intervals, and heterogeneity statistics (Q, I², tau²).',
      },
      {
        title: 'Inspect 8 Publication SVG Plots & Subgroup Sensitivity',
        detail:
          'Explore Forest plots, Funnel plots (publication bias / Egger checks), Baujat / influence diagnostics, subgroup comparisons, and export figures cleanly.',
      },
    ],
    keyCapabilities: [
      'Dual Qualitative Thematic & Quantitative FE/RE Meta-Analysis engine',
      '8 interactive SVG scientific plots with numeric audit trail',
    ],
    tipsAndSafeguards: [
      'Ensure outcomes share a compatible scale (correlation, Fisher z, log-odds, standardized mean difference, or proportion) before pooling.',
    ],
  },
  {
    id: 'notebooklm-and-suite',
    number: '13',
    category: 'Reporting, Backup & Plans',
    title: 'NotebookLM Studio, Two-Host Audio Overview & AI/Maps/3D Suite',
    summary:
      'Bundle included PDFs for NotebookLM, generate cited research briefings & two-host audio discussions, and open the integrated Maps, 3D & Cloud Suite.',
    targetTab: 'briefing',
    targetTabLabel: 'Open NotebookLM & Audio',
    whenToUse:
      'Use after screening/extraction to synthesize insights conversationally, prepare audio briefings, or inspect study-area geography on Google Maps.',
    steps: [
      {
        title: 'Export Included PDFs & Generate Briefing',
        detail:
          'Inside NotebookLM & Audio, prepare your curated included cohort packet for notebook.google.com, ask unconstrained cited synthesis questions, and generate a two-host audio briefing script/playback.',
      },
      {
        title: 'Open AI, Maps, 3D & Cloud Suite (Dashboard Button)',
        detail:
          'Launch the integrated suite from the Dashboard to access Google Maps study-site mapping, Cloud Sync logs, Voice/Media tools, and interactive 3D field visualizations.',
      },
    ],
    keyCapabilities: [
      'Curated evidence briefing & two-host audio overview persisted in workbench state',
      'Integrated Cloud Sync, Maps study-area viewer, and 3D scientific field visualization',
    ],
    tipsAndSafeguards: [
      'Verify citations produced in briefings against original article pages in your Evidence Extraction Matrix before publishing.',
    ],
  },
  {
    id: 'proposal-export-backup',
    number: '14',
    category: 'Reporting, Backup & Plans',
    title: 'Academic Proposal Generator, Export Hub & Full JSON Backup',
    summary:
      'Assemble a 9-part publication-ready SLR manuscript/proposal with PRISMA checklist and export full datasets in JSON, RIS, BibTeX, CSV, and Word formats.',
    targetTab: 'proposal',
    targetTabLabel: 'Open Academic Proposal',
    whenToUse:
      'Use to draft your methods/results manuscript sections and create portable archives before sharing with co-authors or submitting to a journal.',
    steps: [
      {
        title: 'Generate 9-Section Proposal & Manuscript Draft',
        detail:
          'In Academic Proposal, compile Title, Abstract, Introduction, PICOC Objectives, PRISMA Methods, Eligibility Rules, Appraisal Strategy, Synthesis Results, and PRISMA 2020 27-Item Checklist populated from your live review.',
      },
      {
        title: 'Export Multi-Format Bundles in Export & Backup Hub',
        detail:
          'Download structured spreadsheets (CSV), reference manager files (RIS, BibTeX), formatted Word documents (.doc/.docx), or a full SLR JSON Bundle.',
      },
      {
        title: 'One-Click Dashboard Backup & Restore',
        detail:
          'Click "Backup Review (.json)" on the Dashboard banner anytime to flush disk saves and download a complete snapshot; use "Restore Backup" to reload an archive safely.',
      },
    ],
    keyCapabilities: [
      'Live-synced 9-section manuscript generator grounded in your real PRISMA & extraction data',
      'Full-fidelity JSON backup/restore + RIS, BibTeX, CSV, Word exports',
    ],
    tipsAndSafeguards: [
      'Module Reset controls inside each workbench tab let you clear Q&A scans or filtered outputs without touching your Protocol & Framework definitions.',
    ],
  },
  {
    id: 'plans-sync-account',
    number: '15',
    category: 'Reporting, Backup & Plans',
    title: 'Google Account Cloud Sync, Progressive Plans & Multi-Currency Billing',
    summary:
      'Sign in with Google to synchronize projects across devices, monitor online/offline sync status, and review progressive Scholar & Institutional Lab pricing.',
    whenToUse:
      'Use when collaborating across devices, deploying cloud backup, or upgrading from the Free plan to Student Scholar, Researcher Pro, Professional Lead, or Institutional Lab.',
    steps: [
      {
        title: 'Sign In & Monitor Sync Indicator',
        detail:
          'Use "Sign In" in the top bar to authenticate with Google. The header Sync button displays real-time status (Synced, Synchronizing, Offline, Sync Failed) and queued offline operations.',
      },
      {
        title: 'Understand Progressive Start-Up & Usage-Experience Plans',
        detail:
          'Paid tiers (Student Scholar, Researcher Pro, Professional Lead, Institutional Lab) start with an 80% Start-Up discount for Year 0–1, adjust +50% after 1 year of usage experience, and double (2×) after 2 years—while the Free Tier remains $0 / 0 ETB permanently.',
      },
      {
        title: 'Switch USD / ETB Currency & Manage Subscription',
        detail:
          'Open Plans in the top bar (or Website -> Pricing) to toggle between USD and ETB, review your current tenure stage, and manage invoices or Chapa/Stripe checkouts.',
      },
    ],
    keyCapabilities: [
      'Automatic offline queue flushing upon reconnection',
      'Multi-layer persistence: Browser Vault + Atomic Disk JSON + PostgreSQL Cloud Sync',
      'Transparent tenure pricing schedule (Year 0–1 Start-Up, Year 1–2, Year 2+)',
    ],
    tipsAndSafeguards: [
      'Your local folder data remains readable even offline; signing in later merges cloud and local changes non-destructively via Protocol Vault rules.',
    ],
  },
];

const CATEGORIES: DocumentationSection['category'][] = [
  'Setup & Protocol',
  'Retrieval & Screening',
  'Appraisal & Synthesis',
  'Reporting, Backup & Plans',
];

interface DocumentationDropdownProps {
  onNavigateTab: (tabId: string) => void;
  onOpenAddModal?: () => void;
  onCreateNewReview?: () => void;
  onOpenFastBatchScreener?: () => void;
}

export const DocumentationDropdown: React.FC<DocumentationDropdownProps> = ({
  onNavigateTab,
  onOpenAddModal,
  onCreateNewReview,
  onOpenFastBatchScreener,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState<string>(SLR_DOCUMENTATION_SECTIONS[0].id);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setModalOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return SLR_DOCUMENTATION_SECTIONS;
    return SLR_DOCUMENTATION_SECTIONS.filter((sec) => {
      const haystack = [
        sec.number,
        sec.title,
        sec.summary,
        sec.whenToUse,
        sec.category,
        ...sec.steps.map((s) => `${s.title} ${s.detail}`),
        ...sec.keyCapabilities,
        ...sec.tipsAndSafeguards,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [searchQuery]);

  const activeSection = useMemo(
    () =>
      filteredSections.find((s) => s.id === activeSectionId) ||
      filteredSections[0] ||
      SLR_DOCUMENTATION_SECTIONS[0],
    [filteredSections, activeSectionId]
  );

  const openDocumentationAt = (sectionId: string) => {
    setActiveSectionId(sectionId);
    setMenuOpen(false);
    setModalOpen(true);
  };

  const buildMarkdownManual = () => {
    const lines: string[] = [
      '# ResearchMate AI SLR — Complete User Documentation',
      '',
      'End-to-end guide covering all systematic literature review processes, PRISMA 2020 workflows, protocol protection, screening, extraction, appraisal, quantitative meta-analysis, exports, and account plans.',
      '',
    ];
    for (const sec of SLR_DOCUMENTATION_SECTIONS) {
      lines.push(`## ${sec.number}. ${sec.title}`);
      lines.push(`*Category:* ${sec.category}`);
      lines.push('');
      lines.push(sec.summary);
      lines.push('');
      lines.push(`**When to use:** ${sec.whenToUse}`);
      lines.push('');
      lines.push('### Step-by-Step Process');
      sec.steps.forEach((step, idx) => {
        lines.push(`${idx + 1}. **${step.title}** — ${step.detail}`);
      });
      lines.push('');
      lines.push('### Key Capabilities');
      sec.keyCapabilities.forEach((cap) => lines.push(`- ${cap}`));
      lines.push('');
      lines.push('### Safeguards & Best Practices');
      sec.tipsAndSafeguards.forEach((tip) => lines.push(`- ${tip}`));
      lines.push('');
      lines.push('---');
      lines.push('');
    }
    return lines.join('\n');
  };

  const handleDownloadMarkdown = () => {
    const md = buildMarkdownManual();
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ResearchMate_AI_SLR_User_Documentation.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(buildMarkdownManual());
      setCopiedMarkdown(true);
      setTimeout(() => setCopiedMarkdown(false), 2200);
    } catch {
      handleDownloadMarkdown();
    }
  };

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className={`px-3.5 py-2.5 text-xs font-semibold rounded-xl border transition-colors duration-150 inline-flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
            menuOpen
              ? 'bg-slate-800 border-teal-500/60 text-white'
              : 'bg-slate-900/90 hover:bg-slate-800 border-slate-700 text-slate-100'
          }`}
          title="Browse complete step-by-step documentation for every ResearchMate AI SLR process"
        >
          <BookOpen className="w-4 h-4 text-teal-400 shrink-0" />
          <span>SLR User Documentation</span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
              menuOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute left-0 md:left-auto md:right-0 mt-2 w-[min(90vw,420px)] bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2 bg-slate-900/70">
              <div>
                <p className="text-xs font-bold text-white">ResearchMate AI SLR Guide</p>
                <p className="text-[11px] text-slate-400 tabular-nums">
                  15 Workflow Chapters · End-to-End PRISMA 2020 Reference
                </p>
              </div>
              <button
                type="button"
                onClick={() => openDocumentationAt(SLR_DOCUMENTATION_SECTIONS[0].id)}
                className="px-2.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Open Full Manual
              </button>
            </div>

            <div className="max-h-[65vh] overflow-y-auto divide-y divide-slate-800/80">
              {CATEGORIES.map((category) => {
                const items = SLR_DOCUMENTATION_SECTIONS.filter((s) => s.category === category);
                return (
                  <div key={category} className="p-2.5">
                    <p className="px-2 pb-1.5 text-[11px] font-semibold text-slate-400">
                      {category}
                    </p>
                    <div className="space-y-0.5">
                      {items.map((sec) => (
                        <button
                          key={sec.id}
                          type="button"
                          role="menuitem"
                          onClick={() => openDocumentationAt(sec.id)}
                          className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-slate-900 transition-colors flex items-start justify-between gap-2.5 cursor-pointer group"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-100 group-hover:text-teal-300 transition-colors truncate">
                              <span className="font-mono tabular-nums text-slate-400 mr-1.5">
                                {sec.number}.
                              </span>
                              {sec.title}
                            </p>
                            <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                              {sec.summary}
                            </p>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-teal-400 shrink-0 mt-0.5" />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  handleDownloadMarkdown();
                }}
                className="text-slate-300 hover:text-white inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 text-teal-400" />
                <span>Download Manual (.md)</span>
              </button>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer whitespace-nowrap"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Full Interactive Documentation Reader Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
          onClick={() => setModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="ResearchMate AI SLR Complete Documentation"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-6xl h-[88vh] bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
          >
            {/* Modal Top Bar */}
            <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-900/70 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-teal-400 shrink-0">
                  <Compass className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-base font-bold text-white truncate">
                    ResearchMate AI SLR — Complete Process Documentation
                  </h2>
                  <p className="text-xs text-slate-400 truncate">
                    All 15 systematic review stages, safeguards, and workspace shortcuts
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyMarkdown}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  {copiedMarkdown ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied Markdown</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      <span>Copy All Docs</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadMarkdown}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5 text-teal-400" />
                  <span>Download .md</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="hidden sm:inline-flex px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium rounded-lg items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-400" />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  aria-label="Close documentation"
                  className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body Split: Left Index + Right Reader */}
            <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12">
              {/* Left Sidebar Chapter Navigation */}
              <aside className="md:col-span-4 lg:col-span-4 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-900/30 flex flex-col min-h-0 max-h-56 md:max-h-none">
                <div className="p-3 border-b border-slate-800">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search processes, PRISMA, Boolean, geo..."
                      className="w-full bg-slate-900 border border-slate-700 focus:border-teal-500 rounded-lg pl-8 pr-8 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        aria-label="Clear search"
                        className="absolute right-2 top-2 text-slate-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2.5 space-y-3">
                  {filteredSections.length === 0 ? (
                    <div className="p-4 text-center space-y-2">
                      <p className="text-xs text-slate-400">
                        No documentation chapters matched &ldquo;{searchQuery}&rdquo;.
                      </p>
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-lg cursor-pointer"
                      >
                        Reset Filter
                      </button>
                    </div>
                  ) : (
                    CATEGORIES.map((category) => {
                      const items = filteredSections.filter((s) => s.category === category);
                      if (items.length === 0) return null;
                      return (
                        <div key={category} className="space-y-1">
                          <p className="px-2 text-[11px] font-semibold text-slate-400">
                            {category}
                          </p>
                          {items.map((sec) => {
                            const isActive = sec.id === activeSection.id;
                            return (
                              <button
                                key={sec.id}
                                type="button"
                                onClick={() => setActiveSectionId(sec.id)}
                                className={`w-full text-left px-2.5 py-2 rounded-xl text-xs transition-colors flex items-start gap-2 cursor-pointer ${
                                  isActive
                                    ? 'bg-teal-600/20 text-white border border-teal-500/40'
                                    : 'text-slate-300 hover:bg-slate-900 border border-transparent'
                                }`}
                              >
                                <span
                                  className={`font-mono tabular-nums text-[11px] mt-0.5 shrink-0 ${
                                    isActive ? 'text-teal-300 font-bold' : 'text-slate-500'
                                  }`}
                                >
                                  {sec.number}
                                </span>
                                <span className="font-medium leading-snug">{sec.title}</span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })
                  )}
                </div>
              </aside>

              {/* Right Content Panel */}
              <main className="md:col-span-8 lg:col-span-8 overflow-y-auto p-5 sm:p-7 space-y-6">
                <div className="space-y-2 pb-5 border-b border-slate-800">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="font-mono tabular-nums text-teal-400 font-semibold">
                      Chapter {activeSection.number}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{activeSection.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{activeSection.steps.length} Steps</span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-white leading-snug">
                    {activeSection.title}
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed max-w-3xl">
                    {activeSection.summary}
                  </p>

                  <div className="pt-2 flex flex-wrap items-center gap-2.5">
                    {activeSection.targetTab && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalOpen(false);
                          onNavigateTab(activeSection.targetTab!);
                        }}
                        className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <span>{activeSection.targetTabLabel || 'Open Workspace Module'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {activeSection.id === 'getting-started' && onCreateNewReview && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalOpen(false);
                          onCreateNewReview();
                        }}
                        className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Create Blank Review Now
                      </button>
                    )}
                    {activeSection.id === 'importing-articles' && onOpenAddModal && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalOpen(false);
                          onOpenAddModal();
                        }}
                        className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Launch Bulk Importer
                      </button>
                    )}
                    {activeSection.id === 'title-and-batch-screening' && onOpenFastBatchScreener && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalOpen(false);
                          onOpenFastBatchScreener();
                        }}
                        className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Launch Fast Batch Screener
                      </button>
                    )}
                  </div>
                </div>

                {/* When to Use */}
                <section className="space-y-1.5">
                  <h4 className="text-xs font-semibold text-slate-400">When to Use This Process</h4>
                  <p className="text-sm text-slate-200 leading-relaxed bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                    {activeSection.whenToUse}
                  </p>
                </section>

                {/* Step-by-Step Procedure */}
                <section className="space-y-3">
                  <h4 className="text-xs font-semibold text-slate-400">Step-by-Step Procedure</h4>
                  <ol className="space-y-3">
                    {activeSection.steps.map((step, index) => (
                      <li
                        key={step.title}
                        className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex items-start gap-3.5"
                      >
                        <span className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700 text-teal-300 font-mono tabular-nums text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {index + 1}
                        </span>
                        <div className="space-y-1 min-w-0">
                          <h5 className="text-sm font-semibold text-white">{step.title}</h5>
                          <p className="text-xs sm:text-[13px] text-slate-300 leading-relaxed">
                            {step.detail}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>

                {/* Key Capabilities & Safeguards */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
                  <section className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 space-y-2.5">
                    <h4 className="text-xs font-semibold text-teal-300">Key Capabilities</h4>
                    <ul className="space-y-2 text-xs text-slate-300 leading-relaxed list-disc pl-4">
                      {activeSection.keyCapabilities.map((cap) => (
                        <li key={cap}>{cap}</li>
                      ))}
                    </ul>
                  </section>

                  <section className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 space-y-2.5">
                    <h4 className="text-xs font-semibold text-amber-300">
                      Safeguards &amp; Best Practices
                    </h4>
                    <ul className="space-y-2 text-xs text-slate-300 leading-relaxed list-disc pl-4">
                      {activeSection.tipsAndSafeguards.map((tip) => (
                        <li key={tip}>{tip}</li>
                      ))}
                    </ul>
                  </section>
                </div>

                {/* Chapter Footer Pagination */}
                <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
                  {(() => {
                    const idx = SLR_DOCUMENTATION_SECTIONS.findIndex((s) => s.id === activeSection.id);
                    const prev = idx > 0 ? SLR_DOCUMENTATION_SECTIONS[idx - 1] : null;
                    const next =
                      idx >= 0 && idx < SLR_DOCUMENTATION_SECTIONS.length - 1
                        ? SLR_DOCUMENTATION_SECTIONS[idx + 1]
                        : null;
                    return (
                      <>
                        <div>
                          {prev && (
                            <button
                              type="button"
                              onClick={() => setActiveSectionId(prev.id)}
                              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs text-slate-300 hover:text-white cursor-pointer"
                            >
                              ← {prev.number}. {prev.title.slice(0, 28)}
                              {prev.title.length > 28 ? '...' : ''}
                            </button>
                          )}
                        </div>
                        <div>
                          {next && (
                            <button
                              type="button"
                              onClick={() => setActiveSectionId(next.id)}
                              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs text-teal-300 hover:text-teal-200 cursor-pointer"
                            >
                              Next: {next.number}. {next.title.slice(0, 28)}
                              {next.title.length > 28 ? '...' : ''} →
                            </button>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </main>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
