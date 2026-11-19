import os
import tempfile
import unittest

from python_services.cli_runner import handle_command
from python_services.db_migrations import load_study_extractions, migrate_db, upsert_study_extractions
from python_services.protocol_engine import (
    approve_and_lock_protocol,
    load_protocol_state,
    restore_protocol_version,
    save_protocol_state,
    validate_database_search_syntax,
    validate_protocol,
)


def _sample_valid_protocol(project_id: str = "proj-proto-1"):
    return {
        "id": f"prot-{project_id}",
        "projectId": project_id,
        "versionNumber": "1.0",
        "status": "draft",
        "activeStep": 1,
        "author": "Dr. Researcher",
        "lockedSections": [],
        "topicAnalysis": {
            "initialTopicInput": "UAV multispectral remote sensing for crop disease monitoring",
            "proposedTitle": "Unmanned Aerial Vehicle Multispectral Sensing for Crop Disease Detection: A Systematic Review",
            "discipline": "Agricultural & Environmental Remote Sensing",
            "domain": "Precision Agriculture",
            "subdomain": "UAV Crop Health Monitoring",
            "focusAndScope": "Peer-reviewed empirical studies using UAV multispectral imagery.",
            "theoreticalMotivation": "Bridge high-resolution spectral sensing and scalable field diagnostics.",
            "researchProblem": "Variability in sensor calibration and generalization across crop types.",
            "knowledgeGaps": "Provisional gap pending full literature screening and synthesis.",
            "knowledgeGapVerifiedByEvidence": False,
            "geographicEligibility": "Global (open to all regions)",
            "publicationYearEligibility": "2015-2026",
            "eligibleStudyDesigns": "Experimental field trials, observational validation studies",
            "eligiblePublicationTypes": "Peer-reviewed journal articles and conference proceedings",
            "targetPopulation": "Agricultural field crops",
            "interventionOrFocus": "UAV-mounted multispectral imaging and ML classification",
            "comparisonBaseline": "Ground-truth agronomic scouting or RGB baselines",
            "measurableOutcomes": "Classification accuracy, F1-score, R-squared, RMSE",
            "contextAndConstraints": "Open-field agricultural environments",
            "isPreliminaryAiSuggestion": True,
            "approvedByResearcher": True,
        },
        "reviewMethodRecommendation": {
            "recommendedReviewType": "slr",
            "recommendedPrimaryFramework": "PICOC",
            "complementaryFrameworks": ["PICO"],
            "methodologicalGuidance": "Cochrane Handbook / Kitchenham SLR Guidelines",
            "reportingGuideline": "PRISMA 2020 & PRISMA-S",
            "recommendedAppraisalRoleNote": "Design-specific tools (JBI / QUADAS-2) applied per study type.",
            "justification": "Structured intervention and empirical evaluation questions align with PICOC.",
            "alternatives": [],
            "approvedByResearcher": True,
        },
        "frameworkComponents": [
            {
                "id": "fw-p",
                "frameworkId": "PICOC",
                "componentCode": "P",
                "componentName": "Population",
                "definition": "Target agricultural crops under study",
                "proposedContent": "Cereal, horticultural, and specialty field crops",
                "keywords": ["crop", "maize", "wheat"],
                "synonyms": ["agricultural field", "cultivated plant"],
                "inclusionImplications": "Include open-field agricultural crops",
                "exclusionImplications": "Exclude purely indoor laboratory tissue assays",
                "correspondingRqCodes": ["RQ1"],
                "dataExtractionRequirements": ["Crop species", "Study location"],
                "consistencyNotes": [],
                "status": "approved",
            },
            {
                "id": "fw-i",
                "frameworkId": "PICOC",
                "componentCode": "I",
                "componentName": "Intervention",
                "definition": "UAV sensing technology and algorithms",
                "proposedContent": "UAV multispectral sensors and deep learning pipelines",
                "keywords": ["UAV", "multispectral"],
                "synonyms": ["drone", "unmanned aerial vehicle"],
                "inclusionImplications": "Include UAV optical/multispectral platforms",
                "exclusionImplications": "Exclude satellite-only studies without UAV data",
                "correspondingRqCodes": ["RQ1", "RQ2"],
                "dataExtractionRequirements": ["Sensor model", "Algorithm"],
                "consistencyNotes": [],
                "status": "approved",
            },
        ],
        "generalObjective": "Systematically evaluate UAV multispectral workflows for field crop disease detection.",
        "specificObjectives": [
            {"code": "SO1", "statement": "Catalog UAV sensor configurations and target crops.", "mappedRqCodes": ["RQ1"], "status": "approved"},
            {"code": "SO2", "statement": "Evaluate detection performance metrics across algorithms.", "mappedRqCodes": ["RQ2"], "status": "approved"},
        ],
        "rqMappings": [
            {
                "code": "RQ1",
                "question": "Which UAV multispectral sensors and spectral bands are deployed across crop disease studies?",
                "mappedFrameworkComponents": ["P", "I"],
                "mappedObjectives": ["SO1"],
                "searchConcepts": ["UAV", "multispectral", "crop disease"],
                "eligibilityRequirements": "Original UAV field experiments",
                "requiredExtractionVariables": ["Sensor model", "Spectral bands"],
                "evidenceType": "Empirical hardware and experimental metadata",
                "proposedSynthesisMethod": "Descriptive frequency tabulation and narrative synthesis",
                "consistencyIssues": [],
                "status": "approved",
            },
            {
                "code": "RQ2",
                "question": "What classification accuracy and F1-score do machine learning models achieve on field validation?",
                "mappedFrameworkComponents": ["I", "O"],
                "mappedObjectives": ["SO2"],
                "searchConcepts": ["classification", "accuracy", "F1-score"],
                "eligibilityRequirements": "Studies reporting quantitative validation metrics",
                "requiredExtractionVariables": ["Classification accuracy", "F1-score"],
                "evidenceType": "Quantitative validation metrics",
                "proposedSynthesisMethod": "Descriptive performance distribution & conditional meta-analysis",
                "consistencyIssues": [],
                "status": "approved",
            },
        ],
        "eligibilityMatrix": [
            {
                "id": "el-1",
                "criterion": "Publication Year",
                "inclusionRequirement": "Published between 2015 and 2026",
                "exclusionRequirement": "Published before 2015",
                "guidance": "Captures modern lightweight multispectral UAV sensors.",
                "status": "approved",
            }
        ],
        "standardizedExclusionReasons": [
            "Not UAV-based (satellite or handheld only)",
            "Published before 2015",
            "Review/editorial without primary empirical data",
        ],
        "databaseSearchStrategies": [
            {
                "id": "db-scopus",
                "databaseName": "Scopus",
                "searchPlatform": "Elsevier Scopus",
                "exactSearchString": 'TITLE-ABS-KEY(("UAV" OR "unmanned aerial vehicle" OR "drone") AND ("multispectral" OR "hyperspectral") AND ("crop disease" OR "plant stress"))',
                "searchFields": "TITLE-ABS-KEY",
                "keywordsAndSynonyms": ["UAV", "unmanned aerial vehicle", "multispectral", "crop disease"],
                "searchFilters": "Articles & Conference Papers; 2015-2026",
                "publicationYearRestrictions": "2015-2026",
                "languageRestrictions": "English",
                "executionDate": "",
                "actualRetrievalCount": None,
                "strategyVersion": "1.0",
                "verificationStatus": "validated",
                "syntaxIssues": [],
                "alternativeStrategy": "",
                "executedByResearcher": False,
            }
        ],
        "methodologySections": [],
        "extractionPlan": [
            {
                "id": "ext-1",
                "rqCode": "RQ1",
                "relatedObjective": "SO1",
                "variableName": "Sensor model",
                "definition": "Camera/multispectral sensor name and bands",
                "dataType": "categorical",
                "measurementUnits": "nm / bands",
                "expectedEvidenceSource": "Methods section",
                "suggestedExtractionMethod": "Structured dual extraction",
                "proposedSynthesisApproach": "Frequency matrix",
                "approved": True,
            },
            {
                "id": "ext-2",
                "rqCode": "RQ2",
                "relatedObjective": "SO2",
                "variableName": "Classification accuracy",
                "definition": "Overall accuracy reported on held-out field plots",
                "dataType": "numeric",
                "measurementUnits": "Percentage (%)",
                "expectedEvidenceSource": "Results tables",
                "suggestedExtractionMethod": "Quantitative numeric extraction",
                "proposedSynthesisApproach": "Comparative distribution",
                "approved": True,
            },
        ],
        "appraisalPlan": [
            {
                "id": "app-1",
                "studyDesign": "Experimental Field Trials",
                "recommendedInstrument": "JBI Quasi-Experimental Checklist",
                "appraisalDomains": ["Plot randomization", "Ground-truth calibration"],
                "assessmentCriteria": ["Independent validation split"],
                "scoringApproach": "Percentage compliance",
                "verificationStatus": "verified_by_researcher",
                "methodologicalJustification": "Tailored to agronomic experimental setups",
            },
            {
                "id": "app-2",
                "studyDesign": "Diagnostic Accuracy Studies",
                "recommendedInstrument": "QUADAS-2",
                "appraisalDomains": ["Reference standard", "Index test blinding"],
                "assessmentCriteria": ["Cross-site validation"],
                "scoringApproach": "Low / Unclear / High Risk",
                "verificationStatus": "verified_by_researcher",
                "methodologicalJustification": "Standard diagnostic test accuracy bias framework",
            },
        ],
        "synthesisPlan": {
            "qualitativeMethods": ["Thematic matrix", "Narrative synthesis by crop & sensor"],
            "quantitativeMethods": ["Descriptive distributions", "Weighted summary where variances exist"],
            "metaAnalysisFeasibility": "conditional",
            "feasibilityChecks": {
                "studyDesignCompatibility": "Must compare homologous validation designs",
                "outcomeComparability": "Accuracy/F1 definitions must align",
                "effectSizeAvailability": "Variances or confusion matrices often omitted in RS papers",
                "statisticalDataAvailability": "Check sample plot n and CI reporting",
                "measurementConsistency": "Separate pixel vs plot-level metrics",
                "heterogeneityExpectation": "High due to crop/growth stage diversity",
                "expectedEligibleStudies": "Assess post-extraction",
                "varianceAvailability": "Verify SE/SD availability before pooling",
            },
            "feasibilityRationale": "Meta-analysis attempted only if homogeneous variance-reported subsets exist.",
            "recommendedAlternatives": ["SWiM narrative synthesis", "Structured vote-counting & box plots"],
            "narrativeSummary": "Dual qualitative + conditional quantitative workflow.",
            "approvedByResearcher": True,
        },
        "prismaChecklist": [],
    }


class TestIntelligentProtocolBuilder(unittest.TestCase):
    def test_search_syntax_validator_database_rules(self):
        scopus_ok = {
            "databaseName": "Scopus",
            "exactSearchString": 'TITLE-ABS-KEY(("UAV" OR "drone") AND ("crop" OR "maize"))',
            "keywordsAndSynonyms": ["UAV", "drone", "crop"],
        }
        self.assertEqual(validate_database_search_syntax(scopus_ok), [])

        unbalanced_pubmed = {
            "databaseName": "PubMed",
            "exactSearchString": 'TITLE-ABS-KEY(("UAV" OR "drone") AND ("crop")',
            "keywordsAndSynonyms": ["UAV"],
        }
        errs = validate_database_search_syntax(unbalanced_pubmed)
        self.assertTrue(any("Unbalanced parentheses" in e for e in errs))
        self.assertTrue(any("PubMed rejects Scopus TITLE-ABS-KEY" in e for e in errs))

        sd_many_ops = {
            "databaseName": "ScienceDirect",
            "exactSearchString": " AND ".join([f"(term{i} OR syn{i})" for i in range(6)]),
            "keywordsAndSynonyms": ["term0", "syn0"],
        }
        sd_errs = validate_database_search_syntax(sd_many_ops)
        self.assertTrue(any("8 Boolean connectors" in e for e in sd_errs))

        gs_long = {
            "databaseName": "Google Scholar",
            "exactSearchString": "TITLE-ABS-KEY(" + ("multispectral " * 25) + ")",
            "keywordsAndSynonyms": ["multispectral"],
        }
        gs_errs = validate_database_search_syntax(gs_long)
        self.assertTrue(any("256-character" in e for e in gs_errs))
        self.assertTrue(any("does not support structured field tags" in e for e in gs_errs))

    def test_cross_section_validation_and_methodological_guards(self):
        prot = _sample_valid_protocol()
        res = validate_protocol(prot, articles=[])
        self.assertEqual(res["validationSummary"]["needsRevisionCount"], 0)
        self.assertIn("NOT a scientific quality score", res["validationSummary"]["disclaimer"])

        # Introduce violations: PRISMA as conduct methodology, conflicting years, scoping+meta-analysis, unmapped objective
        bad = _sample_valid_protocol()
        bad["reviewMethodRecommendation"]["methodologicalGuidance"] = "PRISMA 2020"
        bad["reviewMethodRecommendation"]["recommendedReviewType"] = "scoping"
        bad["synthesisPlan"]["metaAnalysisFeasibility"] = "feasible"
        bad["eligibilityMatrix"][0]["inclusionRequirement"] = "Published 2015-2025"
        bad["eligibilityMatrix"][0]["exclusionRequirement"] = "Published in 2020 or before"
        bad["specificObjectives"].append({"code": "SO3", "statement": "Unmapped objective", "mappedRqCodes": [], "status": "pending"})

        bad_res = validate_protocol(bad, articles=[{"id": "a1", "decision": "include", "extractedData": {"sensor": "RGB"}}])
        issue_ids = {i["issueId"] for i in bad_res["validationIssues"]}
        self.assertIn("VAL-METH-01", issue_ids)
        self.assertIn("VAL-SYN-01", issue_ids)
        self.assertIn("VAL-ELIG-YR-el-1", issue_ids)
        self.assertIn("VAL-OBJ-COV-3", issue_ids)
        # Downstream impact notice without altering any article decisions
        self.assertTrue(bad_res["downstreamImpactWarning"]["hasScreenedArticles"])
        self.assertEqual(bad_res["downstreamImpactWarning"]["screenedCount"], 1)

    def test_sqlite_versioning_amendment_restore_and_migration_preservation(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "proto_test.sqlite")
            migrate_db(db_path)

            # Seed an existing quantitative study record to confirm non-destructive migration & save
            upsert_study_extractions("proj-proto-1", [
                {"id": "q-keep", "projectId": "proj-proto-1", "articleId": "art-1", "effectMeasure": "SMD", "originalData": {"effectSize": 0.55, "se": 0.12}},
            ], db_path)

            prot = _sample_valid_protocol("proj-proto-1")
            saved1 = save_protocol_state("proj-proto-1", prot, actor="Dr. Tester", db_path=db_path)
            self.assertEqual(saved1["protocol"]["versionNumber"], "1.0")
            self.assertEqual(saved1["protocol"]["status"], "draft")

            approved = approve_and_lock_protocol(
                "proj-proto-1",
                saved1["protocol"],
                actor="Dr. Tester",
                change_summary="Initial protocol lock",
                db_path=db_path,
            )
            self.assertEqual(approved["protocol"]["status"], "approved")
            self.assertEqual(len(approved["versions"]), 1)
            v1_id = approved["versions"][0]["versionId"]

            # Amend the approved protocol
            amended_prot = dict(approved["protocol"])
            amended_prot["generalObjective"] = "Expanded objective including thermal sensors."
            amended = save_protocol_state(
                "proj-proto-1",
                amended_prot,
                articles=[{"id": "a1", "decision": "include"}],
                actor="Dr. Tester",
                amendment_info={
                    "modifiedSection": "General Objective",
                    "previousContent": "UAV multispectral workflows",
                    "revisedContent": "UAV multispectral and thermal workflows",
                    "reason": "Added thermal modality post-scoping pilot",
                },
                db_path=db_path,
            )
            self.assertEqual(amended["protocol"]["versionNumber"], "1.1")
            self.assertEqual(amended["protocol"]["status"], "under_review")
            self.assertEqual(len(amended["amendments"]), 1)
            self.assertEqual(amended["amendments"][0]["affectedArticleCount"], 1)

            # Restore v1.0 via CLI handle_command
            restored = handle_command({
                "action": "restore_protocol_version",
                "dbPath": db_path,
                "projectId": "proj-proto-1",
                "versionId": v1_id,
                "actor": "Dr. Tester",
            })
            self.assertTrue(restored["success"])
            self.assertEqual(restored["protocol"]["versionNumber"], "1.2")
            self.assertIn("Systematically evaluate UAV multispectral", restored["protocol"]["generalObjective"])

            # Verify prior quant records untouched
            kept = load_study_extractions("proj-proto-1", db_path)
            self.assertEqual(len(kept), 1)
            self.assertAlmostEqual(kept[0]["originalData"]["effectSize"], 0.55, places=4)

    def test_georef_crossref_overlap_and_downstream_affected_records(self):
        georef_bad = {
            "databaseName": "GeoRef",
            "exactSearchString": 'TITLE-ABS-KEY("gully erosion")',
            "keywordsAndSynonyms": ["gully erosion", "remote sensing"],
        }
        self.assertTrue(any("GeoRef does not use Scopus" in e for e in validate_database_search_syntax(georef_bad)))

        crossref_ok = {
            "databaseName": "Crossref",
            "exactSearchString": "uav multispectral crop disease",
            "keywordsAndSynonyms": ["uav", "multispectral", "crop disease"],
        }
        self.assertEqual(validate_database_search_syntax(crossref_ok), [])

        crossref_bad = {
            "databaseName": "Crossref",
            "exactSearchString": 'TS=("uav" AND "disease")',
            "keywordsAndSynonyms": ["uav", "disease"],
        }
        self.assertTrue(any("Crossref REST" in e for e in validate_database_search_syntax(crossref_bad)))

        prot = _sample_valid_protocol("proj-overlap")
        # Duplicate component keywords between P and I -> overlap warning
        prot["frameworkComponents"][0]["keywords"] = ["uav", "multispectral", "disease"]
        prot["frameworkComponents"][0]["synonyms"] = ["drone"]
        prot["frameworkComponents"][1]["keywords"] = ["uav", "multispectral", "disease"]
        prot["frameworkComponents"][1]["synonyms"] = ["drone"]
        # Identical inclusion and exclusion text
        prot["eligibilityMatrix"].append({
            "id": "el-dup",
            "criterion": "Design",
            "inclusionRequirement": "Empirical studies",
            "exclusionRequirement": "Empirical studies",
            "guidance": "",
            "status": "pending",
        })

        sample_articles = [
            {"id": "art-old", "title": "Legacy Field Paper", "year": 2011, "decision": "include"},
            {"id": "art-ext", "title": "Recent Trial", "year": 2023, "decision": "include", "extractedData": {"sensor": "RGB"}},
        ]
        res = validate_protocol(prot, articles=sample_articles)
        ids = {i["issueId"] for i in res["validationIssues"]}
        self.assertIn("VAL-FW-OVLP-P-I", ids)
        self.assertIn("VAL-ELIG-DUP-el-dup", ids)
        affected = res["downstreamImpactWarning"].get("affectedRecords") or []
        self.assertEqual(len(affected), 2)
        self.assertEqual(affected[0]["id"], "art-old")
        self.assertIn("outside protocol window", affected[0]["reason"])
        # Decisions on source articles remain untouched
        self.assertEqual(sample_articles[0]["decision"], "include")


if __name__ == "__main__":
    unittest.main()
