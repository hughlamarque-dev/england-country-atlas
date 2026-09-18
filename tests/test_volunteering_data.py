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


def document_with_authority():
    """Geography fixture only; never an assertion of an actual host's service area."""
    payload = document()
    payload.update(
        geography_source="https://example.org/geography",
        geography_note="Fixture boundaries, not a verified service catchment.",
        authorities=[{
            "code": "E09000001", "name": "City of London", "region_id": "london",
            "county_name": "Greater London", "lat": 51.51, "lon": -0.09,
            "aliases": [],
        }],
    )
    payload["records"][0].update(
        coverage_names=["City of London"], coverage_level="local",
        coverage_codes=["E09000001"], partner_directory=False,
    )
    return payload


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


class CoverageValidationTests(unittest.TestCase):
    def test_valid_mapped_and_unmapped_coverage(self):
        payload = document_with_authority()
        self.assertEqual(data.validate_document(payload, TODAY), [])
        payload["records"][0].update(coverage_names=["Source-defined catchment"], coverage_codes=[])
        self.assertEqual(data.validate_document(payload, TODAY), [])

    def test_unknown_duplicate_and_unexplained_coverage_codes_are_rejected(self):
        for change, expected in (
            ({"coverage_codes": ["E09000002"]}, "coverage_codes"),
            ({"coverage_codes": ["E09000001", "E09000001"]}, "coverage_codes"),
            ({"coverage_names": []}, "coverage_names"),
        ):
            with self.subTest(change=change):
                payload = document_with_authority()
                payload["records"][0].update(change)
                self.assertIn(expected, "\n".join(data.validate_document(payload, TODAY)))

    def test_coverage_lists_reject_wrong_shapes_blank_strings_and_duplicates(self):
        for field in ("coverage_names", "coverage_codes"):
            for value in (None, "London", [None], [" "], [["nested"]], ["City", "City"]):
                with self.subTest(field=field, value=value):
                    payload = document_with_authority()
                    payload["records"][0][field] = value
                    self.assertIn(field, "\n".join(data.validate_document(payload, TODAY)))

    def test_authority_coverage_cannot_contradict_discovery_region(self):
        payload = document_with_authority()
        payload["areas"].append({"id": "south-east", "name": "South East", "lat": 51, "lon": 0})
        payload["records"][0]["area_ids"] = ["south-east"]
        self.assertIn("authority region", "\n".join(data.validate_document(payload, TODAY)))

    def test_coverage_level_and_partner_flag_require_their_declared_types(self):
        for field, values in (
            ("coverage_level", (None, "England", 1, [])),
            ("partner_directory", (None, "true", 1, 0, [])),
        ):
            for value in values:
                with self.subTest(field=field, value=value):
                    payload = document_with_authority()
                    payload["records"][0][field] = value
                    self.assertIn(field, "\n".join(data.validate_document(payload, TODAY)))

    def test_authorities_must_be_array_instead_of_crashing_or_silently_accepting(self):
        for value in (None, {}, "authorities", 7):
            with self.subTest(value=value):
                payload = document()
                payload["authorities"] = value
                self.assertIn("authorities", "\n".join(data.validate_document(payload, TODAY)))

    def test_invalid_authority_identifiers_report_errors_without_crashing(self):
        for field, values in (("code", (None, [], {}, "W06000001", "E0600001")),
                              ("region_id", (None, [], {}, "missing-region"))):
            for value in values:
                with self.subTest(field=field, value=value):
                    payload = document_with_authority()
                    payload["authorities"][0][field] = value
                    self.assertIn(field, "\n".join(data.validate_document(payload, TODAY)))

    def test_duplicate_authority_and_invalid_coordinates_are_rejected(self):
        payload = document_with_authority()
        payload["authorities"].append(copy.deepcopy(payload["authorities"][0]))
        self.assertIn("duplicate authority", "\n".join(data.validate_document(payload, TODAY)))
        for value in (True, float("nan"), 181):
            with self.subTest(value=value):
                payload = document_with_authority()
                payload["authorities"][0]["lon"] = value
                self.assertIn("authorities[0].lon", "\n".join(data.validate_document(payload, TODAY)))

    def test_authority_aliases_require_unique_english_authority_codes(self):
        for value in (None, "E09000999", [None], [" "], ["City"],
                      ["W06000001"], ["E09000999", "E09000999"]):
            with self.subTest(value=value):
                payload = document_with_authority()
                payload["authorities"][0]["aliases"] = value
                self.assertIn("aliases", "\n".join(data.validate_document(payload, TODAY)))

    def test_geography_provenance_requires_valid_url_and_note(self):
        for field, value in (("geography_source", "javascript:alert(1)"),
                             ("geography_source", None), ("geography_note", ""),
                             ("geography_note", {"unsupported": "shape"})):
            with self.subTest(field=field, value=value):
                payload = document_with_authority()
                payload[field] = value
                self.assertIn(field, "\n".join(data.validate_document(payload, TODAY)))


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

    def test_coverage_and_authority_metadata_survive_csv_round_trip(self):
        payload = document_with_authority()
        data.export_csv(payload, self.path)
        imported = data.import_csv(self.path, payload, TODAY)
        self.assertEqual(imported, payload)
        self.assertIs(imported["records"][0]["partner_directory"], False)

    def test_import_does_not_infer_coverage_from_base_or_office_position(self):
        base = document_with_authority()
        incoming = copy.deepcopy(base)
        record = incoming["records"][0]
        for field in ("coverage_names", "coverage_codes", "coverage_level", "partner_directory"):
            del record[field]
        record["location"] = {
            "lat": 51.51, "lon": -0.09, "label": "Fixture office", "basis": "office",
            "source_url": "https://example.org/source",
        }
        data.export_csv(incoming, self.path)
        imported = data.import_csv(self.path, base, TODAY)
        self.assertEqual(imported, incoming)
        self.assertNotIn("coverage_codes", imported["records"][0])

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
