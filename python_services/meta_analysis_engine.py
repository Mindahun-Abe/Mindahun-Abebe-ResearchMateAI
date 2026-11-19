import math
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

Z_95 = 1.959963984540054


def _norm_cdf(x: float) -> float:
    return 0.5 * math.erfc(-x / math.sqrt(2.0))


def _two_tailed_z_p(z: float) -> float:
    return max(0.0, min(1.0, 2.0 * (1.0 - _norm_cdf(abs(z)))))


def _t_critical_975(df: int) -> float:
    """Accurate 97.5th percentile Student's t critical value for df >= 1."""
    if df <= 0:
        return Z_95
    table = {
        1: 12.7062047364,
        2: 4.3026527299,
        3: 3.1824463053,
        4: 2.7764451052,
        5: 2.5705818366,
        6: 2.4469118511,
        7: 2.3646242516,
        8: 2.3060041352,
        9: 2.2621571628,
        10: 2.2281388520,
        11: 2.2009851601,
        12: 2.1788128297,
        13: 2.1603686565,
        14: 2.1447866879,
        15: 2.1314495456,
        16: 2.1199052992,
        17: 2.1098155778,
        18: 2.1009220402,
        19: 2.0930240544,
        20: 2.0859634473,
        25: 2.0595385528,
        30: 2.0422724563,
        40: 2.0210753830,
        60: 2.0002978211,
        120: 1.9799304051,
    }
    if df in table:
        return table[df]
    if df < 30:
        # Linear interp from nearest keys
        keys = sorted(table.keys())
        for i in range(len(keys) - 1):
            if keys[i] <= df <= keys[i + 1]:
                frac = (df - keys[i]) / (keys[i + 1] - keys[i])
                return table[keys[i]] + frac * (table[keys[i + 1]] - table[keys[i]])
    # Cornish-Fisher approximation for df > 20
    z = Z_95
    return z + (z**3 + z) / (4.0 * df) + (5.0 * z**5 + 16.0 * z**3 + 3.0 * z) / (96.0 * df * df)


def _gamma_q(a: float, x: float) -> float:
    """Upper regularized incomplete gamma Q(a, x) = P(chi2_{2a} >= 2x)."""
    if x <= 0.0 or a <= 0.0:
        return 1.0
    gln = math.lgamma(a)
    if x < a + 1.0:
        ap = a
        summ = 1.0 / a
        delta = summ
        for _ in range(200):
            ap += 1.0
            delta *= x / ap
            summ += delta
            if abs(delta) < abs(summ) * 1e-12:
                break
        p = summ * math.exp(-x + a * math.log(x) - gln)
        return max(0.0, min(1.0, 1.0 - p))
    else:
        b = x + 1.0 - a
        c = 1e30
        d = 1.0 / max(b, 1e-30)
        h = d
        for i in range(1, 200):
            an = -i * (i - a)
            b += 2.0
            d = an * d + b
            if abs(d) < 1e-30:
                d = 1e-30
            c = b + an / c
            if abs(c) < 1e-30:
                c = 1e-30
            d = 1.0 / d
            delta = d * c
            h *= delta
            if abs(delta - 1.0) < 1e-12:
                break
        q = math.exp(-x + a * math.log(x) - gln) * h
        return max(0.0, min(1.0, q))


def _chi2_p_value(q_stat: float, df: int) -> float:
    if df <= 0 or q_stat <= 0.0:
        return 1.0
    return _gamma_q(0.5 * df, 0.5 * q_stat)


def back_transform(measure: str, val: Optional[float]) -> Optional[float]:
    if val is None:
        return None
    m = (measure or "SMD").upper()
    if m in ("OR", "RR"):
        try:
            return round(math.exp(max(-20.0, min(20.0, val))), 6)
        except OverflowError:
            return None
    if m == "COR":
        return round(math.tanh(val), 6)
    if m == "PROP":
        if val >= 20:
            return 1.0
        if val <= -20:
            return 0.0
        return round(1.0 / (1.0 + math.exp(-val)), 6)
    return round(val, 6)


def _compute_tau2_paule_mandel(y: List[float], v: List[float]) -> float:
    df = len(y) - 1
    if df <= 0:
        return 0.0

    def q_gen(tau2: float) -> float:
        w = [1.0 / (vi + tau2) for vi in v]
        sw = sum(w)
        mu = sum(wi * yi for wi, yi in zip(w, y)) / sw
        return sum(wi * (yi - mu) ** 2 for wi, yi in zip(w, y))

    if q_gen(0.0) <= df:
        return 0.0
    low = 0.0
    high = max(0.1, max(v) * 10.0, sum((yi - sum(y) / len(y)) ** 2 for yi in y))
    for _ in range(40):
        if q_gen(high) <= df:
            break
        high *= 2.0
    for _ in range(80):
        mid = 0.5 * (low + high)
        if q_gen(mid) > df:
            low = mid
        else:
            high = mid
    return max(0.0, 0.5 * (low + high))


def _compute_tau2_reml(y: List[float], v: List[float], dl_init: float) -> float:
    k = len(y)
    if k <= 1:
        return 0.0
    tau2 = max(0.0, dl_init)
    for _ in range(100):
        w = [1.0 / (vi + tau2) for vi in v]
        sw = sum(w)
        if sw <= 0:
            break
        mu = sum(wi * yi for wi, yi in zip(w, y)) / sw
        # Fisher scoring step (Viechtbauer 2005)
        tr_p = sum(wi - (wi * wi) / sw for wi in w)
        tr_p2 = sum((wi * wi) for wi in w) - 2.0 * sum((wi**3) for wi in w) / sw + (sum(wi * wi for wi in w) / sw) ** 2
        score = sum((wi * wi) * ((yi - mu) ** 2) for wi, yi in zip(w, y)) - tr_p
        info = max(tr_p2, 1e-12)
        step = score / info
        next_tau2 = max(0.0, tau2 + step)
        if abs(next_tau2 - tau2) < 1e-9:
            tau2 = next_tau2
            break
        tau2 = next_tau2
    return max(0.0, tau2)


def pool_studies(
    studies: List[Dict[str, Any]],
    effect_measure: str = "SMD",
    model_type: str = "random",
    estimator: str = "DL",
) -> Optional[Dict[str, Any]]:
    """Core Fixed-Effect and Random-Effects inverse-variance pooling."""
    valid = [s for s in studies if s.get("effectSize") is not None and s.get("variance") and s["variance"] > 0]
    k = len(valid)
    if k == 0:
        return None

    y = [float(s["effectSize"]) for s in valid]
    v = [float(s["variance"]) for s in valid]
    w_fe = [1.0 / vi for vi in v]
    sum_w_fe = sum(w_fe)
    mu_fe = sum(wi * yi for wi, yi in zip(w_fe, y)) / sum_w_fe
    se_fe = math.sqrt(1.0 / sum_w_fe)
    ci_low_fe = mu_fe - Z_95 * se_fe
    ci_high_fe = mu_fe + Z_95 * se_fe
    z_fe = mu_fe / se_fe
    p_fe = _two_tailed_z_p(z_fe)

    q_stat = sum(wi * (yi - mu_fe) ** 2 for wi, yi in zip(w_fe, y))
    df = k - 1
    q_pvalue = _chi2_p_value(q_stat, df) if df >= 1 else 1.0
    c_val = sum_w_fe - (sum(wi * wi for wi in w_fe) / sum_w_fe) if sum_w_fe > 0 else 1.0
    tau2_dl = max(0.0, (q_stat - df) / c_val) if (df >= 1 and c_val > 0) else 0.0

    est = (estimator or "DL").upper()
    if est == "REML":
        tau2 = _compute_tau2_reml(y, v, tau2_dl)
    elif est == "PM":
        tau2 = _compute_tau2_paule_mandel(y, v)
    else:
        est = "DL"
        tau2 = tau2_dl

    i2 = max(0.0, ((q_stat - df) / q_stat) * 100.0) if (df >= 1 and q_stat > 0) else 0.0
    h2 = (q_stat / df) if (df >= 1 and q_stat > 0) else 1.0

    w_re = [1.0 / (vi + tau2) for vi in v]
    sum_w_re = sum(w_re)
    mu_re = sum(wi * yi for wi, yi in zip(w_re, y)) / sum_w_re
    se_re = math.sqrt(1.0 / sum_w_re)
    ci_low_re = mu_re - Z_95 * se_re
    ci_high_re = mu_re + Z_95 * se_re
    z_re = mu_re / se_re
    p_re = _two_tailed_z_p(z_re)

    # Prediction interval (Borenstein / Higgins, requires k >= 3)
    pred_low = None
    pred_high = None
    if k >= 3:
        t_crit = _t_critical_975(k - 2)
        pi_half = t_crit * math.sqrt(se_re * se_re + tau2)
        pred_low = mu_re - pi_half
        pred_high = mu_re + pi_half

    selected_is_fixed = (model_type or "random").lower() == "fixed"
    active_mu = mu_fe if selected_is_fixed else mu_re
    active_se = se_fe if selected_is_fixed else se_re
    active_ci_low = ci_low_fe if selected_is_fixed else ci_low_re
    active_ci_high = ci_high_fe if selected_is_fixed else ci_high_re
    active_z = z_fe if selected_is_fixed else z_re
    active_p = p_fe if selected_is_fixed else p_re

    # Attach percentage weights for forest plot rendering
    study_rows = []
    for i, s in enumerate(valid):
        w_fe_pct = (w_fe[i] / sum_w_fe) * 100.0
        w_re_pct = (w_re[i] / sum_w_re) * 100.0
        study_rows.append(
            {
                **s,
                "weightFe": round(w_fe_pct, 3),
                "weightRe": round(w_re_pct, 3),
                "activeWeight": round(w_fe_pct if selected_is_fixed else w_re_pct, 3),
                "displayEffect": back_transform(effect_measure, s["effectSize"]),
                "displayCiLow": back_transform(effect_measure, s["ciLow"]),
                "displayCiHigh": back_transform(effect_measure, s["ciHigh"]),
            }
        )

    return {
        "k": k,
        "effectMeasure": effect_measure.upper(),
        "modelType": "fixed" if selected_is_fixed else "random",
        "estimator": est,
        "pooledEffect": round(active_mu, 6),
        "se": round(active_se, 6),
        "ciLow": round(active_ci_low, 6),
        "ciHigh": round(active_ci_high, 6),
        "zStat": round(active_z, 4),
        "pValue": round(active_p, 6),
        "displayPooledEffect": back_transform(effect_measure, active_mu),
        "displayCiLow": back_transform(effect_measure, active_ci_low),
        "displayCiHigh": back_transform(effect_measure, active_ci_high),
        "fixedEffect": {
            "pooledEffect": round(mu_fe, 6),
            "se": round(se_fe, 6),
            "ciLow": round(ci_low_fe, 6),
            "ciHigh": round(ci_high_fe, 6),
            "zStat": round(z_fe, 4),
            "pValue": round(p_fe, 6),
            "displayPooledEffect": back_transform(effect_measure, mu_fe),
            "displayCiLow": back_transform(effect_measure, ci_low_fe),
            "displayCiHigh": back_transform(effect_measure, ci_high_fe),
        },
        "randomEffects": {
            "pooledEffect": round(mu_re, 6),
            "se": round(se_re, 6),
            "ciLow": round(ci_low_re, 6),
            "ciHigh": round(ci_high_re, 6),
            "zStat": round(z_re, 4),
            "pValue": round(p_re, 6),
            "displayPooledEffect": back_transform(effect_measure, mu_re),
            "displayCiLow": back_transform(effect_measure, ci_low_re),
            "displayCiHigh": back_transform(effect_measure, ci_high_re),
        },
        "heterogeneity": {
            "qStat": round(q_stat, 4),
            "qDf": df,
            "qPvalue": round(q_pvalue, 6),
            "i2": round(i2, 2),
            "h2": round(h2, 4),
            "tau2": round(tau2, 6),
            "tau": round(math.sqrt(tau2), 6),
            "tau2DL": round(tau2_dl, 6),
        },
        "predictionInterval": (
            {
                "low": round(pred_low, 6),
                "high": round(pred_high, 6),
                "displayLow": back_transform(effect_measure, pred_low),
                "displayHigh": back_transform(effect_measure, pred_high),
            }
            if pred_low is not None and pred_high is not None
            else None
        ),
        "studies": study_rows,
    }


def run_subgroup_analysis(
    studies: List[Dict[str, Any]],
    subgroup_field: str,
    effect_measure: str,
    model_type: str,
    estimator: str,
) -> Dict[str, Any]:
    groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for s in studies:
        val = str(s.get(subgroup_field) or s.get("subgroup") or "Unassigned").strip() or "Unassigned"
        groups[val].append(s)

    subgroup_rows = []
    q_within_fe = 0.0
    sum_w_mu_fe = 0.0
    sum_w_fe_total = 0.0

    for label, grp_studies in sorted(groups.items(), key=lambda x: (-len(x[1]), x[0])):
        res = pool_studies(grp_studies, effect_measure=effect_measure, model_type=model_type, estimator=estimator)
        if not res:
            continue
        q_within_fe += res["heterogeneity"]["qStat"]
        fe = res["fixedEffect"]
        w_grp = 1.0 / (fe["se"] * fe["se"])
        sum_w_fe_total += w_grp
        sum_w_mu_fe += w_grp * fe["pooledEffect"]
        subgroup_rows.append(
            {
                "subgroup": label,
                "k": res["k"],
                "pooledEffect": res["pooledEffect"],
                "ciLow": res["ciLow"],
                "ciHigh": res["ciHigh"],
                "displayPooledEffect": res["displayPooledEffect"],
                "displayCiLow": res["displayCiLow"],
                "displayCiHigh": res["displayCiHigh"],
                "pValue": res["pValue"],
                "i2": res["heterogeneity"]["i2"],
                "tau2": res["heterogeneity"]["tau2"],
                "qStat": res["heterogeneity"]["qStat"],
            }
        )

    overall = pool_studies(studies, effect_measure=effect_measure, model_type=model_type, estimator=estimator)
    q_between = None
    df_between = max(0, len(subgroup_rows) - 1)
    p_between = None
    if overall and len(subgroup_rows) >= 2:
        q_total_fe = overall["heterogeneity"]["qStat"]
        q_between = max(0.0, q_total_fe - q_within_fe)
        p_between = _chi2_p_value(q_between, df_between)

    return {
        "subgroupField": subgroup_field,
        "subgroups": subgroup_rows,
        "qBetween": round(q_between, 4) if q_between is not None else None,
        "dfBetween": df_between,
        "pBetween": round(p_between, 6) if p_between is not None else None,
    }


def run_sensitivity_leave_one_out(
    studies: List[Dict[str, Any]],
    effect_measure: str,
    model_type: str,
    estimator: str,
) -> List[Dict[str, Any]]:
    if len(studies) < 2:
        return []
    out = []
    for idx, omitted in enumerate(studies):
        subset = [s for j, s in enumerate(studies) if j != idx]
        res = pool_studies(subset, effect_measure=effect_measure, model_type=model_type, estimator=estimator)
        if not res:
            continue
        out.append(
            {
                "omittedId": omitted.get("id"),
                "omittedArticleId": omitted.get("articleId"),
                "omittedLabel": omitted.get("studyLabel") or omitted.get("title") or omitted.get("articleId"),
                "kRemaining": res["k"],
                "pooledEffect": res["pooledEffect"],
                "ciLow": res["ciLow"],
                "ciHigh": res["ciHigh"],
                "displayPooledEffect": res["displayPooledEffect"],
                "displayCiLow": res["displayCiLow"],
                "displayCiHigh": res["displayCiHigh"],
                "i2": res["heterogeneity"]["i2"],
                "tau2": res["heterogeneity"]["tau2"],
                "pValue": res["pValue"],
            }
        )
    return out


def run_meta_regression(
    studies: List[Dict[str, Any]],
    moderator_key: str,
    tau2: float,
) -> Optional[Dict[str, Any]]:
    """Weighted least-squares random-effects meta-regression y = b0 + b1 * x when k >= 4."""
    pts: List[Tuple[float, float, float, str]] = []
    for s in studies:
        y = s.get("effectSize")
        v = s.get("variance")
        x = s.get(moderator_key)
        if y is None or v is None or v <= 0 or x is None:
            continue
        try:
            xf = float(x)
            if math.isfinite(xf):
                pts.append((xf, float(y), 1.0 / (float(v) + max(0.0, tau2)), str(s.get("studyLabel") or s.get("articleId"))))
        except (TypeError, ValueError):
            continue

    k = len(pts)
    if k < 4:
        return None
    xs = [p[0] for p in pts]
    if max(xs) - min(xs) <= 1e-12:
        return None

    sw = sum(p[2] for p in pts)
    swx = sum(p[2] * p[0] for p in pts)
    swy = sum(p[2] * p[1] for p in pts)
    swxx = sum(p[2] * p[0] * p[0] for p in pts)
    swxy = sum(p[2] * p[0] * p[1] for p in pts)

    denom = sw * swxx - swx * swx
    if abs(denom) <= 1e-12:
        return None

    slope = (sw * swxy - swx * swy) / denom
    intercept = (swy - slope * swx) / sw
    se_slope = math.sqrt(max(0.0, sw / denom))
    se_intercept = math.sqrt(max(0.0, swxx / denom))
    z_slope = slope / se_slope if se_slope > 0 else 0.0
    p_slope = _two_tailed_z_p(z_slope)

    # QM heterogeneity explained
    qm = z_slope * z_slope
    mean_y = swy / sw
    q_total = sum(p[2] * (p[1] - mean_y) ** 2 for p in pts)
    q_resid = sum(p[2] * (p[1] - (intercept + slope * p[0])) ** 2 for p in pts)
    r2_analog = max(0.0, min(100.0, ((q_total - q_resid) / q_total) * 100.0)) if q_total > 0 else 0.0

    return {
        "moderatorKey": moderator_key,
        "k": k,
        "intercept": round(intercept, 6),
        "slope": round(slope, 6),
        "seSlope": round(se_slope, 6),
        "seIntercept": round(se_intercept, 6),
        "zStat": round(z_slope, 4),
        "pValue": round(p_slope, 6),
        "qm": round(qm, 4),
        "r2Analog": round(r2_analog, 2),
        "points": [
            {"x": p[0], "y": round(p[1], 6), "weight": round(p[2], 4), "label": p[3]}
            for p in pts
        ],
    }


def run_publication_bias(studies: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Egger's weighted regression test and Begg-Mazumdar rank correlation."""
    valid = [s for s in studies if s.get("effectSize") is not None and s.get("se") and s["se"] > 0]
    k = len(valid)
    if k < 3:
        return {
            "eligible": False,
            "k": k,
            "advisory": "Publication bias tests require at least 3 studies (and Cochrane recommends >= 10 for adequate statistical power).",
        }

    # Egger's test: regress SND = y / SE on precision = 1 / SE
    x = [1.0 / float(s["se"]) for s in valid]
    y = [float(s["effectSize"]) / float(s["se"]) for s in valid]
    n = float(k)
    mx = sum(x) / n
    my = sum(y) / n
    sxx = sum((xi - mx) ** 2 for xi in x)
    sxy = sum((xi - mx) * (yi - my) for xi, yi in zip(x, y))
    if sxx <= 1e-12:
        return {
            "eligible": False,
            "k": k,
            "advisory": "All studies have identical standard errors; Egger's precision slope is undefined.",
        }
    slope = sxy / sxx
    intercept = my - slope * mx
    rss = sum((yi - (intercept + slope * xi)) ** 2 for xi, yi in zip(x, y))
    df = k - 2
    s2 = rss / max(df, 1)
    se_int = math.sqrt(max(0.0, s2 * ((1.0 / n) + (mx * mx) / sxx)))
    t_int = intercept / se_int if se_int > 1e-12 else 0.0
    # Approximate two-sided p using normal if large df or scaled t via Cornish-Fisher
    p_egger = _two_tailed_z_p(t_int * (1.0 - 1.0 / max(4 * df, 4)))

    # Begg-Mazumdar Kendall tau correlation between standardized effect and variance
    v = [float(s["variance"]) for s in valid]
    concordant = 0
    discordant = 0
    for i in range(k):
        for j in range(i + 1, k):
            dy = (float(valid[i]["effectSize"]) - float(valid[j]["effectSize"]))
            dv = (v[i] - v[j])
            if dy * dv > 0:
                concordant += 1
            elif dy * dv < 0:
                discordant += 1
    pairs = k * (k - 1) / 2.0
    tau_b = (concordant - discordant) / pairs if pairs > 0 else 0.0
    var_tau = (2.0 * (2.0 * k + 5.0)) / (9.0 * k * (k - 1.0)) if k > 1 else 1.0
    z_begg = tau_b / math.sqrt(var_tau) if var_tau > 0 else 0.0
    p_begg = _two_tailed_z_p(z_begg)

    advisory = (
        "Caution: k < 10 studies; publication bias tests have low statistical power (Cochrane Handbook Ch. 13)."
        if k < 10
        else ("Statistically significant funnel asymmetry detected (p < 0.05)." if p_egger < 0.05 else "No statistically significant funnel asymmetry detected (p >= 0.05).")
    )
    return {
        "eligible": True,
        "k": k,
        "eggerIntercept": round(intercept, 4),
        "eggerSe": round(se_int, 4),
        "eggerT": round(t_int, 4),
        "eggerPvalue": round(p_egger, 6),
        "beggTau": round(tau_b, 4),
        "beggPvalue": round(p_begg, 6),
        "advisory": advisory,
    }


def run_influence_diagnostics(
    pool_result: Optional[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    if not pool_result or pool_result.get("k", 0) < 3:
        return []
    studies = pool_result["studies"]
    mu = pool_result["pooledEffect"]
    tau2 = pool_result["heterogeneity"]["tau2"]
    is_fixed = pool_result["modelType"] == "fixed"
    t2 = 0.0 if is_fixed else tau2
    weights = [1.0 / (float(s["variance"]) + t2) for s in studies]
    sum_w = sum(weights)

    diagnostics = []
    for i, s in enumerate(studies):
        yi = float(s["effectSize"])
        vi = float(s["variance"])
        wi = weights[i]
        hat = wi / sum_w
        var_resid = max((vi + t2) * (1.0 - hat), 1e-12)
        z_resid = (yi - mu) / math.sqrt(var_resid)
        cooks_like = (z_resid * z_resid) * (hat / max(1.0 - hat, 1e-9))
        diagnostics.append(
            {
                "id": s.get("id"),
                "articleId": s.get("articleId"),
                "studyLabel": s.get("studyLabel") or s.get("title") or s.get("articleId"),
                "hatWeight": round(hat * 100.0, 2),
                "standardizedResidual": round(z_resid, 4),
                "cooksDistance": round(cooks_like, 4),
                "isOutlier": abs(z_resid) >= 2.0,
                "isInfluential": cooks_like >= (4.0 / len(studies)) or hat >= 0.35,
            }
        )
    return diagnostics


def run_full_meta_analysis(
    eligible_studies: List[Dict[str, Any]],
    all_assessed_records: List[Dict[str, Any]],
    config: Dict[str, Any],
) -> Dict[str, Any]:
    effect_measure = str(config.get("effectMeasure") or "SMD").upper()
    model_type = str(config.get("modelType") or "random").lower()
    estimator = str(config.get("estimator") or "DL").upper()
    subgroup_field = str(config.get("subgroupBy") or "subgroup")
    moderator_key = str(config.get("metaRegressionModerator") or "moderatorYear")

    # Separate analysis per outcome type present in assessed records
    by_outcome: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for rec in eligible_studies:
        by_outcome[str(rec.get("outcomeType") or "primary_outcome")].append(rec)

    outcome_stratified = []
    for out_name, out_studies in by_outcome.items():
        if len(out_studies) >= 2:
            out_pool = pool_studies(out_studies, effect_measure=effect_measure, model_type=model_type, estimator=estimator)
            if out_pool:
                outcome_stratified.append({"outcomeType": out_name, **out_pool})
        else:
            outcome_stratified.append(
                {
                    "outcomeType": out_name,
                    "k": len(out_studies),
                    "insufficient": True,
                    "reason": "Requires at least 2 independent compatible studies to compute pooled estimate.",
                    "studies": out_studies,
                }
            )

    if len(eligible_studies) < 2:
        return {
            "pooledAvailable": False,
            "reason": (
                f"Only {len(eligible_studies)} compatible independent study found for {effect_measure}. "
                "At least 2 independent studies with valid effect sizes and variances are required to pool."
            ),
            "k": len(eligible_studies),
            "effectMeasure": effect_measure,
            "modelType": model_type,
            "estimator": estimator,
            "overall": None,
            "subgroupAnalysis": None,
            "sensitivityAnalysis": [],
            "metaRegression": None,
            "publicationBias": {"eligible": False, "k": len(eligible_studies), "advisory": "Insufficient studies (k < 2)."},
            "influenceDiagnostics": [],
            "outcomeStratified": outcome_stratified,
        }

    overall = pool_studies(eligible_studies, effect_measure=effect_measure, model_type=model_type, estimator=estimator)
    subgroup_res = run_subgroup_analysis(eligible_studies, subgroup_field, effect_measure, model_type, estimator)
    sensitivity_res = run_sensitivity_leave_one_out(eligible_studies, effect_measure, model_type, estimator)
    tau2_active = overall["heterogeneity"]["tau2"] if (overall and model_type != "fixed") else 0.0
    meta_reg = run_meta_regression(eligible_studies, moderator_key, tau2_active)
    pub_bias = run_publication_bias(eligible_studies)
    influence = run_influence_diagnostics(overall)

    return {
        "pooledAvailable": True,
        "reason": None,
        "k": len(eligible_studies),
        "effectMeasure": effect_measure,
        "modelType": model_type,
        "estimator": estimator,
        "overall": overall,
        "subgroupAnalysis": subgroup_res,
        "sensitivityAnalysis": sensitivity_res,
        "metaRegression": meta_reg,
        "publicationBias": pub_bias,
        "influenceDiagnostics": influence,
        "outcomeStratified": outcome_stratified,
    }
