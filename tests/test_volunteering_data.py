"""Regression tests for safeguards that affect what volunteers see."""

import copy
import csv
import datetime as dt
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "volunteering_data.py"
SPEC = importlib.util.spec_from_file_location("volunteering_data", SCRIPT)
data = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(data)
TODAY = dt.date(2026, 9, 18)


def document():
    return {
        "schema_version": 1, "updated": "2026-09-18", "scope": "Test fixture only",
        "areas": [{"id": "london", "name": "London", "lat": 51.5, "lon": -0.1}],
        "records": [{
            "id": "fixture-route", "title": "Fixture referral", "organisation": "Fixture host",
            "area_ids": ["london"], "kind": "programme", "status": "enquiry",
            "themes": ["preparedness"], "description": "A test record, not a real opportunity.",
            "resilience_relevance": "Test assessment.", "employee_fit": ["unknown"],
            "duration": None, "team_size": None, "cost": None, "accessibility": None,
            "requirements": None, "location": None, "coverage_note": "Test coverage.",
            "source_url": "https://example.org/source", "apply_url": "https://example.org/apply",
            "checked_at": "2026-09-18", "review_due": "2026-10-18", "starts_on": None,
            "ends_on": None, "application_deadline": None, "source_published": None,
            "availability_note": "Contact the fixture host; no capacity is known.",
            "evidence": [{"url": "https://example.org/source", "claim": "Fixture evidence."}],
        }],
    }


class FreshnessTests(unittest.TestCase):
    def test_unknown_activity_dates_do_not_become_dates_or_promises(self):
        record = document()["records"][0]
        before = copy.deepcopy(record)
        self.assertEqual(data.freshness(record, TODAY), "current")
        self.assertEqual(record, before)
        self.assertIsNone(record["starts_on"])

    def test_deadline_and_end_date_expire_the_day_after(self):
        for field in ("ends_on", "application_deadline"):
            with self.subTest(field=field):
                record = document()["records"][0]
                record[field] = "2026-09-18"
                self.assertEqual(data.freshness(record, TODAY), "current")
                self.assertEqual(data.freshness(record, TODAY + dt.timedelta(days=1)), "expired")

    def test_due_date_boundary_and_future_check_fail_closed(self):
        record = document()["records"][0]
        record["review_due"] = "2026-09-18"
        self.assertEqual(data.freshness(record, TODAY), "current")
        self.assertEqual(data.freshness(record, TODAY + dt.timedelta(days=1)), "review_required")
        record["checked_at"] = "2026-09-19"
        self.assertEqual(data.freshness(record, TODAY), "review_required")

    def test_missing_invalid_or_reversed_review_dates_fail_closed(self):
        for checked, due in ((None, "2026-10-18"), ("2026-09-18", None),
                             ("2026-09-18", "2026-02-30"), ("2026-09-18", "2026-09-17")):
            with self.subTest(checked=checked, due=due):
                record = document()["records"][0]
                record.update(checked_at=checked, review_due=due)
                self.assertEqual(data.freshness(record, TODAY), "review_required")

    def test_closed_and_expired_take_precedence_over_overdue_review(self):
        record = document()["records"][0]
        record.update(status="closed", ends_on="2026-08-01", review_due="2026-09-01")
        self.assertEqual(data.freshness(record, TODAY), "closed")
        record["status"] = "enquiry"
        self.assertEqual(data.freshness(record, TODAY), "expired")

    def test_future_start_is_a_dated_listing_not_a_new_availability_claim(self):
        record = document()["records"][0]
        record["starts_on"] = "2026-10-01"
        self.assertEqual(data.freshness(record, TODAY), "current")
        self.assertEqual(record["status"], "enquiry")


class ValidationTests(unittest.TestCase):
    def test_valid_fixture(self):
        self.assertEqual(data.validate_document(document(), TODAY), [])

    def test_duplicate_record_id_is_rejected(self):
        payload = document()
        payload["records"].append(copy.deepcopy(payload["records"][0]))
        self.assertIn("duplicate record ID", "\n".join(data.validate_document(payload, TODAY)))

    def test_invalid_calendar_dates_and_reversed_activity_are_rejected(self):
        for change in ({"starts_on": "2026-02-30"}, {"checked_at": "today"},
                       {"checked_at": "2026-09-19"}, {"review_due": "2026-09-17"},
                       {"starts_on": "2026-10-03", "ends_on": "2026-10-02"}):
            with self.subTest(change=change):
                payload = document()
                payload["records"][0].update(change)
                self.assertTrue(data.validate_document(payload, TODAY))

    def test_missing_fields_and_unrecognised_fields_are_rejected(self):
        payload = document()
        del payload["records"][0]["team_size"]
        payload["records"][0]["available_places"] = 10
        errors = "\n".join(data.validate_document(payload, TODAY))
        self.assertIn("team_size: required field missing", errors)
        self.assertIn("available_places: unknown field", errors)

    def test_non_public_or_active_content_urls_are_rejected(self):
        for url in ("javascript:alert(1)", "file:///etc/passwd", "ftp://example.org/a", "/relative",
                    "https://user:password@example.org", "https://example.org/a\nb",
                    "http://127.0.0.1/a", "http://[::1]/", "https://localhost/", "http://10.0.0.1/",
                    "https://example.org:8443/", "https://intranet/", "https://example.local/"):
            with self.subTest(url=url):
                self.assertIsNotNone(data.url_error(url))
        self.assertIsNone(data.url_error("https://example.org/path?query=one#section"))

    def test_partial_location_never_becomes_a_venue(self):
        payload = document()
        payload["records"][0]["location"] = {"lat": 51.5, "lon": -0.1}
        errors = "\n".join(data.validate_document(payload, TODAY))
        self.assertIn("location.basis", errors)
        self.assertIn("location.source_url", errors)

    def test_non_finite_or_boolean_coordinates_rejected(self):
        for bad in (float("nan"), float("inf"), True):
            payload = document()
            payload["areas"][0]["lat"] = bad
            self.assertTrue(data.validate_document(payload, TODAY))


class CsvTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "records.csv"

    def test_csv_round_trip_preserves_unknowns_dates_evidence_and_metadata(self):
        payload = document()
        data.export_csv(payload, self.path)
        self.assertEqual(data.import_csv(self.path, payload, TODAY), payload)

    def test_formula_protection_and_round_trip_for_all_text_shapes(self):
        for text in ("=SUM(1,2)", " +cmd", "\t=cmd", "-2+4", "@SUM(1)", "'original", "'=original", "Normal, quote \"text\""):
            with self.subTest(text=text):
                payload = document()
                payload["records"][0]["title"] = text
                data.export_csv(payload, self.path)
                with self.path.open(encoding="utf-8-sig", newline="") as stream:
                    exported = next(csv.DictReader(stream))["title"]
                self.assertFalse(data.spreadsheet_risk(exported))
                self.assertEqual(data.import_csv(self.path, payload, TODAY), payload)

    def test_negative_longitude_round_trip(self):
        payload = document()
        payload["records"][0]["location"] = {
            "lat": 51.5, "lon": -0.1, "label": "Approximate test area", "basis": "area_anchor",
            "source_url": "https://example.org/source",
        }
        data.export_csv(payload, self.path)
        self.assertEqual(data.import_csv(self.path, payload, TODAY), payload)

    def test_provenance_and_area_metadata_round_trip_without_collisions(self):
        payload = document()
        payload["description"] = "Pilot description."
        payload["areas"][0].update(description="Pilot area.", bounds=[[51, -1], [52, 1]])
        payload["records"][0].update(location_address="Test address", location_basis="office")
        payload["records"][0]["location"] = {
            "lat": 51.5, "lon": -0.1, "label": "Approximate postcode position", "basis": "office",
            "source_url": "https://example.org/source", "precision": "postcode",
            "geocode_source_url": "https://example.org/geocode", "geocode_checked_at": "2026-09-18",
        }
        data.export_csv(payload, self.path)
        self.assertEqual(data.import_csv(self.path, payload, TODAY), payload)

    def test_import_does_not_inherit_missing_source_check_dates_from_base(self):
        payload = document()
        data.export_csv(payload, self.path)
        with self.path.open(encoding="utf-8-sig", newline="") as stream:
            rows = list(csv.DictReader(stream))
        rows[0]["checked_at"] = ""
        with self.path.open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=data.CSV_FIELDS)
            writer.writeheader()
            writer.writerows(rows)
        with self.assertRaisesRegex(data.DataError, "checked_at"):
            data.import_csv(self.path, payload, TODAY)
        self.assertEqual(payload["records"][0]["checked_at"], "2026-09-18")

    def test_missing_csv_columns_do_not_receive_fabricated_defaults(self):
        self.path.write_text("id,title\nfixture-route,Fixture title\n", encoding="utf-8")
        with self.assertRaisesRegex(data.DataError, "columns differ"):
            data.import_csv(self.path, document(), TODAY)


class ReportAndLinkTests(unittest.TestCase):
    def test_reports_do_not_mutate_the_catalogue_or_infer_host_verification(self):
        payload = document()
        before = copy.deepcopy(payload)
        report = data.review_report(payload, TODAY)
        self.assertEqual(report["counts"]["current"], 1)
        self.assertIn("does not confirm", report["notice"])
        with patch.object(data, "check_url", return_value={"url": "https://example.org/source", "result": "reachable"}):
            links = data.link_report(payload)
        self.assertIn("HTTP reachability only", links["notice"])
        self.assertEqual(payload, before)

    def test_private_dns_destinations_are_blocked_before_http(self):
        with patch.object(data.socket, "getaddrinfo", return_value=[(2, 1, 6, "", ("127.0.0.1", 443))]):
            with self.assertRaisesRegex(ValueError, "non-public"):
                data.assert_public_destination("https://example.org/source")

    def test_invalid_import_does_not_overwrite_published_file(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory) / "catalogue.json"
            base.write_text(json.dumps(document()), encoding="utf-8")
            original = base.read_bytes()
            incoming = Path(directory) / "bad.csv"
            incoming.write_text("id,title\nwrong,Missing evidence\n", encoding="utf-8")
            with patch("sys.stderr"):
                self.assertEqual(data.main(["import", str(incoming), "--base", str(base), "--output", str(base)]), 1)
            self.assertEqual(base.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
