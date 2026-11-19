import re
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional, Tuple

COUNTRY_PATTERNS: List[Tuple[str, str, List[str]]] = [
    ("Ethiopia", "Africa", ["ethiopia", "amhara", "tigray", "oromia", "blue nile", "addis ababa", "gondar", "bahir dar"]),
    ("China", "Asia", ["china", "beijing", "shanghai", "wuhan", "nanjing", "yangtze", "xinjiang", "guangdong", "henan", "shaanxi"]),
    ("United States", "North America", ["united states", "usa", "california", "texas", "iowa", "midwest", "florida", "nebraska", "kansas"]),
    ("India", "Asia", ["india", "punjab", "maharashtra", "karnataka", "delhi", "hyderabad"]),
    ("Brazil", "South America", ["brazil", "sao paulo", "mato grosso", "amazon", "minas gerais"]),
    ("Germany", "Europe", ["germany", "bavaria", "bonn", "munich", "berlin"]),
    ("Spain", "Europe", ["spain", "andalusia", "cordoba", "madrid", "valencia"]),
    ("Italy", "Europe", ["italy", "tuscany", "bologna", "milan", "rome"]),
    ("United Kingdom", "Europe", ["united kingdom", "uk", "england", "scotland", "rothamsted"]),
    ("Australia", "Oceania", ["australia", "queensland", "new south wales", "victoria", "perth"]),
    ("Canada", "North America", ["canada", "saskatchewan", "ontario", "alberta", "quebec"]),
    ("France", "Europe", ["france", "inrae", "montpellier", "toulouse", "paris"]),
    ("Netherlands", "Europe", ["netherlands", "wageningen", "dutch"]),
    ("Japan", "Asia", ["japan", "hokkaido", "tokyo", "kyoto"]),
    ("South Korea", "Asia", ["south korea", "korea", "seoul", "suwon"]),
    ("Kenya", "Africa", ["kenya", "nairobi", "rift valley"]),
    ("Nigeria", "Africa", ["nigeria", "ibadan", "abuja"]),
    ("South Africa", "Africa", ["south africa", "cape town", "pretoria", "stellenbosch"]),
    ("Iran", "Asia", ["iran", "tehran", "shiraz", "fars"]),
    ("Turkey", "Europe/Asia", ["turkey", "turkiye", "ankara", "istanbul", "konya"]),
    ("Poland", "Europe", ["poland", "warsaw", "poznan"]),
    ("Mexico", "North America", ["mexico", "sonora", "cimmyt"]),
]

STOPWORDS = {
    "the", "and", "for", "with", "from", "that", "this", "into", "across",
    "using", "based", "study", "studies", "what", "which", "how", "where",
    "when", "are", "were", "have", "has", "been", "being", "their", "between",
    "within", "under", "over", "more", "than", "such", "other", "also",
    "evaluation", "analysis", "review", "method", "methods", "results",
}


def _classify_paper_category(art: Dict[str, Any]) -> str:
    explicit = str(art.get("paperCategory") or "").strip()
    if explicit in ("Original Research", "Review"):
        return explicit
    text = f"{art.get('title', '')} {art.get('abstract', '')} {art.get('paperSubType', '')}".lower()
    review_cues = [
        "systematic review",
        "literature review",
        "scoping review",
        "meta-analysis",
        "bibliometric analysis",
        "state-of-the-art review",
        "comprehensive review",
        "narrative review",
    ]
    if any(cue in text for cue in review_cues):
        if not any(emp in text for emp in ["field experiment", "field trial", "we collected", "experimental plot"]):
            return "Review"
    return "Original Research"


def _detect_geography(art: Dict[str, Any]) -> Tuple[str, str]:
    ext = art.get("extractedData") or {}
    region = str(ext.get("geographicRegion") or "").strip()
    searchable = f"{region} {art.get('title', '')} {art.get('abstract', '')} {art.get('journal', '')}".lower()
    for country, continent, keys in COUNTRY_PATTERNS:
        if any(re.search(r"\b" + re.escape(k) + r"\b", searchable) for k in keys):
            return country, continent
    if region and region.lower() not in ("not specified", "n/a", "unknown", "global"):
        return region, "Unspecified Region"
    return "Not Specified", "Unspecified Region"


def _detect_design(art: Dict[str, Any]) -> str:
    ext = art.get("extractedData") or {}
    st = str(ext.get("studyType") or "").strip()
    if st and st.lower() not in ("not specified", "n/a"):
        return st
    text = f"{art.get('title', '')} {art.get('abstract', '')}".lower()
    if "randomized" in text or "rct" in text:
        return "Randomized Controlled / Experimental Trial"
    if "field experiment" in text or "field trial" in text or "plot" in text:
        return "Empirical Field Experiment"
    if "cohort" in text or "longitudinal" in text:
        return "Longitudinal / Cohort Study"
    if "benchmark" in text or "comparative" in text or "ablation" in text:
        return "Comparative Benchmark Study"
    if "cross-sectional" in text or "survey" in text:
        return "Cross-Sectional / Survey"
    if "simulation" in text or "synthetic" in text:
        return "Simulation / Modeling Study"
    if _classify_paper_category(art) == "Review":
        return "Secondary Review / Synthesis"
    return "Empirical Observational / Applied Study"


def _extract_numeric_metrics(text: str) -> Dict[str, List[float]]:
    found: Dict[str, List[float]] = defaultdict(list)
    if not text:
        return found
    patterns = {
        "accuracy_pct": r"(?:accuracy|overall accuracy|oa)\s*(?:of|=|:|is)?\s*(\d{2}(?:\.\d+)?)\s*%",
        "f1_score": r"(?:f1[- ]?score|f1)\s*(?:of|=|:|is)?\s*(0\.\d{2,4}|\d{2}(?:\.\d+)?%?)",
        "auc_roc": r"(?:auc(?:-roc)?|roc[- ]?auc)\s*(?:of|=|:|is)?\s*(0\.\d{2,4}|\d{2}(?:\.\d+)?%?)",
        "r2": r"(?:r\^?2|coefficient of determination)\s*(?:of|=|:|is)?\s*(0\.\d{2,4})",
        "rmse": r"(?:rmse|root mean square error)\s*(?:of|=|:|is)?\s*(\d+(?:\.\d+)?)",
    }
    lower = text.lower()
    for key, pat in patterns.items():
        for m in re.finditer(pat, lower):
            raw = m.group(1).replace("%", "")
            try:
                val = float(raw)
                if key in ("f1_score", "auc_roc") and val > 1.0 and val <= 100.0:
                    val = val / 100.0
                if key == "accuracy_pct" and val <= 100.0:
                    found[key].append(round(val, 3))
                elif key in ("f1_score", "auc_roc", "r2") and 0.0 <= val <= 1.0:
                    found[key].append(round(val, 4))
                elif key == "rmse" and val >= 0.0:
                    found[key].append(round(val, 4))
            except ValueError:
                continue
    return found


def _dist_list(counter: Counter, total: int, extra: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    denom = max(total, 1)
    rows = []
    for label, count in counter.most_common():
        item: Dict[str, Any] = {
            "label": label,
            "count": count,
            "percentage": round((count / denom) * 100.0, 2),
        }
        if extra and label in extra:
            item.update(extra[label])
        rows.append(item)
    return rows


def compute_descriptive_synthesis(
    project: Dict[str, Any],
    articles: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Compute strictly traceable descriptive quantitative synthesis counts and distributions."""
    total_identified = len(articles)
    duplicates = [a for a in articles if a.get("isDuplicate")]
    non_dups = [a for a in articles if not a.get("isDuplicate")]
    screened = [a for a in non_dups if a.get("decision") != "unscreened"]
    excluded = [a for a in non_dups if a.get("decision") == "exclude"]
    uncertain = [a for a in non_dups if a.get("decision") == "uncertain"]
    included = [a for a in non_dups if a.get("decision") == "include"]
    unscreened = [a for a in non_dups if a.get("decision") == "unscreened"]

    # Primary focus cohort is included studies; if none yet, also report identified non-dups separately
    cohort = included

    # Original vs Review across identified and included
    id_orig = sum(1 for a in non_dups if _classify_paper_category(a) == "Original Research")
    id_rev = len(non_dups) - id_orig
    inc_orig = sum(1 for a in included if _classify_paper_category(a) == "Original Research")
    inc_rev = len(included) - inc_orig

    year_counter: Counter = Counter()
    year_orig: Counter = Counter()
    year_rev: Counter = Counter()
    country_counter: Counter = Counter()
    continent_counter: Counter = Counter()
    design_counter: Counter = Counter()
    db_counter: Counter = Counter()
    sensor_counter: Counter = Counter()
    platform_counter: Counter = Counter()
    algo_counter: Counter = Counter()
    outcome_counter: Counter = Counter()

    algo_perf: Dict[str, List[float]] = defaultdict(list)
    metric_summaries: Dict[str, List[float]] = defaultdict(list)

    for a in non_dups:
        db = str(a.get("sourceDatabase") or "Manual").strip() or "Manual"
        db_counter[db] += 1

    included_db_counter: Counter = Counter()
    study_trace_rows: List[Dict[str, Any]] = []

    for art in cohort:
        cat = _classify_paper_category(art)
        yr = str(art.get("year") or "N/A")
        year_counter[yr] += 1
        if cat == "Original Research":
            year_orig[yr] += 1
        else:
            year_rev[yr] += 1

        country, continent = _detect_geography(art)
        country_counter[country] += 1
        continent_counter[continent] += 1

        design = _detect_design(art)
        design_counter[design] += 1

        db = str(art.get("sourceDatabase") or "Manual").strip() or "Manual"
        included_db_counter[db] += 1

        ext = art.get("extractedData") or {}
        sensor = str(ext.get("sensor") or "Not Specified").strip() or "Not Specified"
        platform = str(ext.get("platform") or "Not Specified").strip() or "Not Specified"
        algo = str(ext.get("algorithm") or "Not Specified").strip() or "Not Specified"
        metrics_str = str(ext.get("metrics") or "").strip()
        outcome_txt = str(ext.get("effectSizeOrAccuracy") or metrics_str or "General Performance").strip()

        sensor_counter[sensor] += 1
        platform_counter[platform] += 1
        for alg_part in [p.strip() for p in re.split(r"[,;/|]+", algo) if p.strip()]:
            algo_counter[alg_part] += 1

        # Bucket outcome type label cleanly
        ol = outcome_txt.lower()
        if "f1" in ol:
            outcome_label = "F1-Score"
        elif "auc" in ol or "roc" in ol:
            outcome_label = "AUC-ROC"
        elif "rmse" in ol or "mae" in ol:
            outcome_label = "Error (RMSE / MAE)"
        elif "r2" in ol or "r²" in ol:
            outcome_label = "Coefficient of Determination (R²)"
        elif "accuracy" in ol or "oa" in ol:
            outcome_label = "Classification Accuracy"
        elif "latency" in ol or "time" in ol or "fps" in ol:
            outcome_label = "Operational Latency / Speed"
        else:
            outcome_label = "Domain-Specific Quantitative Outcome"
        outcome_counter[outcome_label] += 1

        combined_num_text = f"{metrics_str} {ext.get('effectSizeOrAccuracy', '')} {ext.get('keyFindings', '')} {art.get('abstract', '')}"
        nums = _extract_numeric_metrics(combined_num_text)
        for mk, vals in nums.items():
            metric_summaries[mk].extend(vals)

        primary_perf = None
        if nums.get("accuracy_pct"):
            primary_perf = nums["accuracy_pct"][0] / 100.0
        elif nums.get("f1_score"):
            primary_perf = nums["f1_score"][0]
        elif nums.get("auc_roc"):
            primary_perf = nums["auc_roc"][0]
        elif nums.get("r2"):
            primary_perf = nums["r2"][0]

        if primary_perf is not None:
            for alg_part in [p.strip() for p in re.split(r"[,;/|]+", algo) if p.strip()]:
                if alg_part != "Not Specified":
                    algo_perf[alg_part].append(primary_perf)

        study_trace_rows.append(
            {
                "articleId": art.get("id"),
                "title": art.get("title", ""),
                "year": art.get("year"),
                "category": cat,
                "country": country,
                "continent": continent,
                "design": design,
                "database": db,
                "sensor": sensor,
                "platform": platform,
                "algorithm": algo,
                "outcomeType": outcome_label,
                "appraisalScore": art.get("appraisalScore"),
                "riskOfBias": art.get("riskOfBiasAssessment") or "Unassessed",
            }
        )

    # Sort publication year chronologically
    sorted_years = sorted(year_counter.keys(), key=lambda y: (y == "N/A", y))
    pub_year_dist = [
        {
            "year": y,
            "count": year_counter[y],
            "originalCount": year_orig[y],
            "reviewCount": year_rev[y],
            "percentage": round((year_counter[y] / max(len(cohort), 1)) * 100.0, 2),
        }
        for y in sorted_years
    ]

    # Algorithm comparison summary
    algorithm_dist = []
    for alg_label, cnt in algo_counter.most_common():
        scores = algo_perf.get(alg_label, [])
        algorithm_dist.append(
            {
                "algorithm": alg_label,
                "count": cnt,
                "percentage": round((cnt / max(len(cohort), 1)) * 100.0, 2),
                "meanNormalizedScore": round(sum(scores) / len(scores), 4) if scores else None,
                "reportedScoreCount": len(scores),
            }
        )

    # Research Objectives / RQs Contribution Matrix (100% traceable by articleId)
    rqs = project.get("researchQuestions") or []
    rq_contributions = []
    for rq in rqs:
        code = str(rq.get("code") or "RQ")
        q_text = str(rq.get("question") or "")
        ev_text = str(rq.get("mainEvidenceToCollect") or "")
        terms = [
            w for w in re.split(r"[^a-z0-9]+", f"{q_text} {ev_text}".lower())
            if len(w) >= 3 and w not in STOPWORDS
        ]
        unique_terms = list(dict.fromkeys(terms))
        contributing_ids: List[str] = []
        contributing_titles: List[str] = []
        for art in cohort:
            ext = art.get("extractedData") or {}
            blob = " ".join(
                [
                    str(art.get("title") or ""),
                    str(art.get("abstract") or ""),
                    str(ext.get("platform") or ""),
                    str(ext.get("sensor") or ""),
                    str(ext.get("algorithm") or ""),
                    str(ext.get("metrics") or ""),
                    str(ext.get("latency") or ""),
                    str(ext.get("keyFindings") or ""),
                    str(ext.get("matchedPicocSummary") or ""),
                ]
            ).lower()
            hits = [t for t in unique_terms if t in blob]
            if len(hits) >= 2 or (len(unique_terms) <= 2 and len(hits) >= 1) or code.lower() in blob:
                contributing_ids.append(str(art.get("id")))
                contributing_titles.append(str(art.get("title") or ""))
        rq_contributions.append(
            {
                "code": code,
                "question": q_text,
                "mainEvidenceToCollect": ev_text,
                "count": len(contributing_ids),
                "percentage": round((len(contributing_ids) / max(len(cohort), 1)) * 100.0, 2),
                "contributingArticleIds": contributing_ids,
                "contributingTitles": contributing_titles,
            }
        )

    metric_aggregates = {}
    for mk, vals in metric_summaries.items():
        if vals:
            s_vals = sorted(vals)
            mid = len(s_vals) // 2
            med = s_vals[mid] if len(s_vals) % 2 == 1 else (s_vals[mid - 1] + s_vals[mid]) / 2.0
            metric_aggregates[mk] = {
                "count": len(vals),
                "min": round(min(vals), 4),
                "max": round(max(vals), 4),
                "mean": round(sum(vals) / len(vals), 4),
                "median": round(med, 4),
            }

    return {
        "counts": {
            "totalIdentified": total_identified,
            "duplicatesRemoved": len(duplicates),
            "uniqueRecords": len(non_dups),
            "screened": len(screened),
            "excluded": len(excluded),
            "uncertain": len(uncertain),
            "unscreened": len(unscreened),
            "included": len(included),
            "includedOriginalResearch": inc_orig,
            "includedReviews": inc_rev,
            "includedOriginalPct": round((inc_orig / max(len(included), 1)) * 100.0, 2),
            "includedReviewPct": round((inc_rev / max(len(included), 1)) * 100.0, 2),
            "identifiedOriginalResearch": id_orig,
            "identifiedReviews": id_rev,
        },
        "publicationYearDistribution": pub_year_dist,
        "countryDistribution": _dist_list(country_counter, len(cohort)),
        "continentDistribution": _dist_list(continent_counter, len(cohort)),
        "researchDesignDistribution": _dist_list(design_counter, len(cohort)),
        "databaseIdentificationDistribution": _dist_list(db_counter, len(non_dups)),
        "databaseIncludedDistribution": _dist_list(included_db_counter, len(cohort)),
        "sensorDistribution": _dist_list(sensor_counter, len(cohort)),
        "platformDistribution": _dist_list(platform_counter, len(cohort)),
        "algorithmDistribution": algorithm_dist,
        "outcomeDistribution": _dist_list(outcome_counter, len(cohort)),
        "researchObjectiveContributions": rq_contributions,
        "extractedMetricAggregates": metric_aggregates,
        "studyTraceRows": study_trace_rows,
    }
