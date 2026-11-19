import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from python_services.db_migrations import get_connection, migrate_db


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _bump_minor_version(current: str) -> str:
    parts = [p for p in str(current or "1.0").split(".") if p.isdigit()]
    if len(parts) >= 2:
        major = int(parts[0])
        minor = int(parts[1]) + 1
        return f"{major}.{minor}"
    if len(parts) == 1:
        return f"{int(parts[0])}.1"
    return "1.1"


def validate_database_search_syntax(strategy: Dict[str, Any]) -> List[str]:
    """Validate database-specific Boolean syntax, parentheses, wildcards, and concept coverage."""
    issues: List[str] = []
    db = str(strategy.get("databaseName") or "").strip().lower()
    query = str(strategy.get("exactSearchString") or "").strip()

    if not query:
        issues.append("Search string is empty.")
        return issues

    # Parentheses balance
    depth = 0
    for ch in query:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth < 0:
                issues.append("Unbalanced closing parenthesis ')' detected.")
                break
    if depth > 0:
        issues.append(f"Unbalanced parentheses: {depth} unclosed '(' bracket(s).")

    # Quote balance
    if query.count('"') % 2 != 0:
        issues.append('Unclosed phrase quotation mark (") detected.')

    # Lowercase boolean operators check
    if re.search(r"\b(and|or|not)\b", query) and not re.search(r"\b(AND|OR|NOT)\b", query):
        issues.append("Boolean operators should be uppercase (AND, OR, NOT) for strict database parsing.")

    # Duplicate adjacent operators
    if re.search(r"\b(AND|OR|NOT)\s+(AND|OR)\b", query):
        issues.append("Adjacent Boolean operators detected (e.g., 'AND OR').")

    # Overly broad or missing conjunction
    if len(query.split()) > 6 and "AND" not in query and "OR" not in query:
        issues.append("Query contains multiple terms without Boolean AND/OR grouping.")

    # Database-specific rules
    if "scopus" in db:
        if "TITLE-ABS-KEY" not in query and "TITLE(" not in query and "ABS(" not in query:
            issues.append("Scopus queries typically require field wrappers such as TITLE-ABS-KEY(...).")
        if "[MeSH]" in query or "TS=" in query:
            issues.append("Scopus does not support PubMed [MeSH] or Web of Science TS= field codes.")
    elif "web of science" in db or "wos" in db:
        if "TS=" not in query and "TI=" not in query and "AB=" not in query:
            issues.append("Web of Science syntax normally expects topic/title field tags (TS=, TI=, AB=).")
        if "TITLE-ABS-KEY" in query or "[tiab]" in query.lower():
            issues.append("Web of Science does not support Scopus TITLE-ABS-KEY or PubMed [tiab] tags.")
    elif "georef" in db:
        if "TITLE-ABS-KEY" in query or "[MeSH]" in query or "TS=" in query:
            issues.append("GeoRef does not use Scopus TITLE-ABS-KEY, PubMed [MeSH], or WoS TS= tags.")
    elif "crossref" in db:
        if "TITLE-ABS-KEY" in query or "[MeSH]" in query or "TS=" in query or "[tiab]" in query.lower():
            issues.append("Crossref REST query.bibliographic does not support Scopus/PubMed/WoS field wrappers.")
    elif "pubmed" in db:
        if "TITLE-ABS-KEY" in query or "TS=" in query:
            issues.append("PubMed rejects Scopus TITLE-ABS-KEY and Web of Science TS= syntax; use [tiab] or [MeSH].")
        if re.search(r'"[^"]*\*[^"]*"', query):
            issues.append("PubMed disables wildcard truncation (*) inside quoted phrases.")
        if re.search(r"\bNEAR/\d+\b|\bW/\d+\b", query, re.I):
            issues.append("PubMed does not support proximity operators like NEAR/n or W/n.")
    elif "sciencedirect" in db:
        bool_ops = len(re.findall(r"\b(AND|OR|NOT)\b", query))
        if bool_ops > 8:
            issues.append(
                f"ScienceDirect enforces a limit of 8 Boolean connectors per search box (found {bool_ops})."
            )
        if "*" in query:
            issues.append("ScienceDirect does not reliably support wildcard (*) truncation in standard search.")
    elif "ieee" in db:
        if "TITLE-ABS-KEY" in query or "[MeSH]" in query:
            issues.append("IEEE Xplore does not recognize Scopus TITLE-ABS-KEY or PubMed [MeSH] tags.")
    elif "google scholar" in db:
        if len(query) > 256:
            issues.append(
                f"Google Scholar query length ({len(query)} chars) exceeds ~256-character practical limit; split into focused strings."
            )
        if "TITLE-ABS-KEY" in query or "TS=" in query or "[tiab]" in query.lower():
            issues.append("Google Scholar does not support structured field tags (TITLE-ABS-KEY, TS=, [tiab]).")

    # Duplicate token detection
    tokens = [t.lower().strip('"()') for t in re.split(r"\s+", query) if t.upper() not in {"AND", "OR", "NOT"}]
    tokens = [t for t in tokens if len(t) > 3]
    dups = sorted({t for t in tokens if tokens.count(t) > 2})
    if dups:
        issues.append(f"Repeated search terms detected ({', '.join(dups[:4])}); consider consolidating with OR.")

    # Synonym coverage check
    syns = strategy.get("keywordsAndSynonyms") or []
    if len(syns) < 2 and "OR" not in query:
        issues.append("Limited synonym expansion (no OR synonyms detected); recall may be overly restrictive.")

    return issues


def validate_protocol(
    protocol: Dict[str, Any],
    articles: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Centralized Intelligent Protocol Validation Engine.
    Evaluates cross-section consistency without ever mutating approved content.
    """
    issues: List[Dict[str, Any]] = []
    articles = articles or []
    existing_decisions = {
        str(i.get("issueId")): i.get("researcherDecision")
        for i in (protocol.get("validationIssues") or [])
        if i.get("issueId")
    }

    def add_issue(
        issue_id: str,
        description: str,
        affected_section: str,
        severity: str,
        explanation: str,
        correction: str,
        impact: str,
        status: str = "warning",
    ) -> None:
        prev_dec = existing_decisions.get(issue_id)
        decision = prev_dec if prev_dec in {"accepted", "overridden", "deferred", "pending"} else "pending"
        resolved = "passed" if decision == "accepted" else status
        issues.append(
            {
                "issueId": issue_id,
                "description": description,
                "affectedSection": affected_section,
                "severity": severity,
                "explanation": explanation,
                "recommendedCorrection": correction,
                "potentialImpact": impact,
                "researcherDecision": decision,
                "resolutionStatus": resolved,
            }
        )

    topic = protocol.get("topicAnalysis") or {}
    method = protocol.get("reviewMethodRecommendation") or {}
    fw_items = protocol.get("frameworkComponents") or []
    gen_obj = str(protocol.get("generalObjective") or "").strip()
    spec_objs = protocol.get("specificObjectives") or []
    rqs = protocol.get("rqMappings") or []
    elig = protocol.get("eligibilityMatrix") or []
    searches = protocol.get("databaseSearchStrategies") or []
    extraction = protocol.get("extractionPlan") or []
    appraisal = protocol.get("appraisalPlan") or []
    synthesis = protocol.get("synthesisPlan") or {}
    prisma_items = protocol.get("prismaChecklist") or []

    # 1. Topic & Knowledge Gap epistemic guard
    if not str(topic.get("proposedTitle") or "").strip() or not str(topic.get("researchProblem") or "").strip():
        add_issue(
            "VAL-TOPIC-01",
            "Incomplete research topic title or problem statement.",
            "Topic Analysis (Step 1-2)",
            "high",
            "A reproducible review protocol requires an explicit proposed title and well-defined research problem.",
            "Complete the proposed research title and research problem fields and confirm researcher approval.",
            "Downstream objectives, eligibility rules, and search strings lack topical anchors.",
            "needs_revision",
        )
    if topic.get("isPreliminaryAiSuggestion") and not topic.get("knowledgeGapVerifiedByEvidence"):
        add_issue(
            "VAL-TOPIC-02",
            "Knowledge gap justification is currently marked as a preliminary AI suggestion pending literature verification.",
            "Topic Analysis (Step 2)",
            "low",
            "Theoretical or empirical gaps cannot be claimed as established prior to completing the systematic search.",
            "Retain provisional framing until screening/synthesis confirms the gap or mark verified with prior references.",
            "Prevents overclaiming unverified research gaps in protocol registration.",
            "warning",
        )

    # 2. PRISMA vs Methodological Guidance vs Appraisal distinction
    method_guideline = str(method.get("methodologicalGuidance") or "").lower()
    reporting_guideline = str(method.get("reportingGuideline") or "").lower()
    if method_guideline and ("prisma" in method_guideline and "cochrane" not in method_guideline and "jbi" not in method_guideline and "campbell" not in method_guideline):
        add_issue(
            "VAL-METH-01",
            "PRISMA listed as primary conduct methodology rather than reporting guideline.",
            "Review Type & Methodology (Step 3)",
            "medium",
            "PRISMA 2020 / PRISMA-ScR / PRISMA-S are reporting guidelines, whereas Cochrane Handbook, JBI Manual, or Campbell Collaboration provide conduct methodology.",
            "Pair PRISMA reporting guidelines with a conduct framework (e.g., Cochrane Handbook, JBI, or Kitchenham SLR) and distinct appraisal instruments.",
            "Improves methodological rigor and peer-review defensibility.",
            "warning",
        )

    # 3. Framework component completeness
    if not fw_items:
        add_issue(
            "VAL-FW-01",
            "Research framework component matrix is empty.",
            "Research Framework (Step 4)",
            "high",
            "Core framework dimensions (e.g., PICOC, PICO, PECO, PCC, SPIDER) define scope, synonyms, and extraction needs.",
            "Generate or enter framework components with keywords, synonyms, and inclusion/exclusion implications.",
            "Cannot validate search concepts or eligibility boundaries.",
            "needs_revision",
        )
    else:
        empty_comp = [c.get("componentName") or c.get("componentCode") for c in fw_items if not str(c.get("proposedContent") or "").strip()]
        if empty_comp:
            add_issue(
                "VAL-FW-02",
                f"Framework component(s) lack content: {', '.join(empty_comp)}.",
                "Research Framework (Step 4)",
                "high",
                "Every active dimension in the selected review framework must have research-specific scope content.",
                "Populate proposed content and synonyms for all incomplete framework components.",
                "Creates gaps in search strategy coverage and eligibility screening.",
                "needs_revision",
            )
        no_syns = [c.get("componentName") or c.get("componentCode") for c in fw_items if len(c.get("keywords") or []) + len(c.get("synonyms") or []) == 0]
        if no_syns:
            add_issue(
                "VAL-FW-03",
                f"Framework component(s) lack search keywords/synonyms: {', '.join(no_syns)}.",
                "Research Framework (Step 4)",
                "medium",
                "Missing keyword/synonym lists lead to incomplete database search strings.",
                "Add controlled vocabulary and free-text synonyms for each active framework component.",
                "Reduces search sensitivity (recall).",
                "warning",
            )
        # Overlap / ambiguity detection across distinct framework components
        for i_idx in range(len(fw_items)):
            for j_idx in range(i_idx + 1, len(fw_items)):
                c1 = fw_items[i_idx]
                c2 = fw_items[j_idx]
                t1 = {str(x).strip().lower() for x in (c1.get("keywords") or []) + (c1.get("synonyms") or []) if str(x).strip()}
                t2 = {str(x).strip().lower() for x in (c2.get("keywords") or []) + (c2.get("synonyms") or []) if str(x).strip()}
                if t1 and t2:
                    overlap = len(t1 & t2) / max(len(t1 | t2), 1)
                    if overlap >= 0.70:
                        code1 = c1.get("componentCode") or c1.get("componentName")
                        code2 = c2.get("componentCode") or c2.get("componentName")
                        add_issue(
                            f"VAL-FW-OVLP-{code1}-{code2}",
                            f"Ambiguous or overlapping keywords between framework components {code1} and {code2} ({round(overlap * 100)}% overlap).",
                            "Research Framework (Step 4)",
                            "medium",
                            "Overlapping framework components blur inclusion boundaries and create redundant Boolean blocks.",
                            f"Clarify distinct scope terms and keywords between {code1} and {code2}.",
                            "Reduces screening precision and search specificity.",
                            "warning",
                        )

    # 4. Objectives & Research Questions consistency
    if not gen_obj:
        add_issue(
            "VAL-OBJ-01",
            "General objective statement is missing.",
            "Objectives & RQs (Step 5)",
            "high",
            "A concise general objective anchors all specific objectives and research questions.",
            "Author a concise general objective summarizing the overall review purpose.",
            "Research questions lack an overarching alignment target.",
            "needs_revision",
        )

    rq_codes = {str(r.get("code") or "").strip().upper() for r in rqs if str(r.get("code") or "").strip()}
    for idx, obj in enumerate(spec_objs):
        mapped = {str(c).strip().upper() for c in (obj.get("mappedRqCodes") or []) if str(c).strip()}
        if not mapped or not (mapped & rq_codes):
            add_issue(
                f"VAL-OBJ-COV-{idx+1}",
                f"Specific objective {obj.get('code') or f'SO{idx+1}'} has no corresponding research question.",
                "Objectives & RQs (Step 5-6)",
                "high",
                "Every specific objective must map to at least one answerable research question.",
                "Map an existing RQ code or add a dedicated research question for this objective.",
                "Specific objective will remain unanswered during synthesis.",
                "needs_revision",
            )

    # Check overlapping or vague RQs & missing extraction coverage
    seen_q_norms: Dict[str, str] = {}
    ext_by_rq = {str(e.get("rqCode") or "").strip().upper() for e in extraction}
    for rq in rqs:
        code = str(rq.get("code") or "").strip().upper()
        q_text = str(rq.get("question") or "").strip()
        norm_words = {w for w in re.findall(r"[a-z0-9]{4,}", q_text.lower()) if w not in {"what", "which", "with", "that", "from", "studies", "review", "research", "using", "across"}}
        for prev_code, prev_words_str in seen_q_norms.items():
            prev_words = set(prev_words_str.split(",")) if prev_words_str else set()
            if norm_words and prev_words:
                jaccard = len(norm_words & prev_words) / max(len(norm_words | prev_words), 1)
                if jaccard >= 0.72:
                    add_issue(
                        f"VAL-RQ-OVLP-{prev_code}-{code}",
                        f"Potential overlap detected between {prev_code} and {code} (lexical similarity {round(jaccard * 100)}%).",
                        "Research Questions (Step 6)",
                        "medium",
                        "Overlapping research questions cause redundant extraction and fragmented synthesis reporting.",
                        "Differentiate outcome/moderator boundaries or merge overlapping questions.",
                        "Duplicate effort during evidence synthesis.",
                        "warning",
                    )
        seen_q_norms[code] = ",".join(sorted(norm_words))

        if not (rq.get("requiredExtractionVariables") or []) and code not in ext_by_rq:
            add_issue(
                f"VAL-RQ-EXT-{code}",
                f"{code} has no mapped extraction variables in the Extraction Plan.",
                "Extraction Mapping (Step 10)",
                "high",
                "Research questions without mapped extraction variables cannot be empirically answered from included studies.",
                f"Add extraction variable definitions mapped to {code} in Step 10.",
                "Data extraction matrix will miss evidence required to answer this question.",
                "needs_revision",
            )

        if not str(rq.get("evidenceType") or "").strip() or not str(rq.get("proposedSynthesisMethod") or "").strip():
            add_issue(
                f"VAL-RQ-SYN-{code}",
                f"{code} is missing evidence type or proposed synthesis method.",
                "Research Questions (Step 6)",
                "medium",
                "Each question requires an expected evidence type and planned synthesis approach.",
                f"Specify expected evidence type and synthesis method for {code}.",
                "Ambiguous synthesis execution.",
                "warning",
            )

        rec_review_type_rq = str(method.get("recommendedReviewType") or "slr").lower()
        if rec_review_type_rq in {"slr", "meta_analysis"} and len(rqs) > 0:
            has_outcome_signal = any(
                "O" in [str(x).upper() for x in (r.get("mappedFrameworkComponents") or [])]
                or "outcome" in str(r.get("question") or "").lower()
                or "effect" in str(r.get("question") or "").lower()
                or "accura" in str(r.get("question") or "").lower()
                or "perform" in str(r.get("question") or "").lower()
                or "metric" in str(r.get("question") or "").lower()
                for r in rqs
            )
            if not has_outcome_signal and code == str(rqs[-1].get("code") or "").strip().upper():
                add_issue(
                    "VAL-RQ-OUTCOME-01",
                    "Outcome definition not clearly reflected in research questions for comparative/effectiveness review.",
                    "Research Questions (Step 6)",
                    "medium",
                    "SLR and Meta-Analysis questions should define measurable outcomes or performance endpoints.",
                    "Map at least one RQ explicitly to outcome framework component (O) and measurable indicators.",
                    "Weakens extraction alignment and synthesis comparability.",
                    "warning",
                )

    # 5. Contradictory Inclusion / Exclusion rules check
    for row in elig:
        inc = str(row.get("inclusionRequirement") or "").lower()
        exc = str(row.get("exclusionRequirement") or "").lower()
        inc_clean = re.sub(r"\b(?:before|prior to|after|pre-)\s+(?:19|20)\d{2}\b", "", inc)
        exc_clean = re.sub(r"\b(?:before|prior to|after|pre-)\s+(?:19|20)\d{2}\b", "", exc)
        inc_years = {int(y) for y in re.findall(r"\b((?:19|20)\d{2})\b", inc_clean)}
        for m_start, m_end in re.findall(r"\b((?:19|20)\d{2})\s*[-–to]+\s*((?:19|20)\d{2})\b", inc_clean):
            lo, hi = sorted((int(m_start), int(m_end)))
            if hi - lo <= 100:
                inc_years.update(range(lo, hi + 1))
        exc_years = {int(y) for y in re.findall(r"\b((?:19|20)\d{2})\b", exc_clean)}
        overlap_years = sorted(inc_years & exc_years)
        if overlap_years:
            add_issue(
                f"VAL-ELIG-YR-{row.get('id')}",
                f"Contradictory publication years in '{row.get('criterion')}': overlap on {', '.join(str(y) for y in overlap_years[:5])}.",
                "Eligibility Criteria (Step 7)",
                "high",
                "The same publication year(s) appear in both inclusion and exclusion requirements.",
                "Resolve the boundary years so inclusion and exclusion rules are mutually exclusive.",
                "Reviewers cannot unambiguously screen studies by publication period.",
                "needs_revision",
            )
        if not inc.strip() or not exc.strip():
            add_issue(
                f"VAL-ELIG-EMPTY-{row.get('id')}",
                f"Eligibility criterion '{row.get('criterion')}' is missing inclusion or exclusion details.",
                "Eligibility Criteria (Step 7)",
                "medium",
                "Transparent PRISMA screening requires both inclusion and exclusion definitions.",
                "Complete both inclusion and exclusion cells for this criterion.",
                "Screening inconsistencies across reviewers.",
                "warning",
            )
        elif inc.strip() == exc.strip():
            add_issue(
                f"VAL-ELIG-DUP-{row.get('id')}",
                f"Contradictory identical inclusion and exclusion text in '{row.get('criterion')}'.",
                "Eligibility Criteria (Step 7)",
                "high",
                "Inclusion and exclusion requirements must be mutually exclusive boundaries.",
                "Differentiate inclusion vs exclusion thresholds for this criterion.",
                "Reviewers cannot apply mutually consistent screening judgments.",
                "needs_revision",
            )

    # 6. Database Search Strategy validation (never fabricate counts)
    if not searches:
        add_issue(
            "VAL-SRCH-01",
            "No database-specific search strategies configured.",
            "Search Strategy (Step 8)",
            "high",
            "Reproducible literature searching requires explicit database-specific search strings.",
            "Generate or add strategies for Scopus, Web of Science, PubMed, IEEE Xplore, ScienceDirect, GeoRef, Crossref, etc.",
            "Search execution cannot be audited under PRISMA-S.",
            "needs_revision",
        )
    else:
        for s in searches:
            syntax_errs = validate_database_search_syntax(s)
            s["syntaxIssues"] = syntax_errs
            if syntax_errs:
                add_issue(
                    f"VAL-SRCH-SYN-{s.get('id') or s.get('databaseName')}",
                    f"Syntax issues in {s.get('databaseName')}: {syntax_errs[0]}",
                    "Search Strategy (Step 8)",
                    "medium",
                    " | ".join(syntax_errs),
                    f"Refine the {s.get('databaseName')} query syntax and re-validate.",
                    "Database search execution may fail or return biased hits.",
                    "warning",
                )

    # 7. Quality Appraisal alignment check (must match designs, not one-size-fits-all)
    if not appraisal:
        add_issue(
            "VAL-APP-01",
            "Quality appraisal planning matrix is empty.",
            "Quality Appraisal Plan (Step 11)",
            "high",
            "Study-design-specific appraisal tools must be selected before full-text appraisal.",
            "Specify recommended instruments (e.g., RoB 2 for RCTs, ROBINS-I for non-randomized, JBI/CASP/MMAT).",
            "Risk-of-bias scoring will lack methodological validity.",
            "needs_revision",
        )
    else:
        instruments = {str(a.get("recommendedInstrument") or "").strip() for a in appraisal if str(a.get("recommendedInstrument") or "").strip()}
        if len(appraisal) >= 2 and len(instruments) == 1:
            add_issue(
                "VAL-APP-02",
                f"Single appraisal instrument ({next(iter(instruments))}) applied across {len(appraisal)} distinct study designs.",
                "Quality Appraisal Plan (Step 11)",
                "medium",
                "Applying one instrument indiscriminately across differing study designs violates JBI/Cochrane guidance (unless using MMAT for mixed-methods).",
                "Verify whether design-specific instruments (e.g., RoB 2, ROBINS-I, JBI, CASP, QUADAS-2) are required.",
                "Potential mismatch between study bias domains and appraisal checklist.",
                "warning",
            )

    # 8. Meta-analysis feasibility & review type guard
    rec_type = str(method.get("recommendedReviewType") or "").lower()
    ma_feas = str(synthesis.get("metaAnalysisFeasibility") or "conditional").lower()
    if ma_feas == "feasible" and rec_type in {"scoping", "mapping", "bibliometric", "narrative", "qualitative", "meta_synthesis"}:
        add_issue(
            "VAL-SYN-01",
            f"Statistical meta-analysis marked 'feasible' inside a {rec_type.replace('_', ' ')} review design.",
            "Synthesis & Meta-Analysis Feasibility (Step 12-13)",
            "high",
            "Scoping, mapping, bibliometric, and purely qualitative reviews generally do not pool statistical effect sizes across heterogeneous designs.",
            "Re-evaluate meta-analysis feasibility or align the selected review type (e.g., SLR with Meta-Analysis).",
            "Risk of statistically invalid or conceptually incoherent pooling.",
            "needs_revision",
        )
    if ma_feas == "feasible":
        checks = synthesis.get("feasibilityChecks") or {}
        if not str(checks.get("outcomeComparability") or "").strip() or not str(checks.get("varianceAvailability") or "").strip():
            add_issue(
                "VAL-SYN-02",
                "Meta-analysis marked feasible without documented outcome comparability or variance availability checks.",
                "Meta-Analysis Feasibility (Step 13)",
                "high",
                "Cochrane Chapter 9/10 requires verifying outcome comparability and variance/SE availability before proposing statistical pooling.",
                "Document outcome comparability, effect measure consistency, and variance availability in Step 13.",
                "May force incompatible studies into pooled models downstream.",
                "needs_revision",
            )

    # 9. Downstream impact check against existing project articles (NEVER alter existing decisions!)
    year_bounds_match = re.findall(r"\b((?:19|20)\d{2})\b", str(topic.get("publicationYearEligibility") or ""))
    min_year = min(int(y) for y in year_bounds_match) if year_bounds_match else None
    max_year = max(int(y) for y in year_bounds_match) if year_bounds_match else None

    screened_count = 0
    extracted_count = 0
    affected_records: List[Dict[str, Any]] = []
    for a in articles:
        if a.get("isDuplicate"):
            continue
        dec = a.get("decision")
        if dec in {"include", "exclude", "uncertain"}:
            screened_count += 1
        if a.get("extractedData"):
            extracted_count += 1
        if dec in {"include", "uncertain"}:
            yr = a.get("year")
            reasons_art: List[str] = []
            if isinstance(yr, int) and min_year is not None and max_year is not None and (yr < min_year or yr > max_year):
                reasons_art.append(f"Publication year {yr} outside protocol window {min_year}-{max_year}")
            elif a.get("extractedData"):
                reasons_art.append("Previously extracted record requires researcher alignment check after protocol updates")
            if reasons_art and len(affected_records) < 25:
                affected_records.append(
                    {
                        "id": str(a.get("id") or ""),
                        "title": str(a.get("title") or "Untitled Article")[:120],
                        "year": yr if isinstance(yr, int) else None,
                        "decision": dec,
                        "reason": "; ".join(reasons_art),
                    }
                )

    downstream_warning = {
        "hasScreenedArticles": screened_count > 0 or extracted_count > 0,
        "screenedCount": screened_count,
        "extractedCount": extracted_count,
        "affectedRecords": affected_records,
        "message": (
            f"{screened_count} article(s) already screened and {extracted_count} article(s) extracted"
            + (f" ({len(affected_records)} potentially affected by current bounds). " if affected_records else ". ")
            + "Protocol edits or amendments will NOT automatically reverse prior decisions; researcher review is required before re-screening."
            if (screened_count > 0 or extracted_count > 0)
            else "No screened or extracted records impacted yet."
        ),
        "requiresResearcherReview": screened_count > 0 or extracted_count > 0,
    }

    high_cnt = sum(1 for i in issues if i["severity"] == "high" and i["resolutionStatus"] != "passed")
    med_cnt = sum(1 for i in issues if i["severity"] == "medium" and i["resolutionStatus"] != "passed")
    low_cnt = sum(1 for i in issues if i["severity"] == "low" and i["resolutionStatus"] != "passed")
    passed_cnt = sum(1 for i in issues if i["resolutionStatus"] == "passed")

    total_checks = 9
    deduction = high_cnt * 12 + med_cnt * 6 + low_cnt * 2
    consistency_ratio = max(10, min(100, 100 - deduction))
    overall_status = "needs_revision" if high_cnt > 0 else ("warning" if med_cnt > 0 else "passed")

    validation_summary = {
        "status": overall_status,
        "consistencyRatio": consistency_ratio,
        "passedCount": max(total_checks - high_cnt - med_cnt, passed_cnt),
        "warningCount": med_cnt + low_cnt,
        "needsRevisionCount": high_cnt,
        "disclaimer": (
            "Internal consistency indicator summarizing structural alignment checks; "
            "NOT a scientific quality score or substitute for expert methodological judgment."
        ),
        "assessedAt": _utc_now(),
    }

    protocol["validationIssues"] = issues
    protocol["validationSummary"] = validation_summary
    protocol["downstreamImpactWarning"] = downstream_warning
    protocol["databaseSearchStrategies"] = searches
    protocol["prismaChecklist"] = prisma_items
    return {
        "protocol": protocol,
        "validationIssues": issues,
        "validationSummary": validation_summary,
        "downstreamImpactWarning": downstream_warning,
    }


def _row_to_protocol(row: Any) -> Dict[str, Any]:
    return json.loads(row["protocol_json"] or "{}")


def load_protocol_state(project_id: str, db_path: Optional[str] = None) -> Dict[str, Any]:
    migrate_db(db_path)
    conn = get_connection(db_path)
    try:
        row = conn.execute(
            "SELECT * FROM review_protocols WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1",
            (project_id,),
        ).fetchone()
        protocol = _row_to_protocol(row) if row else None

        versions = [
            {
                "versionId": r["version_id"],
                "versionNumber": r["version_number"],
                "status": r["status"],
                "createdAt": r["created_at"],
                "modifiedAt": r["created_at"],
                "author": r["author"],
                "frameworkType": r["framework_type"],
                "changeSummary": r["change_summary"],
                "protocolData": json.loads(r["snapshot_json"] or "{}"),
            }
            for r in conn.execute(
                "SELECT * FROM protocol_versions WHERE project_id = ? ORDER BY created_at DESC LIMIT 30",
                (project_id,),
            ).fetchall()
        ]
        amendments = [
            {
                "id": r["id"],
                "versionNumber": r["version_number"],
                "modifiedSection": r["modified_section"],
                "previousContent": r["previous_content"],
                "revisedContent": r["revised_content"],
                "reason": r["reason"],
                "modifiedAt": r["modified_at"],
                "responsibleUser": r["responsible_user"],
                "approvalStatus": r["approval_status"],
                "affectedArticleCount": r["affected_article_count"],
            }
            for r in conn.execute(
                "SELECT * FROM protocol_amendments WHERE project_id = ? ORDER BY modified_at DESC LIMIT 50",
                (project_id,),
            ).fetchall()
        ]
        audit_log = [
            {
                "id": r["id"],
                "protocolId": r["protocol_id"],
                "action": r["action"],
                "actor": r["actor"],
                "details": json.loads(r["details_json"] or "{}"),
                "createdAt": r["created_at"],
            }
            for r in conn.execute(
                "SELECT * FROM protocol_audit_log WHERE project_id = ? ORDER BY id DESC LIMIT 50",
                (project_id,),
            ).fetchall()
        ]
        if protocol is not None:
            protocol["versionHistory"] = versions
            protocol["amendments"] = amendments
        return {
            "protocol": protocol,
            "versions": versions,
            "amendments": amendments,
            "auditLog": audit_log,
        }
    finally:
        conn.close()


def save_protocol_state(
    project_id: str,
    protocol: Dict[str, Any],
    articles: Optional[List[Dict[str, Any]]] = None,
    actor: str = "Researcher",
    amendment_info: Optional[Dict[str, Any]] = None,
    db_path: Optional[str] = None,
) -> Dict[str, Any]:
    migrate_db(db_path)
    validated = validate_protocol(dict(protocol), articles)
    prot = validated["protocol"]

    now = _utc_now()
    prot_id = str(prot.get("id") or f"prot-{project_id}")
    prot["id"] = prot_id
    prot["projectId"] = project_id
    prot["createdAt"] = str(prot.get("createdAt") or now)
    prot["updatedAt"] = now
    prot["author"] = str(prot.get("author") or actor)

    conn = get_connection(db_path)
    try:
        existing_row = conn.execute(
            "SELECT * FROM review_protocols WHERE protocol_id = ?",
            (prot_id,),
        ).fetchone()
        prev_status = existing_row["status"] if existing_row else "draft"
        prev_version = existing_row["version_number"] if existing_row else str(prot.get("versionNumber") or "1.0")

        # If modifying an already approved protocol without explicit draft status override, bump minor version & log amendment
        created_amendment = None
        if prev_status == "approved" and amendment_info and amendment_info.get("reason"):
            next_version = _bump_minor_version(prev_version)
            prot["versionNumber"] = next_version
            prot["status"] = "under_review"
            prot["changeSummary"] = str(amendment_info.get("reason") or f"Amendment from v{prev_version}")
            amend_id = f"amend-{project_id}-{int(datetime.now().timestamp() * 1000)}"
            affected = validated["downstreamImpactWarning"]["screenedCount"]
            conn.execute(
                """
                INSERT INTO protocol_amendments (
                    id, protocol_id, project_id, version_number, modified_section,
                    previous_content, revised_content, reason, responsible_user,
                    approval_status, affected_article_count, modified_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    amend_id,
                    prot_id,
                    project_id,
                    next_version,
                    str(amendment_info.get("modifiedSection") or "Protocol Specification"),
                    str(amendment_info.get("previousContent") or "")[:1200],
                    str(amendment_info.get("revisedContent") or "")[:1200],
                    str(amendment_info.get("reason") or ""),
                    actor,
                    "pending_review",
                    affected,
                    now,
                ),
            )
            created_amendment = amend_id
            # Snapshot previous approved version as superseded if not yet snapshotted for this version
            ver_id = f"pver-{prot_id}-{prev_version}-{int(datetime.now().timestamp())}"
            conn.execute(
                """
                INSERT OR IGNORE INTO protocol_versions (
                    version_id, protocol_id, project_id, version_number, status,
                    framework_type, author, change_summary, snapshot_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ver_id,
                    prot_id,
                    project_id,
                    prev_version,
                    "superseded",
                    str((prot.get("reviewMethodRecommendation") or {}).get("recommendedPrimaryFramework") or "PICOC"),
                    actor,
                    f"Superseded by v{next_version}: {prot['changeSummary']}",
                    existing_row["protocol_json"] if existing_row else "{}",
                    now,
                ),
            )

        strip_prot = {k: v for k, v in prot.items() if k not in {"versionHistory", "amendments"}}
        framework_type = str(
            (prot.get("reviewMethodRecommendation") or {}).get("recommendedPrimaryFramework") or "PICOC"
        )
        conn.execute(
            """
            INSERT INTO review_protocols (
                protocol_id, project_id, version_number, status, framework_type,
                author, change_summary, activated_at, activated_version,
                protocol_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(protocol_id) DO UPDATE SET
                version_number=excluded.version_number,
                status=excluded.status,
                framework_type=excluded.framework_type,
                author=excluded.author,
                change_summary=excluded.change_summary,
                activated_at=excluded.activated_at,
                activated_version=excluded.activated_version,
                protocol_json=excluded.protocol_json,
                updated_at=excluded.updated_at
            """,
            (
                prot_id,
                project_id,
                str(prot.get("versionNumber") or "1.0"),
                str(prot.get("status") or "draft"),
                framework_type,
                actor,
                str(prot.get("changeSummary") or ""),
                str(prot.get("activatedAt") or ""),
                str(prot.get("activatedVersion") or ""),
                json.dumps(strip_prot),
                prot["createdAt"],
                now,
            ),
        )
        conn.execute(
            "INSERT INTO protocol_audit_log (project_id, protocol_id, action, actor, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (
                project_id,
                prot_id,
                "protocol_amendment_saved" if created_amendment else "protocol_saved",
                actor,
                json.dumps(
                    {
                        "versionNumber": prot.get("versionNumber"),
                        "status": prot.get("status"),
                        "amendmentId": created_amendment,
                    }
                ),
                now,
            ),
        )
        conn.commit()
    finally:
        conn.close()

    return load_protocol_state(project_id, db_path)


def approve_and_lock_protocol(
    project_id: str,
    protocol: Dict[str, Any],
    articles: Optional[List[Dict[str, Any]]] = None,
    actor: str = "Researcher",
    change_summary: str = "Researcher approved and locked protocol version",
    db_path: Optional[str] = None,
) -> Dict[str, Any]:
    migrate_db(db_path)
    validated = validate_protocol(dict(protocol), articles)
    prot = validated["protocol"]
    now = _utc_now()
    prot_id = str(prot.get("id") or f"prot-{project_id}")
    prot["id"] = prot_id
    prot["projectId"] = project_id
    prot["status"] = "approved"
    prot["updatedAt"] = now
    prot["author"] = actor
    prot["changeSummary"] = change_summary
    version_num = str(prot.get("versionNumber") or "1.0")
    framework_type = str(
        (prot.get("reviewMethodRecommendation") or {}).get("recommendedPrimaryFramework") or "PICOC"
    )

    strip_prot = {k: v for k, v in prot.items() if k not in {"versionHistory", "amendments"}}
    ver_id = f"pver-{prot_id}-{version_num}-{int(datetime.now().timestamp() * 1000)}"

    conn = get_connection(db_path)
    try:
        conn.execute(
            """
            INSERT INTO review_protocols (
                protocol_id, project_id, version_number, status, framework_type,
                author, change_summary, activated_at, activated_version,
                protocol_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(protocol_id) DO UPDATE SET
                version_number=excluded.version_number,
                status=excluded.status,
                framework_type=excluded.framework_type,
                author=excluded.author,
                change_summary=excluded.change_summary,
                activated_at=excluded.activated_at,
                activated_version=excluded.activated_version,
                protocol_json=excluded.protocol_json,
                updated_at=excluded.updated_at
            """,
            (
                prot_id,
                project_id,
                version_num,
                "approved",
                framework_type,
                actor,
                change_summary,
                str(prot.get("activatedAt") or ""),
                str(prot.get("activatedVersion") or ""),
                json.dumps(strip_prot),
                str(prot.get("createdAt") or now),
                now,
            ),
        )
        conn.execute(
            """
            INSERT INTO protocol_versions (
                version_id, protocol_id, project_id, version_number, status,
                framework_type, author, change_summary, snapshot_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ver_id,
                prot_id,
                project_id,
                version_num,
                "approved",
                framework_type,
                actor,
                change_summary,
                json.dumps(strip_prot),
                now,
            ),
        )
        conn.execute(
            "UPDATE protocol_amendments SET approval_status = 'approved' WHERE project_id = ? AND approval_status = 'pending_review'",
            (project_id,),
        )
        conn.execute(
            "INSERT INTO protocol_audit_log (project_id, protocol_id, action, actor, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (
                project_id,
                prot_id,
                "protocol_approved_and_locked",
                actor,
                json.dumps({"versionId": ver_id, "versionNumber": version_num, "changeSummary": change_summary}),
                now,
            ),
        )
        conn.commit()
    finally:
        conn.close()

    return load_protocol_state(project_id, db_path)


def restore_protocol_version(
    project_id: str,
    version_id: str,
    actor: str = "Researcher",
    db_path: Optional[str] = None,
) -> Dict[str, Any]:
    migrate_db(db_path)
    conn = get_connection(db_path)
    try:
        row = conn.execute(
            "SELECT * FROM protocol_versions WHERE project_id = ? AND version_id = ?",
            (project_id, version_id),
        ).fetchone()
        if not row:
            raise ValueError(f"Protocol version '{version_id}' not found")
        snap = json.loads(row["snapshot_json"] or "{}")
        now = _utc_now()
        current_row = conn.execute(
            "SELECT version_number FROM review_protocols WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1",
            (project_id,),
        ).fetchone()
        next_ver = _bump_minor_version(current_row["version_number"] if current_row else row["version_number"])
        snap["versionNumber"] = next_ver
        snap["status"] = "draft"
        snap["updatedAt"] = now
        snap["changeSummary"] = f"Restored from v{row['version_number']} ({version_id})"
        prot_id = str(snap.get("id") or row["protocol_id"])
        conn.execute(
            """
            INSERT INTO review_protocols (
                protocol_id, project_id, version_number, status, framework_type,
                author, change_summary, activated_at, activated_version,
                protocol_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(protocol_id) DO UPDATE SET
                version_number=excluded.version_number,
                status=excluded.status,
                framework_type=excluded.framework_type,
                author=excluded.author,
                change_summary=excluded.change_summary,
                protocol_json=excluded.protocol_json,
                updated_at=excluded.updated_at
            """,
            (
                prot_id,
                project_id,
                next_ver,
                "draft",
                row["framework_type"],
                actor,
                snap["changeSummary"],
                str(snap.get("activatedAt") or ""),
                str(snap.get("activatedVersion") or ""),
                json.dumps(snap),
                str(snap.get("createdAt") or now),
                now,
            ),
        )
        conn.execute(
            "INSERT INTO protocol_audit_log (project_id, protocol_id, action, actor, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (
                project_id,
                prot_id,
                "protocol_version_restored",
                actor,
                json.dumps({"restoredFromVersionId": version_id, "restoredVersionNumber": row["version_number"], "newVersionNumber": next_ver}),
                now,
            ),
        )
        conn.commit()
    finally:
        conn.close()

    return load_protocol_state(project_id, db_path)
