import json
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List

from python_services import SOFTWARE_VERSION
from python_services.db_migrations import (
    load_audit_and_runs,
    load_study_extractions,
    log_audit_event,
    migrate_db,
    save_analysis_run,
    upsert_study_extractions,
)
from python_services.descriptive_synthesis import compute_descriptive_synthesis
from python_services.eligibility_engine import assess_eligibility_batch
from python_services.meta_analysis_engine import run_full_meta_analysis
from python_services.protocol_engine import (
    approve_and_lock_protocol,
    load_protocol_state,
    restore_protocol_version,
    save_protocol_state,
    validate_protocol,
)


def _merge_study_records(
    project: Dict[str, Any],
    articles: List[Dict[str, Any]],
    incoming_records: List[Dict[str, Any]],
    db_records: List[Dict[str, Any]],
    default_measure: str,
) -> List[Dict[str, Any]]:
    by_id: Dict[str, Dict[str, Any]] = {}
    for rec in db_records:
        if rec.get("id"):
            by_id[str(rec["id"])] = rec
    for rec in incoming_records:
        if rec.get("id"):
            by_id[str(rec["id"])] = rec

    # Ensure every included article has a traceable record stub (without fabricating numbers!)
    article_ids_present = {str(r.get("articleId")) for r in by_id.values() if r.get("articleId")}
    for art in articles:
        if art.get("isDuplicate") or art.get("decision") != "include":
            continue
        art_id = str(art.get("id"))
        ext = art.get("extractedData") or {}
        authors = art.get("authors") or []
        first_author = str(authors[0]).split(",")[0].split(" ")[0] if authors else "Study"
        study_label = f"{first_author} ({art.get('year') or 'N/A'})"
        if art_id not in article_ids_present:
            rec_id = f"qse-{project.get('id', 'proj')}-{art_id}"
            cits = art.get("evidenceCitations") or []
            pages = ",".join(str(c.get("pageNumber")) for c in cits if c.get("pageNumber") is not None)
            quote = str(cits[0].get("quote") or "") if cits else ""
            by_id[rec_id] = {
                "id": rec_id,
                "projectId": project.get("id"),
                "articleId": art_id,
                "studyLabel": study_label,
                "title": art.get("title", ""),
                "authors": authors,
                "year": art.get("year"),
                "studyClusterId": "",
                "outcomeType": "primary_outcome",
                "outcomeLabel": str(ext.get("effectSizeOrAccuracy") or ext.get("metrics") or "Primary Outcome"),
                "effectMeasure": default_measure,
                "subgroup": str(ext.get("sensor") or ext.get("geographicRegion") or "Unassigned"),
                "moderatorYear": art.get("year"),
                "moderatorQuality": art.get("appraisalScore"),
                "moderatorSampleSize": None,
                "studyDesign": str(ext.get("studyType") or art.get("paperSubType") or "Empirical Study"),
                "units": "",
                "originalData": {},
                "extractionStatus": "awaiting_numerical_entry",
                "verifiedBy": "",
                "pdfPageNumbers": pages,
                "supportingEvidence": quote,
                "eligibilityOverride": "auto",
            }
        else:
            # Refresh descriptive metadata on matching records
            for rec in by_id.values():
                if str(rec.get("articleId")) == art_id:
                    rec.setdefault("studyLabel", study_label)
                    rec.setdefault("title", art.get("title", ""))
                    rec.setdefault("year", art.get("year"))
                    if rec.get("moderatorYear") is None:
                        rec["moderatorYear"] = art.get("year")
                    if rec.get("moderatorQuality") is None:
                        rec["moderatorQuality"] = art.get("appraisalScore")

    return list(by_id.values())


def handle_command(payload: Dict[str, Any]) -> Dict[str, Any]:
    action = payload.get("action")
    db_path = payload.get("dbPath")
    project = payload.get("project") or {}
    project_id = str(payload.get("projectId") or project.get("id") or "")

    migrations_applied = migrate_db(db_path)

    if action == "load_state":
        records = load_study_extractions(project_id, db_path)
        audit = load_audit_and_runs(project_id, db_path)
        return {
            "success": True,
            "projectId": project_id,
            "softwareVersion": SOFTWARE_VERSION,
            "records": records,
            **audit,
            "migrationsApplied": migrations_applied,
        }

    if action == "save_record":
        record = payload.get("record")
        if not record or not project_id:
            return {"success": False, "error": "projectId and record are required"}
        upsert_study_extractions(project_id, [record], db_path)
        log_audit_event(
            project_id,
            "upsert_study_extraction",
            actor=str(payload.get("actor") or "researcher"),
            details={"recordId": record.get("id"), "articleId": record.get("articleId")},
            db_path=db_path,
        )
        return {
            "success": True,
            "records": load_study_extractions(project_id, db_path),
        }

    if action == "import_dataset":
        records = payload.get("records") or []
        if not project_id or not isinstance(records, list):
            return {"success": False, "error": "projectId and records array required"}
        upsert_study_extractions(project_id, records, db_path)
        log_audit_event(
            project_id,
            "import_quantitative_dataset",
            actor=str(payload.get("actor") or "researcher"),
            details={"importedCount": len(records)},
            db_path=db_path,
        )
        return {
            "success": True,
            "importedCount": len(records),
            "records": load_study_extractions(project_id, db_path),
        }

    if action == "get_audit":
        audit = load_audit_and_runs(project_id, db_path)
        return {"success": True, "projectId": project_id, **audit}

    if action == "analyze":
        articles = payload.get("articles") or project.get("articles") or []
        config = payload.get("config") or {}
        incoming_records = payload.get("records") or []
        db_records = load_study_extractions(project_id, db_path) if project_id else []
        merged_records = _merge_study_records(
            project,
            articles,
            incoming_records,
            db_records,
            str(config.get("effectMeasure") or "SMD"),
        )

        descriptive = compute_descriptive_synthesis(project, articles)
        assessed_records = assess_eligibility_batch(project, articles, merged_records, config)
        eligible = [r for r in assessed_records if r.get("eligibilityStatus") == "eligible"]
        meta_analysis = run_full_meta_analysis(eligible, assessed_records, config)

        # Merge weights back onto assessed records for complete traceability
        weight_map = {}
        if meta_analysis.get("overall") and meta_analysis["overall"].get("studies"):
            for ws in meta_analysis["overall"]["studies"]:
                weight_map[ws.get("id")] = (ws.get("weightFe"), ws.get("weightRe"))
        for rec in assessed_records:
            w = weight_map.get(rec.get("id"))
            if w:
                rec["weightFe"] = w[0]
                rec["weightRe"] = w[1]

        now_iso = datetime.now(timezone.utc).isoformat()
        run_id = f"qrun-{project_id}-{int(datetime.now().timestamp())}"
        overall = meta_analysis.get("overall") or {}
        het = overall.get("heterogeneity") or {}
        pi = overall.get("predictionInterval") or {}

        run_summary = {
            "runId": run_id,
            "projectId": project_id,
            "reviewType": str(config.get("reviewType") or project.get("reviewType") or "slr"),
            "frameworkType": str(config.get("frameworkType") or project.get("frameworkType") or "PICOC"),
            "effectMeasure": str(config.get("effectMeasure") or "SMD"),
            "modelType": str(config.get("modelType") or "random"),
            "estimator": str(config.get("estimator") or "DL"),
            "softwareVersion": SOFTWARE_VERSION,
            "config": config,
            "totalStudies": len(eligible),
            "pooledEffect": overall.get("pooledEffect"),
            "se": overall.get("se"),
            "ciLow": overall.get("ciLow"),
            "ciHigh": overall.get("ciHigh"),
            "tau2": het.get("tau2"),
            "i2": het.get("i2"),
            "qStat": het.get("qStat"),
            "qDf": het.get("qDf"),
            "qPvalue": het.get("qPvalue"),
            "predLow": pi.get("low"),
            "predHigh": pi.get("high"),
            "analysisDate": now_iso,
        }

        if project_id:
            upsert_study_extractions(project_id, assessed_records, db_path)
            save_analysis_run(project_id, run_summary, db_path)
            log_audit_event(
                project_id,
                "execute_quantitative_meta_analysis",
                actor=str(payload.get("actor") or "researcher"),
                details={
                    "runId": run_id,
                    "eligibleStudies": len(eligible),
                    "totalRecordsEvaluated": len(assessed_records),
                    "effectMeasure": config.get("effectMeasure"),
                    "modelType": config.get("modelType"),
                    "estimator": config.get("estimator"),
                },
                db_path=db_path,
            )

        audit = load_audit_and_runs(project_id, db_path) if project_id else {"runs": [], "auditLog": [], "migrations": []}
        return {
            "success": True,
            "runId": run_id,
            "analysisDate": now_iso,
            "softwareVersion": SOFTWARE_VERSION,
            "descriptive": descriptive,
            "records": assessed_records,
            "metaAnalysis": meta_analysis,
            "audit": audit,
        }

    if action == "load_protocol":
        state = load_protocol_state(project_id, db_path)
        return {"success": True, "projectId": project_id, **state}

    if action == "validate_protocol":
        protocol = payload.get("protocol") or {}
        articles = payload.get("articles") or project.get("articles") or []
        validated = validate_protocol(protocol, articles)
        return {"success": True, "projectId": project_id, **validated}

    if action == "save_protocol":
        protocol = payload.get("protocol") or {}
        articles = payload.get("articles") or project.get("articles") or []
        actor = str(payload.get("actor") or "Researcher")
        amendment_info = payload.get("amendmentInfo")
        state = save_protocol_state(project_id, protocol, articles, actor, amendment_info, db_path)
        return {"success": True, "projectId": project_id, **state}

    if action == "approve_protocol":
        protocol = payload.get("protocol") or {}
        articles = payload.get("articles") or project.get("articles") or []
        actor = str(payload.get("actor") or "Researcher")
        change_summary = str(payload.get("changeSummary") or "Researcher approved and locked protocol version")
        state = approve_and_lock_protocol(project_id, protocol, articles, actor, change_summary, db_path)
        return {"success": True, "projectId": project_id, **state}

    if action == "restore_protocol_version":
        version_id = str(payload.get("versionId") or "")
        actor = str(payload.get("actor") or "Researcher")
        if not version_id:
            return {"success": False, "error": "versionId is required"}
        state = restore_protocol_version(project_id, version_id, actor, db_path)
        return {"success": True, "projectId": project_id, **state}

    return {"success": False, "error": f"Unknown action '{action}'"}


def main() -> None:
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except Exception as exc:
        print(json.dumps({"success": False, "error": f"Invalid JSON stdin: {exc}"}))
        sys.exit(1)

    result = handle_command(payload)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
