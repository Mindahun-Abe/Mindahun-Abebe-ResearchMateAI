import os
import tempfile
import unittest

from python_services.cli_runner import handle_command
from python_services.db_migrations import load_study_extractions, migrate_db, upsert_study_extractions
from python_services.descriptive_synthesis import compute_descriptive_synthesis
from python_services.eligibility_engine import assess_eligibility_batch, compute_effect_from_raw
from python_services.meta_analysis_engine import (
    back_transform,
    pool_studies,
    run_meta_regression,
    run_publication_bias,
    run_sensitivity_leave_one_out,
    run_subgroup_analysis,
)


class TestStatisticalMetaAnalysis(unittest.TestCase):
    def test_known_continuous_md_and_hedges_g_borenstein_benchmark(self):
        # Known precomputed inverse-variance dataset (Borenstein et al. 2009, Ch. 12 style)
        # Studies with yi and vi
        studies = [
            {"id": "s1", "articleId": "a1", "studyLabel": "Study 1", "effectSize": 0.10, "variance": 0.04, "se": 0.20, "ciLow": -0.292, "ciHigh": 0.492, "subgroup": "Group A", "moderatorYear": 2018},
            {"id": "s2", "articleId": "a2", "studyLabel": "Study 2", "effectSize": 0.30, "variance": 0.025, "se": 0.1581, "ciLow": -0.01, "ciHigh": 0.61, "subgroup": "Group A", "moderatorYear": 2020},
            {"id": "s3", "articleId": "a3", "studyLabel": "Study 3", "effectSize": 0.50, "variance": 0.05, "se": 0.2236, "ciLow": 0.062, "ciHigh": 0.938, "subgroup": "Group B", "moderatorYear": 2022},
            {"id": "s4", "articleId": "a4", "studyLabel": "Study 4", "effectSize": 0.70, "variance": 0.04, "se": 0.20, "ciLow": 0.308, "ciHigh": 1.092, "subgroup": "Group B", "moderatorYear": 2024},
        ]
        res = pool_studies(studies, effect_measure="SMD", model_type="random", estimator="DL")
        self.assertIsNotNone(res)
        # Exact hand-checked values:
        # w_fe = [25, 40, 20, 25], sum_w = 110
        # mu_fe = (2.5 + 12.0 + 10.0 + 17.5) / 110 = 42.0 / 110 = 0.381818
        self.assertAlmostEqual(res["fixedEffect"]["pooledEffect"], 0.381818, places=4)
        # Q = 25*(0.1-0.381818)^2 + 40*(0.3-0.381818)^2 + 20*(0.5-0.381818)^2 + 25*(0.7-0.381818)^2
        #   = 1.985537 + 0.267769 + 0.279339 + 2.531405 = 5.06405
        self.assertAlmostEqual(res["heterogeneity"]["qStat"], 5.0641, places=3)
        self.assertEqual(res["heterogeneity"]["qDf"], 3)
        # I2 = (5.06405 - 3)/5.06405 * 100 = 40.76%
        self.assertAlmostEqual(res["heterogeneity"]["i2"], 40.76, places=1)
        # C = 110 - (625 + 1600 + 400 + 625)/110 = 110 - 3250/110 = 80.4545
        # tau2_DL = (5.06405 - 3) / 80.4545 = 0.025655
        self.assertAlmostEqual(res["heterogeneity"]["tau2"], 0.025655, places=4)
        self.assertIsNotNone(res["predictionInterval"])

    def test_raw_continuous_hedges_g_computation(self):
        # Known two-group continuous calculation: m1=105, sd1=10, n1=20; m2=100, sd2=10, n2=20
        eff, se, var, n_tot, errs, _ = compute_effect_from_raw(
            "SMD", {"mean1": 105, "sd1": 10, "n1": 20, "mean2": 100, "sd2": 10, "n2": 20}
        )
        self.assertEqual(errs, [])
        self.assertEqual(n_tot, 40)
        # d = 0.5, df = 38, J = 1 - 3/(152 - 1) = 0.980132, g = 0.490066
        self.assertAlmostEqual(eff, 0.490066, places=4)
        self.assertTrue(0.25 < se < 0.40)

    def test_colditz_bcg_odds_ratio_and_risk_ratio(self):
        # Subset of Colditz et al. (1994) BCG Tuberculosis vaccine 2x2 dataset (classic meta-analysis benchmark)
        bcg_trials = [
            ("Aronson", 4, 123, 11, 139),
            ("Ferguson & Simes", 6, 306, 29, 303),
            ("Rosenthal 1960", 3, 231, 11, 220),
            ("Hart & Sutherland", 62, 13598, 248, 12867),
            ("Frimodt-Moller", 33, 5069, 47, 5808),
            ("Stein & Aronson", 180, 1541, 372, 1451),
        ]
        or_studies = []
        for idx, (name, e1, t1, e2, t2) in enumerate(bcg_trials):
            eff, se, var, n_tot, errs, _ = compute_effect_from_raw(
                "OR", {"events1": e1, "total1": t1, "events2": e2, "total2": t2}
            )
            self.assertEqual(errs, [])
            or_studies.append({
                "id": f"bcg-{idx}",
                "articleId": f"art-{idx}",
                "studyLabel": name,
                "effectSize": eff,
                "se": se,
                "variance": var,
                "ciLow": eff - 1.96 * se,
                "ciHigh": eff + 1.96 * se,
                "subgroup": "Randomized" if idx < 3 else "Controlled",
                "moderatorYear": 1950 + idx * 5,
            })

        res_reml = pool_studies(or_studies, effect_measure="OR", model_type="random", estimator="REML")
        self.assertIsNotNone(res_reml)
        # Protective vaccine OR < 1.0
        self.assertLess(res_reml["displayPooledEffect"], 0.65)
        self.assertGreater(res_reml["displayPooledEffect"], 0.25)
        self.assertGreater(res_reml["heterogeneity"]["i2"], 50.0)

        # Subgroup, Sensitivity, Meta-regression, Publication bias
        sub = run_subgroup_analysis(or_studies, "subgroup", "OR", "random", "DL")
        self.assertEqual(len(sub["subgroups"]), 2)
        self.assertIsNotNone(sub["qBetween"])

        loo = run_sensitivity_leave_one_out(or_studies, "OR", "random", "DL")
        self.assertEqual(len(loo), len(bcg_trials))

        reg = run_meta_regression(or_studies, "moderatorYear", res_reml["heterogeneity"]["tau2"])
        self.assertIsNotNone(reg)
        self.assertEqual(reg["k"], 6)

        bias = run_publication_bias(or_studies)
        self.assertTrue(bias["eligible"])

    def test_correlation_fishers_z_and_proportion_logit(self):
        eff_c, se_c, _, _, errs_c, _ = compute_effect_from_raw("COR", {"r": 0.65, "n": 103})
        self.assertEqual(errs_c, [])
        self.assertAlmostEqual(back_transform("COR", eff_c), 0.65, places=4)
        self.assertAlmostEqual(se_c, 0.1, places=5)

        eff_p, se_p, _, _, errs_p, _ = compute_effect_from_raw("PROP", {"events": 75, "total": 100})
        self.assertEqual(errs_p, [])
        self.assertAlmostEqual(back_transform("PROP", eff_p), 0.75, places=4)

    def test_eligibility_prevents_double_counting_and_incompatible_pooling(self):
        project = {"id": "p1", "title": "Test", "researchQuestions": []}
        articles = [
            {"id": "art1", "title": "Primary Field Study", "authors": ["Smith, A."], "year": 2024, "doi": "10.1000/1", "decision": "include", "paperCategory": "Original Research"},
            {"id": "art2", "title": "Another Study", "authors": ["Jones, B."], "year": 2023, "doi": "10.1000/2", "decision": "include", "paperCategory": "Original Research"},
            {"id": "art3", "title": "Literature Review", "authors": ["Lee, C."], "year": 2024, "doi": "10.1000/3", "decision": "include", "paperCategory": "Review"},
        ]
        records = [
            {"id": "r1a", "articleId": "art1", "studyClusterId": "cluster-smith-2024", "effectMeasure": "SMD", "outcomeType": "accuracy", "originalData": {"effectSize": 0.6, "se": 0.15}},
            {"id": "r1b", "articleId": "art1", "studyClusterId": "cluster-smith-2024", "effectMeasure": "SMD", "outcomeType": "accuracy", "originalData": {"effectSize": 0.5, "se": 0.25}},
            {"id": "r2", "articleId": "art2", "studyClusterId": "cluster-jones-2023", "effectMeasure": "OR", "outcomeType": "accuracy", "originalData": {"effectSize": -0.4, "se": 0.20}},
            {"id": "r3", "articleId": "art3", "studyClusterId": "cluster-lee-2024", "effectMeasure": "SMD", "outcomeType": "accuracy", "originalData": {"effectSize": 0.7, "se": 0.18}},
        ]
        assessed = assess_eligibility_batch(project, articles, records, {"effectMeasure": "SMD"})
        by_id = {r["id"]: r for r in assessed}
        self.assertEqual(by_id["r1a"]["eligibilityStatus"], "eligible")
        self.assertEqual(by_id["r1b"]["eligibilityStatus"], "excluded_duplicate_cluster")
        self.assertEqual(by_id["r2"]["eligibilityStatus"], "excluded_incompatible")
        self.assertEqual(by_id["r3"]["eligibilityStatus"], "excluded_review_type")

    def test_descriptive_and_sqlite_migration_preservation(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test_quant.sqlite")
            m1 = migrate_db(db_path)
            self.assertEqual(m1, [1, 2, 3])
            m2 = migrate_db(db_path)
            self.assertEqual(m2, [])

            upsert_study_extractions("proj-test", [
                {"id": "rec-preserve", "projectId": "proj-test", "articleId": "art-1", "effectMeasure": "SMD", "originalData": {"effectSize": 0.42, "se": 0.11}},
            ], db_path)
            migrate_db(db_path)
            loaded = load_study_extractions("proj-test", db_path)
            self.assertEqual(len(loaded), 1)
            self.assertAlmostEqual(loaded[0]["originalData"]["effectSize"], 0.42, places=4)

            res = handle_command({
                "action": "analyze",
                "dbPath": db_path,
                "projectId": "proj-test",
                "project": {
                    "id": "proj-test",
                    "title": "UAV Crop Health Review",
                    "researchQuestions": [{"code": "RQ1", "question": "Which UAV sensors and YOLO algorithms are used?", "mainEvidenceToCollect": "Sensors and algorithms"}],
                },
                "articles": [
                    {
                        "id": "art-1",
                        "title": "UAV Multispectral YOLO Crop Monitoring in Ethiopia",
                        "authors": ["Bekele, T."],
                        "year": 2024,
                        "decision": "include",
                        "sourceDatabase": "Scopus",
                        "paperCategory": "Original Research",
                        "extractedData": {"sensor": "Multispectral", "algorithm": "YOLOv8", "metrics": "Accuracy 94.5%, F1 0.92", "geographicRegion": "Ethiopia"},
                    }
                ],
                "config": {"effectMeasure": "SMD", "modelType": "random", "estimator": "DL"},
            })
            self.assertTrue(res["success"])
            self.assertEqual(res["descriptive"]["counts"]["included"], 1)
            self.assertEqual(res["descriptive"]["researchObjectiveContributions"][0]["count"], 1)
            # Only 1 study => must NOT pool!
            self.assertFalse(res["metaAnalysis"]["pooledAvailable"])


if __name__ == "__main__":
    unittest.main()
