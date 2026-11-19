import math
import re
from typing import Any, Dict, List, Optional, Tuple

SUPPORTED_MEASURES = {"MD", "SMD", "OR", "RR", "COR", "PROP"}
Z_95 = 1.959963984540054


def _to_float(val: Any) -> Optional[float]:
    if val is None or val == "" or isinstance(val, bool):
        return None
    try:
        num = float(val)
        return num if math.isfinite(num) else None
    except (TypeError, ValueError):
        return None


def _to_int(val: Any) -> Optional[int]:
    f = _to_float(val)
    if f is None:
        return None
    return int(round(f))


def compute_effect_from_raw(
    effect_measure: str,
    raw: Dict[str, Any],
) -> Tuple[Optional[float], Optional[float], Optional[float], Optional[float], List[str], bool]:
    """
    Compute (effect_on_analysis_scale, se, variance, sample_size, error_reasons, continuity_corrected).
    Never fabricates missing numbers!
    """
    measure = (effect_measure or "SMD").upper()
    reasons: List[str] = []
    continuity_corrected = False

    # 1. Precomputed effect + se or CI
    pre_eff = _to_float(raw.get("effectSize"))
    pre_se = _to_float(raw.get("se"))
    pre_var = _to_float(raw.get("variance"))
    pre_ci_low = _to_float(raw.get("ciLow"))
    pre_ci_high = _to_float(raw.get("ciHigh"))
    pre_n = _to_float(raw.get("totalSampleSize") or raw.get("n"))

    if pre_var is not None and pre_var > 0 and pre_se is None:
        pre_se = math.sqrt(pre_var)

    if pre_eff is not None and pre_se is not None and pre_se > 0:
        if measure in ("OR", "RR") and raw.get("isNaturalScaleRatio") is True:
            if pre_eff <= 0:
                return None, None, None, pre_n, ["Ratio effect size must be > 0 for log transformation."], False
            eff = math.log(pre_eff)
            se = pre_se
        elif measure == "COR" and raw.get("isRawCorrelation") is True:
            if abs(pre_eff) >= 1.0:
                return None, None, None, pre_n, ["Correlation r must satisfy -1 < r < 1."], False
            eff = 0.5 * math.log((1.0 + pre_eff) / (1.0 - pre_eff))
            se = pre_se
        else:
            eff = pre_eff
            se = pre_se
        return eff, se, se * se, pre_n, [], False

    if pre_eff is not None and pre_ci_low is not None and pre_ci_high is not None and pre_ci_high > pre_ci_low:
        if measure in ("OR", "RR") and raw.get("isNaturalScaleRatio") is True:
            if pre_eff <= 0 or pre_ci_low <= 0:
                return None, None, None, pre_n, ["Ratio CI bounds must be > 0 for log transformation."], False
            eff = math.log(pre_eff)
            se = (math.log(pre_ci_high) - math.log(pre_ci_low)) / (2.0 * Z_95)
        else:
            eff = pre_eff
            se = (pre_ci_high - pre_ci_low) / (2.0 * Z_95)
        if se > 0:
            return eff, se, se * se, pre_n, [], False

    # 2. Measure-specific raw extraction
    if measure in ("MD", "SMD"):
        m1 = _to_float(raw.get("mean1"))
        sd1 = _to_float(raw.get("sd1"))
        n1 = _to_float(raw.get("n1"))
        m2 = _to_float(raw.get("mean2"))
        sd2 = _to_float(raw.get("sd2"))
        n2 = _to_float(raw.get("n2"))
        missing = [k for k, v in [("mean1", m1), ("sd1", sd1), ("n1", n1), ("mean2", m2), ("sd2", sd2), ("n2", n2)] if v is None]
        if missing:
            reasons.append(f"Missing continuous arm statistics ({', '.join(missing)}) and no precomputed effect+SE provided.")
            return None, None, None, pre_n, reasons, False
        assert m1 is not None and sd1 is not None and n1 is not None and m2 is not None and sd2 is not None and n2 is not None
        if n1 < 2 or n2 < 2 or sd1 <= 0 or sd2 <= 0:
            reasons.append("Invalid sample size (requires n1 >= 2, n2 >= 2) or non-positive SD (requires sd1 > 0, sd2 > 0).")
            return None, None, None, n1 + n2, reasons, False
        if measure == "MD":
            md = m1 - m2
            var = (sd1 * sd1) / n1 + (sd2 * sd2) / n2
            return md, math.sqrt(var), var, n1 + n2, [], False
        else:
            df = n1 + n2 - 2.0
            s_pooled = math.sqrt((((n1 - 1.0) * sd1 * sd1) + ((n2 - 1.0) * sd2 * sd2)) / df)
            if s_pooled <= 0:
                reasons.append("Pooled standard deviation is zero.")
                return None, None, None, n1 + n2, reasons, False
            d = (m1 - m2) / s_pooled
            j = 1.0 - (3.0 / (4.0 * df - 1.0))
            g = j * d
            var_d = ((n1 + n2) / (n1 * n2)) + ((d * d) / (2.0 * (n1 + n2)))
            var_g = (j * j) * var_d
            return g, math.sqrt(var_g), var_g, n1 + n2, [], False

    if measure in ("OR", "RR"):
        e1 = _to_float(raw.get("events1"))
        t1 = _to_float(raw.get("total1") or raw.get("n1"))
        e2 = _to_float(raw.get("events2"))
        t2 = _to_float(raw.get("total2") or raw.get("n2"))
        missing = [k for k, v in [("events1", e1), ("total1", t1), ("events2", e2), ("total2", t2)] if v is None]
        if missing:
            reasons.append(f"Missing 2x2 contingency counts ({', '.join(missing)}) and no precomputed log-{measure} + SE.")
            return None, None, None, pre_n, reasons, False
        assert e1 is not None and t1 is not None and e2 is not None and t2 is not None
        if t1 <= 0 or t2 <= 0 or e1 < 0 or e2 < 0 or e1 > t1 or e2 > t2:
            reasons.append("Invalid 2x2 cell counts (events must be within [0, total] and totals > 0).")
            return None, None, None, t1 + t2, reasons, False
        ne1 = t1 - e1
        ne2 = t2 - e2
        if e1 == 0 and e2 == 0:
            reasons.append("Double-zero events in both arms: study provides no comparative information for ratio pooling.")
            return None, None, None, t1 + t2, reasons, False
        if measure == "OR" and ne1 == 0 and ne2 == 0:
            reasons.append("100% events in both arms: odds ratio undefined without contrast.")
            return None, None, None, t1 + t2, reasons, False
        a, b, c, d_cell = e1, ne1, e2, ne2
        n1_adj, n2_adj = t1, t2
        if a == 0 or b == 0 or c == 0 or d_cell == 0:
            a += 0.5
            b += 0.5
            c += 0.5
            d_cell += 0.5
            n1_adj += 1.0
            n2_adj += 1.0
            continuity_corrected = True
        if measure == "OR":
            log_or = math.log((a * d_cell) / (b * c))
            var = (1.0 / a) + (1.0 / b) + (1.0 / c) + (1.0 / d_cell)
            return log_or, math.sqrt(var), var, t1 + t2, [], continuity_corrected
        else:
            log_rr = math.log((a / n1_adj) / (c / n2_adj))
            var = (1.0 / a) - (1.0 / n1_adj) + (1.0 / c) - (1.0 / n2_adj)
            if var <= 0:
                reasons.append("Computed log-RR variance is non-positive.")
                return None, None, None, t1 + t2, reasons, continuity_corrected
            return log_rr, math.sqrt(var), var, t1 + t2, [], continuity_corrected

    if measure == "COR":
        r = _to_float(raw.get("r") if raw.get("r") is not None else raw.get("correlation"))
        n = _to_float(raw.get("n") or raw.get("totalSampleSize"))
        if r is None or n is None:
            reasons.append("Missing correlation coefficient (r) or sample size (n).")
            return None, None, None, n, reasons, False
        if n <= 3:
            reasons.append("Fisher's z variance 1/(n-3) requires sample size n > 3.")
            return None, None, None, n, reasons, False
        if abs(r) >= 1.0:
            reasons.append("Correlation coefficient must satisfy -1 < r < 1 for Fisher's z transformation.")
            return None, None, None, n, reasons, False
        z = 0.5 * math.log((1.0 + r) / (1.0 - r))
        var = 1.0 / (n - 3.0)
        return z, math.sqrt(var), var, n, [], False

    if measure == "PROP":
        ev = _to_float(raw.get("events") if raw.get("events") is not None else raw.get("events1"))
        tot = _to_float(raw.get("total") or raw.get("n") or raw.get("total1") or raw.get("totalSampleSize"))
        if ev is None or tot is None:
            reasons.append("Missing proportion events count or total sample size (events, total).")
            return None, None, None, tot, reasons, False
        if tot <= 0 or ev < 0 or ev > tot:
            reasons.append("Invalid proportion counts (requires total > 0 and 0 <= events <= total).")
            return None, None, None, tot, reasons, False
        a = ev
        b = tot - ev
        if a == 0 or b == 0:
            a += 0.5
            b += 0.5
            continuity_corrected = True
        logit_p = math.log(a / b)
        var = (1.0 / a) + (1.0 / b)
        return logit_p, math.sqrt(var), var, tot, [], continuity_corrected

    reasons.append(f"Unsupported effect measure '{measure}'.")
    return None, None, None, pre_n, reasons, False


def _normalize_cluster_key(rec: Dict[str, Any], article: Optional[Dict[str, Any]]) -> str:
    explicit = str(rec.get("studyClusterId") or "").strip()
    if explicit:
        return explicit.lower()
    if article:
        doi = str(article.get("doi") or "").strip().lower()
        if doi:
            return f"doi:{doi}"
        authors = article.get("authors") or []
        first_author = re.sub(r"[^a-z0-9]", "", str(authors[0] if authors else "").lower())[:16]
        yr = str(article.get("year") or "")
        if first_author and yr:
            return f"study:{first_author}:{yr}"
    return str(rec.get("articleId") or rec.get("id") or "").lower()


def assess_eligibility_batch(
    project: Dict[str, Any],
    articles: List[Dict[str, Any]],
    extraction_records: List[Dict[str, Any]],
    config: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    Transparent, conservative eligibility assessment for statistical pooling.
    Checks:
      1. Article screening decision (must be included unless explicitly included via record override)
      2. Study design compatibility (separates secondary Reviews from Original Research)
      3. Outcome type & effect measure compatibility (never mixes MD/SMD with OR/RR/COR/PROP)
      4. Sample size, units & statistical completeness (no fabrication)
      5. Observation independence / double-counting cluster guard
      6. Researcher review & approval override
    """
    target_measure = str(config.get("effectMeasure") or "SMD").upper()
    target_outcome = str(config.get("targetOutcomeType") or "all").strip().lower()
    target_units = str(config.get("targetUnits") or "").strip().lower()
    allow_review_pooling = bool(config.get("allowSecondaryReviewPooling", False))
    strict_design = bool(config.get("requireCompatibleStudyDesign", True))

    article_map = {str(a.get("id")): a for a in articles if a.get("id")}
    assessed: List[Dict[str, Any]] = []

    # Track clusters within target outcome to enforce independence (no double-counting)
    cluster_best: Dict[str, Tuple[int, float]] = {}

    # First pass: compute effect sizes and check core criteria
    prelim: List[Dict[str, Any]] = []
    for idx, rec in enumerate(extraction_records):
        art_id = str(rec.get("articleId") or "")
        art = article_map.get(art_id)
        raw = rec.get("originalData") or {}
        rec_measure = str(rec.get("effectMeasure") or target_measure).upper()
        rec_outcome = str(rec.get("outcomeType") or "primary_outcome").strip()
        rec_units = str(rec.get("units") or "").strip()
        design = str(rec.get("studyDesign") or (art.get("extractedData") or {}).get("studyType") or art.get("paperSubType") or "Empirical Study").strip()
        paper_cat = str(art.get("paperCategory") or "").strip() if art else ""
        if not paper_cat and art:
            text = f"{art.get('title', '')} {art.get('abstract', '')}".lower()
            if any(k in text for k in ["systematic review", "meta-analysis", "scoping review"]) and "field experiment" not in text:
                paper_cat = "Review"
            else:
                paper_cat = "Original Research"

        reasons: List[str] = []
        checks_passed: List[str] = []

        # 1. Article Screening Check
        if art and art.get("isDuplicate"):
            reasons.append("Article is marked as a cross-database duplicate.")
        elif art and art.get("decision") != "include" and rec.get("source") != "imported_dataset":
            reasons.append(f"Article screening decision is '{art.get('decision', 'unscreened')}', not 'include'.")
        else:
            checks_passed.append("Screening status: Included / Verified Dataset")

        # 2. Study Design Check
        is_review_paper = paper_cat == "Review" or "review" in design.lower() or "meta-analysis" in design.lower()
        if is_review_paper and not allow_review_pooling:
            reasons.append("Secondary review / meta-analysis article excluded from primary study pooling to avoid unit-of-analysis duplication.")
        else:
            checks_passed.append(f"Study design eligible ({design or 'Empirical'})")

        if strict_design and config.get("allowedStudyDesign") and config["allowedStudyDesign"] != "all":
            if config["allowedStudyDesign"].lower() not in design.lower():
                reasons.append(f"Study design '{design}' differs from selected protocol design '{config['allowedStudyDesign']}'.")

        # 3. Outcome & Measurement Comparability
        if target_outcome not in ("", "all") and rec_outcome.lower() != target_outcome:
            reasons.append(f"Outcome type '{rec_outcome}' does not match selected target outcome '{target_outcome}'.")
        else:
            checks_passed.append(f"Outcome comparable ({rec_outcome})")

        if rec_measure != target_measure:
            reasons.append(
                f"Incompatible effect measure '{rec_measure}' for '{target_measure}' synthesis (incompatible scales are never automatically pooled)."
            )
        else:
            checks_passed.append(f"Effect measure matches ({rec_measure})")

        if target_units and rec_units and target_units != rec_units.lower():
            reasons.append(f"Measurement units '{rec_units}' differ from target units '{config['targetUnits']}'.")

        # 4. Numerical Statistics & Precision Check
        eff, se, var, n_total, num_errors, continuity_corr = compute_effect_from_raw(rec_measure, raw)
        if num_errors or eff is None or se is None or var is None or se <= 0:
            reasons.extend(num_errors or ["Missing valid effect size and standard error / variance."])
        else:
            checks_passed.append(f"Complete numerical statistics (SE={se:.4f})")

        # 5. Compute CI & Cluster ID
        ci_low = eff - Z_95 * se if (eff is not None and se is not None) else None
        ci_high = eff + Z_95 * se if (eff is not None and se is not None) else None
        cluster_id = _normalize_cluster_key(rec, art)

        override = str(rec.get("eligibilityOverride") or "auto").lower()
        status = "eligible" if len(reasons) == 0 else (
            "excluded_incompatible"
            if any("Incompatible" in r or "Outcome type" in r or "Study design" in r or "units" in r for r in reasons)
            else "excluded_review_type"
            if any("Secondary review" in r for r in reasons)
            else "excluded_incomplete"
        )

        if override == "excluded":
            status = "excluded_manual"
            reasons.append("Excluded manually by researcher review.")
        elif override == "approved":
            # Researcher approval can only override conceptual/design flags, NEVER missing math!
            if eff is None or se is None or se <= 0:
                status = "excluded_incomplete"
                reasons.append("Cannot pool: valid numerical effect size and standard error are still missing.")
            elif rec_measure != target_measure:
                status = "excluded_incompatible"
                reasons.append(f"Cannot pool: effect measure '{rec_measure}' cannot be mixed into '{target_measure}' model.")
            else:
                status = "eligible"
                checks_passed.append("Approved by researcher review")

        enriched = {
            **rec,
            "studyClusterId": cluster_id,
            "effectMeasure": rec_measure,
            "outcomeType": rec_outcome,
            "studyDesign": design,
            "effectSize": round(eff, 6) if eff is not None else None,
            "se": round(se, 6) if se is not None else None,
            "variance": round(var, 6) if var is not None else None,
            "ciLow": round(ci_low, 6) if ci_low is not None else None,
            "ciHigh": round(ci_high, 6) if ci_high is not None else None,
            "moderatorSampleSize": n_total if n_total is not None else rec.get("moderatorSampleSize"),
            "continuityCorrected": continuity_corr,
            "checksPassed": checks_passed,
            "eligibilityReasons": reasons,
            "eligibilityStatus": status,
            "doubleCountGuardNote": "",
        }
        prelim.append(enriched)

        if status == "eligible" and se is not None:
            precision = 1.0 / (se * se)
            prev = cluster_best.get(cluster_id)
            if prev is None or precision > prev[1]:
                cluster_best[cluster_id] = (idx, precision)

    # Second pass: enforce independence of observations (prevent double-counting from same study/cluster)
    for idx, rec in enumerate(prelim):
        if rec["eligibilityStatus"] == "eligible":
            cid = rec["studyClusterId"]
            best_idx, _ = cluster_best.get(cid, (idx, 0.0))
            if idx != best_idx:
                rec["eligibilityStatus"] = "excluded_duplicate_cluster"
                rec["doubleCountGuardNote"] = (
                    f"Blocked secondary outcome/arm for study cluster '{cid}' to prevent double-counting. "
                    "Analyze separately by outcome type or select a unique studyClusterId if independent."
                )
                rec["eligibilityReasons"] = [
                    *rec["eligibilityReasons"],
                    rec["doubleCountGuardNote"],
                ]
            else:
                rec["doubleCountGuardNote"] = f"Primary independent observation for cluster '{cid}'."
        assessed.append(rec)

    return assessed
