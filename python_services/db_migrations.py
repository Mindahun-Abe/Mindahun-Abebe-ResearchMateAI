import json
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

DEFAULT_DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "database",
    "quant_synthesis.sqlite",
)

MIGRATIONS = [
    (
        1,
        "initial_quant_synthesis_schema",
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS quant_study_extractions (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            article_id TEXT NOT NULL,
            study_cluster_id TEXT NOT NULL,
            outcome_type TEXT NOT NULL DEFAULT 'primary_outcome',
            outcome_label TEXT NOT NULL DEFAULT '',
            effect_measure TEXT NOT NULL DEFAULT 'SMD',
            subgroup TEXT NOT NULL DEFAULT 'Unassigned',
            moderator_year INTEGER,
            moderator_quality REAL,
            moderator_sample_size REAL,
            original_data_json TEXT NOT NULL DEFAULT '{}',
            effect_size REAL,
            se REAL,
            variance REAL,
            ci_low REAL,
            ci_high REAL,
            extraction_status TEXT NOT NULL DEFAULT 'pending',
            verified_by TEXT NOT NULL DEFAULT '',
            pdf_page_numbers TEXT NOT NULL DEFAULT '',
            supporting_evidence TEXT NOT NULL DEFAULT '',
            eligibility_status TEXT NOT NULL DEFAULT 'pending',
            eligibility_override TEXT NOT NULL DEFAULT 'auto',
            eligibility_reasons_json TEXT NOT NULL DEFAULT '[]',
            double_count_guard_note TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_qse_project
            ON quant_study_extractions(project_id);
        CREATE INDEX IF NOT EXISTS idx_qse_article
            ON quant_study_extractions(project_id, article_id);

        CREATE TABLE IF NOT EXISTS quant_analysis_runs (
            run_id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            review_type TEXT NOT NULL,
            framework_type TEXT NOT NULL,
            effect_measure TEXT NOT NULL,
            model_type TEXT NOT NULL,
            estimator TEXT NOT NULL,
            software_version TEXT NOT NULL,
            config_json TEXT NOT NULL DEFAULT '{}',
            total_studies INTEGER NOT NULL DEFAULT 0,
            pooled_effect REAL,
            se REAL,
            ci_low REAL,
            ci_high REAL,
            tau2 REAL,
            i2 REAL,
            q_stat REAL,
            q_df INTEGER,
            q_pvalue REAL,
            pred_low REAL,
            pred_high REAL,
            results_json TEXT NOT NULL DEFAULT '{}',
            analysis_date TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_qar_project
            ON quant_analysis_runs(project_id, analysis_date);

        CREATE TABLE IF NOT EXISTS quant_audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT NOT NULL,
            action TEXT NOT NULL,
            actor TEXT NOT NULL DEFAULT 'system',
            details_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_qal_project
            ON quant_audit_log(project_id, created_at);
        """,
    ),
    (
        2,
        "add_study_arm_and_weights_columns",
        """
        -- Handled safely via pragma column checks in migrate_db() to guarantee non-destructive upgrade
        SELECT 1;
        """,
    ),
]


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    target = db_path or os.environ.get("RESEARCHMATE_QUANT_DB") or DEFAULT_DB_PATH
    parent = os.path.dirname(target)
    if parent:
        os.makedirs(parent, exist_ok=True)
    conn = sqlite3.connect(target, timeout=15.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def _ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    cols = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in cols:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def migrate_db(db_path: Optional[str] = None) -> List[int]:
    """Run idempotent schema migrations without ever deleting existing records."""
    conn = get_connection(db_path)
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at TEXT NOT NULL
            )
            """
        )
        applied = {
            row["version"]
            for row in conn.execute("SELECT version FROM schema_migrations").fetchall()
        }
        newly_applied: List[int] = []
        for version, name, sql in MIGRATIONS:
            if version in applied:
                continue
            conn.executescript(sql)
            if version == 2:
                _ensure_column(conn, "quant_study_extractions", "weight_fe", "REAL")
                _ensure_column(conn, "quant_study_extractions", "weight_re", "REAL")
                _ensure_column(conn, "quant_study_extractions", "study_design", "TEXT NOT NULL DEFAULT ''")
                _ensure_column(conn, "quant_study_extractions", "units", "TEXT NOT NULL DEFAULT ''")
            conn.execute(
                "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
                (version, name, _utc_now()),
            )
            newly_applied.append(version)
        conn.commit()
        return newly_applied
    finally:
        conn.close()


def upsert_study_extractions(
    project_id: str,
    records: List[Dict[str, Any]],
    db_path: Optional[str] = None,
) -> None:
    if not records:
        return
    migrate_db(db_path)
    conn = get_connection(db_path)
    now = _utc_now()
    try:
        for rec in records:
            rec_id = str(rec.get("id") or f"qse-{project_id}-{rec.get('articleId', '')}")
            conn.execute(
                """
                INSERT INTO quant_study_extractions (
                    id, project_id, article_id, study_cluster_id, outcome_type, outcome_label,
                    effect_measure, subgroup, moderator_year, moderator_quality, moderator_sample_size,
                    original_data_json, effect_size, se, variance, ci_low, ci_high,
                    weight_fe, weight_re, study_design, units,
                    extraction_status, verified_by, pdf_page_numbers, supporting_evidence,
                    eligibility_status, eligibility_override, eligibility_reasons_json,
                    double_count_guard_note, updated_at
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
                ON CONFLICT(id) DO UPDATE SET
                    study_cluster_id=excluded.study_cluster_id,
                    outcome_type=excluded.outcome_type,
                    outcome_label=excluded.outcome_label,
                    effect_measure=excluded.effect_measure,
                    subgroup=excluded.subgroup,
                    moderator_year=excluded.moderator_year,
                    moderator_quality=excluded.moderator_quality,
                    moderator_sample_size=excluded.moderator_sample_size,
                    original_data_json=excluded.original_data_json,
                    effect_size=excluded.effect_size,
                    se=excluded.se,
                    variance=excluded.variance,
                    ci_low=excluded.ci_low,
                    ci_high=excluded.ci_high,
                    weight_fe=excluded.weight_fe,
                    weight_re=excluded.weight_re,
                    study_design=excluded.study_design,
                    units=excluded.units,
                    extraction_status=excluded.extraction_status,
                    verified_by=excluded.verified_by,
                    pdf_page_numbers=excluded.pdf_page_numbers,
                    supporting_evidence=excluded.supporting_evidence,
                    eligibility_status=excluded.eligibility_status,
                    eligibility_override=excluded.eligibility_override,
                    eligibility_reasons_json=excluded.eligibility_reasons_json,
                    double_count_guard_note=excluded.double_count_guard_note,
                    updated_at=excluded.updated_at
                """,
                (
                    rec_id,
                    project_id,
                    str(rec.get("articleId") or ""),
                    str(rec.get("studyClusterId") or rec.get("articleId") or rec_id),
                    str(rec.get("outcomeType") or "primary_outcome"),
                    str(rec.get("outcomeLabel") or ""),
                    str(rec.get("effectMeasure") or "SMD"),
                    str(rec.get("subgroup") or "Unassigned"),
                    rec.get("moderatorYear"),
                    rec.get("moderatorQuality"),
                    rec.get("moderatorSampleSize"),
                    json.dumps(rec.get("originalData") or {}),
                    rec.get("effectSize"),
                    rec.get("se"),
                    rec.get("variance"),
                    rec.get("ciLow"),
                    rec.get("ciHigh"),
                    rec.get("weightFe"),
                    rec.get("weightRe"),
                    str(rec.get("studyDesign") or ""),
                    str(rec.get("units") or ""),
                    str(rec.get("extractionStatus") or "extracted"),
                    str(rec.get("verifiedBy") or ""),
                    str(rec.get("pdfPageNumbers") or ""),
                    str(rec.get("supportingEvidence") or ""),
                    str(rec.get("eligibilityStatus") or "pending"),
                    str(rec.get("eligibilityOverride") or "auto"),
                    json.dumps(rec.get("eligibilityReasons") or []),
                    str(rec.get("doubleCountGuardNote") or ""),
                    str(rec.get("updatedAt") or now),
                ),
            )
        conn.commit()
    finally:
        conn.close()


def load_study_extractions(project_id: str, db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    migrate_db(db_path)
    conn = get_connection(db_path)
    try:
        rows = conn.execute(
            "SELECT * FROM quant_study_extractions WHERE project_id = ? ORDER BY updated_at DESC",
            (project_id,),
        ).fetchall()
        out: List[Dict[str, Any]] = []
        for r in rows:
            out.append(
                {
                    "id": r["id"],
                    "projectId": r["project_id"],
                    "articleId": r["article_id"],
                    "studyClusterId": r["study_cluster_id"],
                    "outcomeType": r["outcome_type"],
                    "outcomeLabel": r["outcome_label"],
                    "effectMeasure": r["effect_measure"],
                    "subgroup": r["subgroup"],
                    "moderatorYear": r["moderator_year"],
                    "moderatorQuality": r["moderator_quality"],
                    "moderatorSampleSize": r["moderator_sample_size"],
                    "originalData": json.loads(r["original_data_json"] or "{}"),
                    "effectSize": r["effect_size"],
                    "se": r["se"],
                    "variance": r["variance"],
                    "ciLow": r["ci_low"],
                    "ciHigh": r["ci_high"],
                    "weightFe": r["weight_fe"],
                    "weightRe": r["weight_re"],
                    "studyDesign": r["study_design"],
                    "units": r["units"],
                    "extractionStatus": r["extraction_status"],
                    "verifiedBy": r["verified_by"],
                    "pdfPageNumbers": r["pdf_page_numbers"],
                    "supportingEvidence": r["supporting_evidence"],
                    "eligibilityStatus": r["eligibility_status"],
                    "eligibilityOverride": r["eligibility_override"],
                    "eligibilityReasons": json.loads(r["eligibility_reasons_json"] or "[]"),
                    "doubleCountGuardNote": r["double_count_guard_note"],
                    "updatedAt": r["updated_at"],
                }
            )
        return out
    finally:
        conn.close()


def save_analysis_run(
    project_id: str,
    run_summary: Dict[str, Any],
    db_path: Optional[str] = None,
) -> None:
    migrate_db(db_path)
    conn = get_connection(db_path)
    try:
        conn.execute(
            """
            INSERT OR REPLACE INTO quant_analysis_runs (
                run_id, project_id, review_type, framework_type, effect_measure,
                model_type, estimator, software_version, config_json, total_studies,
                pooled_effect, se, ci_low, ci_high, tau2, i2, q_stat, q_df,
                q_pvalue, pred_low, pred_high, results_json, analysis_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(run_summary.get("runId") or f"run-{project_id}-{int(datetime.now().timestamp())}"),
                project_id,
                str(run_summary.get("reviewType") or "slr"),
                str(run_summary.get("frameworkType") or "PICOC"),
                str(run_summary.get("effectMeasure") or "SMD"),
                str(run_summary.get("modelType") or "random"),
                str(run_summary.get("estimator") or "DL"),
                str(run_summary.get("softwareVersion") or ""),
                json.dumps(run_summary.get("config") or {}),
                int(run_summary.get("totalStudies") or 0),
                run_summary.get("pooledEffect"),
                run_summary.get("se"),
                run_summary.get("ciLow"),
                run_summary.get("ciHigh"),
                run_summary.get("tau2"),
                run_summary.get("i2"),
                run_summary.get("qStat"),
                run_summary.get("qDf"),
                run_summary.get("qPvalue"),
                run_summary.get("predLow"),
                run_summary.get("predHigh"),
                json.dumps(run_summary),
                str(run_summary.get("analysisDate") or _utc_now()),
            ),
        )
        conn.commit()
    finally:
        conn.close()


def log_audit_event(
    project_id: str,
    action: str,
    actor: str = "system",
    details: Optional[Dict[str, Any]] = None,
    db_path: Optional[str] = None,
) -> None:
    migrate_db(db_path)
    conn = get_connection(db_path)
    try:
        conn.execute(
            "INSERT INTO quant_audit_log (project_id, action, actor, details_json, created_at) VALUES (?, ?, ?, ?, ?)",
            (project_id, action, actor, json.dumps(details or {}), _utc_now()),
        )
        conn.commit()
    finally:
        conn.close()


def load_audit_and_runs(project_id: str, db_path: Optional[str] = None) -> Dict[str, Any]:
    migrate_db(db_path)
    conn = get_connection(db_path)
    try:
        runs = [
            {
                "runId": r["run_id"],
                "projectId": r["project_id"],
                "reviewType": r["review_type"],
                "frameworkType": r["framework_type"],
                "effectMeasure": r["effect_measure"],
                "modelType": r["model_type"],
                "estimator": r["estimator"],
                "softwareVersion": r["software_version"],
                "totalStudies": r["total_studies"],
                "pooledEffect": r["pooled_effect"],
                "ciLow": r["ci_low"],
                "ciHigh": r["ci_high"],
                "i2": r["i2"],
                "tau2": r["tau2"],
                "analysisDate": r["analysis_date"],
            }
            for r in conn.execute(
                "SELECT * FROM quant_analysis_runs WHERE project_id = ? ORDER BY analysis_date DESC LIMIT 20",
                (project_id,),
            ).fetchall()
        ]
        logs = [
            {
                "id": r["id"],
                "action": r["action"],
                "actor": r["actor"],
                "details": json.loads(r["details_json"] or "{}"),
                "createdAt": r["created_at"],
            }
            for r in conn.execute(
                "SELECT * FROM quant_audit_log WHERE project_id = ? ORDER BY id DESC LIMIT 50",
                (project_id,),
            ).fetchall()
        ]
        migrations = [
            {
                "version": r["version"],
                "name": r["name"],
                "appliedAt": r["applied_at"],
            }
            for r in conn.execute("SELECT * FROM schema_migrations ORDER BY version ASC").fetchall()
        ]
        return {"runs": runs, "auditLog": logs, "migrations": migrations}
    finally:
        conn.close()
