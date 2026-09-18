#!/usr/bin/env python3
"""Validate and maintain the public volunteering referral catalogue (stdlib only).

Source checking is a human editorial task. Imports, exports and HTTP checks never
advance checked_at or review_due. A responding URL does not confirm availability.
"""

import argparse
import copy
import csv
import datetime as dt
import ipaddress
import json
import math
import re
import socket
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA = ROOT / "data" / "volunteering.json"
SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ENUMS = {
    "kind": {"opportunity", "programme", "broker", "platform"},
    "status": {"advertised", "enquiry", "ongoing", "closed"},
    "themes": {"preparedness", "recovery", "community_support", "environment", "skills", "response"},
    "employee_fit": {"team_day", "individual", "skills", "ongoing", "unknown"},
}
REQUIRED_TEXT = (
    "id", "title", "organisation", "description", "resilience_relevance",
    "coverage_note", "availability_note",
)
NULLABLE_TEXT = ("duration", "team_size", "cost", "accessibility", "requirements")
NULLABLE_DATES = ("starts_on", "ends_on", "application_deadline", "source_published")
ARRAY_FIELDS = ("area_ids", "themes", "employee_fit")
RECORD_FIELDS = (
    "id", "title", "organisation", "area_ids", "kind", "status", "themes",
    "description", "resilience_relevance", "employee_fit", "duration", "team_size",
    "cost", "accessibility", "requirements", "location", "coverage_note",
    "source_url", "apply_url", "checked_at", "review_due", "starts_on", "ends_on",
    "application_deadline", "source_published", "availability_note", "evidence",
)
LOCATION_FIELDS = ("lat", "lon", "label", "basis", "source_url")
RECORD_OPTIONAL_FIELDS = ("location_postcode", "location_address", "location_basis", "location_source_url")
LOCATION_OPTIONAL_FIELDS = ("precision", "geocode_source_url", "geocode_checked_at")
CSV_FIELDS = tuple(
    column for field in RECORD_FIELDS
    for column in ((tuple("location_" + name for name in LOCATION_FIELDS))
                   if field == "location" else (field,))
) + ("record_extra_json", "location_extra_json")


class DataError(ValueError):
    pass


def utc_today():
    return dt.datetime.now(dt.timezone.utc).date()


def parse_date(value):
    """ISO calendar dates only: reject datetime strings and relative wording."""
    if not isinstance(value, str) or not DATE.fullmatch(value):
        raise ValueError("must be a date in YYYY-MM-DD format")
    return dt.date.fromisoformat(value)


def url_error(value):
    """Validate public HTTP(S) URLs without making a network request."""
    if not isinstance(value, str) or not value or re.search(r"[\s\x00-\x1f\x7f]", value):
        return "must be a non-empty HTTP(S) URL without whitespace/control characters"
    try:
        parsed = urllib.parse.urlsplit(value)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            return "must be an absolute HTTP(S) URL"
        if parsed.username is not None or parsed.password is not None:
            return "must not contain credentials"
        if parsed.port not in (None, 80, 443):
            return "must use a standard public HTTP(S) port"
        hostname = parsed.hostname.rstrip(".").lower()
        if hostname == "localhost" or hostname.endswith((".localhost", ".local", ".internal", ".test")):
            return "must reference a public host"
        try:
            address = ipaddress.ip_address(hostname)
        except ValueError:
            if "." not in hostname or not all(re.fullmatch(r"[a-z0-9](?:[a-z0-9-]*[a-z0-9])?", part)
                                             for part in hostname.split(".")):
                return "must contain a valid public hostname"
        else:
            if not address.is_global:
                return "must reference a public host"
    except ValueError as exc:
        return str(exc)
    return None


def number_in_range(value, low, high):
    return type(value) in (float, int) and math.isfinite(value) and low <= value <= high


def validate_document(document, today=None):
    """Return every schema error. No dates, capacity, geography or evidence inferred."""
    today = today or utc_today()
    errors = []

    def error(path, message):
        errors.append(f"{path}: {message}")

    def keys(obj, expected, path, optional=()):
        if not isinstance(obj, dict):
            error(path, "must be an object")
            return False
        for field in sorted(set(expected) - set(obj)):
            error(path + "." + field, "required field missing (use null only for nullable fields)")
        for field in sorted(set(obj) - set(expected) - set(optional)):
            error(path + "." + field, "unknown field")
        return True

    def text(obj, name, path, nullable=False):
        value = obj.get(name)
        if nullable and value is None:
            return
        if not isinstance(value, str) or not value.strip():
            error(path + "." + name, "must be non-empty text" + (" or null" if nullable else ""))
        elif "\x00" in value:
            error(path + "." + name, "must not contain null characters")

    def date(obj, name, path, nullable=False):
        value = obj.get(name)
        if nullable and value is None:
            return None
        try:
            return parse_date(value)
        except ValueError as exc:
            error(path + "." + name, str(exc) + (" or null" if nullable else ""))
            return None

    def url(obj, name, path):
        message = url_error(obj.get(name))
        if message:
            error(path + "." + name, message)

    if not keys(document, ("schema_version", "updated", "scope", "areas", "records"), "document",
                ("description", "location_note", "geocoding_attribution")):
        return errors
    if type(document.get("schema_version")) is not int or document["schema_version"] != 1:
        error("document.schema_version", "must be integer 1")
    updated = date(document, "updated", "document")
    if updated and updated > today:
        error("document.updated", "cannot be in the future")
    text(document, "scope", "document")
    for name in ("description", "location_note", "geocoding_attribution"):
        if name in document:
            text(document, name, "document")
    area_ids = set()
    areas = document.get("areas")
    if not isinstance(areas, list) or not areas:
        error("document.areas", "must be a non-empty array")
        areas = []
    for index, area in enumerate(areas):
        path = f"areas[{index}]"
        if not keys(area, ("id", "name", "lat", "lon"), path, ("description", "bounds", "marker_note")):
            continue
        for name in ("id", "name"):
            text(area, name, path)
        for name in ("description", "marker_note"):
            if name in area:
                text(area, name, path)
        if "bounds" in area:
            bounds = area["bounds"]
            valid_bounds = (isinstance(bounds, list) and len(bounds) == 2 and
                            all(isinstance(point, list) and len(point) == 2 and
                                number_in_range(point[0], -90, 90) and number_in_range(point[1], -180, 180)
                                for point in bounds))
            if not valid_bounds or bounds[0][0] >= bounds[1][0] or bounds[0][1] >= bounds[1][1]:
                error(path + ".bounds", "must be south-west and north-east [latitude, longitude] pairs")
        identifier = area.get("id")
        if not isinstance(identifier, str) or not SLUG.fullmatch(identifier):
            error(path + ".id", "must be a lowercase stable slug")
        elif identifier in area_ids:
            error(path + ".id", "duplicate area ID")
        else:
            area_ids.add(identifier)
        for coordinate, low, high in (("lat", -90, 90), ("lon", -180, 180)):
            if not number_in_range(area.get(coordinate), low, high):
                error(path + "." + coordinate, "must be a finite geographic coordinate")
    records = document.get("records")
    if not isinstance(records, list):
        error("document.records", "must be an array")
        records = []
    record_ids = set()
    for index, record in enumerate(records):
        path = f"records[{index}]"
        if not keys(record, RECORD_FIELDS, path, RECORD_OPTIONAL_FIELDS):
            continue
        for name in REQUIRED_TEXT:
            text(record, name, path)
        for name in NULLABLE_TEXT:
            text(record, name, path, nullable=True)
        for name in ("location_postcode", "location_address"):
            if name in record:
                text(record, name, path, nullable=True)
        if record.get("location_basis") is not None and record["location_basis"] not in ("venue", "office", "area_anchor"):
            error(path + ".location_basis", "must be venue, office, area_anchor or null")
        if record.get("location_source_url") is not None:
            url(record, "location_source_url", path)
        identifier = record.get("id")
        if not isinstance(identifier, str) or not SLUG.fullmatch(identifier):
            error(path + ".id", "must be a lowercase stable slug")
        elif identifier in record_ids:
            error(path + ".id", "duplicate record ID")
        else:
            record_ids.add(identifier)
        for name in ("kind", "status"):
            if not isinstance(record.get(name), str) or record[name] not in ENUMS[name]:
                error(path + "." + name, "must be one of " + ", ".join(sorted(ENUMS[name])))
        for name in ARRAY_FIELDS:
            values = record.get(name)
            if not isinstance(values, list) or not values or any(not isinstance(v, str) for v in values):
                error(path + "." + name, "must be a non-empty array of strings")
                continue
            allowed = area_ids if name == "area_ids" else ENUMS[name]
            if set(values) - allowed:
                error(path + "." + name, "contains unknown values: " + ", ".join(sorted(set(values) - allowed)))
            if len(set(values)) != len(values):
                error(path + "." + name, "must not contain duplicates")
        for name in ("source_url", "apply_url"):
            url(record, name, path)
        dates = {name: date(record, name, path, nullable=name in NULLABLE_DATES)
                 for name in ("checked_at", "review_due") + NULLABLE_DATES}
        for name in ("checked_at", "source_published"):
            if dates[name] and dates[name] > today:
                error(path + "." + name, "cannot be in the future")
        if dates["checked_at"] and dates["review_due"] and dates["review_due"] < dates["checked_at"]:
            error(path + ".review_due", "cannot precede checked_at")
        if dates["starts_on"] and dates["ends_on"] and dates["ends_on"] < dates["starts_on"]:
            error(path + ".ends_on", "cannot precede starts_on")
        location = record.get("location")
        if location is not None and keys(location, LOCATION_FIELDS, path + ".location", LOCATION_OPTIONAL_FIELDS):
            for coordinate, low, high in (("lat", -90, 90), ("lon", -180, 180)):
                if not number_in_range(location.get(coordinate), low, high):
                    error(path + ".location." + coordinate, "must be a finite geographic coordinate")
            text(location, "label", path + ".location")
            if location.get("basis") not in ("venue", "office", "area_anchor"):
                error(path + ".location.basis", "must be venue, office or area_anchor")
            url(location, "source_url", path + ".location")
            if "precision" in location and location["precision"] not in ("pilot_area", "postcode", "host_map_pin"):
                error(path + ".location.precision", "must be pilot_area, postcode or host_map_pin")
            if "geocode_source_url" in location:
                url(location, "geocode_source_url", path + ".location")
            if "geocode_checked_at" in location:
                geocode_date = date(location, "geocode_checked_at", path + ".location")
                if geocode_date and geocode_date > today:
                    error(path + ".location.geocode_checked_at", "cannot be in the future")
        evidence = record.get("evidence")
        if not isinstance(evidence, list) or not evidence:
            error(path + ".evidence", "must contain at least one source and supporting claim")
        else:
            for evidence_index, item in enumerate(evidence):
                evidence_path = f"{path}.evidence[{evidence_index}]"
                if keys(item, ("url", "claim"), evidence_path):
                    url(item, "url", evidence_path)
                    text(item, "claim", evidence_path)
    return errors


def assert_valid(document, today=None):
    errors = validate_document(document, today)
    if errors:
        raise DataError("Validation failed:\n" + "\n".join(errors))


def freshness(record, today=None):
    """Fail closed for malformed review dates; unknown activity dates stay unknown."""
    today = today or utc_today()
    if record.get("status") == "closed":
        return "closed"
    for field in ("ends_on", "application_deadline"):
        value = record.get(field)
        if value is not None:
            try:
                if parse_date(value) < today:
                    return "expired"
            except ValueError:
                return "review_required"
    try:
        checked = parse_date(record.get("checked_at"))
        due = parse_date(record.get("review_due"))
    except ValueError:
        return "review_required"
    if checked > today or due < checked or due < today:
        return "review_required"
    return "current"


def spreadsheet_risk(value):
    return bool(value) and (value[0] in "\t\r\n" or value.lstrip().startswith(("=", "+", "-", "@")))


def safe_csv_cell(value):
    """Protect Excel/Sheets exports, including formulas hidden behind whitespace."""
    value = "" if value is None else str(value)
    return "'" + value if value.startswith("'") or spreadsheet_risk(value) else value


def decode_csv_cell(value):
    if value.startswith("''") or (value.startswith("'") and spreadsheet_risk(value[1:])):
        return value[1:]
    return value


def export_csv(document, output):
    assert_valid(document)
    with Path(output).open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for record in document["records"]:
            row = {"record_extra_json": json.dumps({name: record[name] for name in RECORD_OPTIONAL_FIELDS if name in record}, ensure_ascii=False),
                   "location_extra_json": json.dumps({name: record["location"][name] for name in LOCATION_OPTIONAL_FIELDS
                                                       if record["location"] and name in record["location"]}, ensure_ascii=False)}
            for field in RECORD_FIELDS:
                value = record[field]
                if field == "location":
                    for name in LOCATION_FIELDS:
                        row["location_" + name] = safe_csv_cell(value[name] if value else None)
                elif field in ARRAY_FIELDS:
                    row[field] = safe_csv_cell("|".join(value))
                elif field == "evidence":
                    row[field] = safe_csv_cell(json.dumps(value, ensure_ascii=False, separators=(",", ":")))
                else:
                    row[field] = safe_csv_cell(value)
            writer.writerow(row)


def import_csv(input_file, base, today=None):
    """Replace records using supplied metadata; do not infer any missing fields."""
    document = copy.deepcopy(base)
    document["records"] = []
    with Path(input_file).open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        fields = reader.fieldnames or []
        if len(fields) != len(set(fields)):
            raise DataError("CSV has duplicate column names")
        missing, extra = set(CSV_FIELDS) - set(fields), set(fields) - set(CSV_FIELDS)
        if missing or extra:
            raise DataError(f"CSV columns differ; missing: {sorted(missing)}; unknown: {sorted(extra)}")
        for line, row in enumerate(reader, start=2):
            if None in row or any(value is None for value in row.values()):
                raise DataError(f"CSV line {line}: row has too many or too few cells")
            row = {key: decode_csv_cell(value) for key, value in row.items()}
            extras = {}
            for name, allowed in (("record_extra_json", RECORD_OPTIONAL_FIELDS), ("location_extra_json", LOCATION_OPTIONAL_FIELDS)):
                try:
                    extras[name] = json.loads(row[name]) if row[name] else {}
                except json.JSONDecodeError as exc:
                    raise DataError(f"CSV line {line}: {name} must be a JSON object") from exc
                if not isinstance(extras[name], dict) or set(extras[name]) - set(allowed):
                    raise DataError(f"CSV line {line}: {name} contains unknown fields or is not a JSON object")
            record = extras["record_extra_json"]
            for field in RECORD_FIELDS:
                if field == "location":
                    location = {name: row["location_" + name] for name in LOCATION_FIELDS}
                    if not any(location.values()):
                        if extras["location_extra_json"]:
                            raise DataError(f"CSV line {line}: location provenance requires a location")
                        record[field] = None
                    else:
                        try:
                            location["lat"] = float(location["lat"])
                            location["lon"] = float(location["lon"])
                        except ValueError as exc:
                            raise DataError(f"CSV line {line}: partial/invalid location coordinates") from exc
                        record[field] = {**location, **extras["location_extra_json"]}
                elif field in ARRAY_FIELDS:
                    record[field] = [value.strip() for value in row[field].split("|") if value.strip()]
                elif field == "evidence":
                    try:
                        record[field] = json.loads(row[field]) if row[field] else []
                    except json.JSONDecodeError as exc:
                        raise DataError(f"CSV line {line}: evidence must be a JSON array") from exc
                elif field in NULLABLE_TEXT + NULLABLE_DATES:
                    record[field] = row[field] or None
                else:
                    record[field] = row[field]
            document["records"].append(record)
    assert_valid(document, today)
    return document


def load_json(path):
    with Path(path).open(encoding="utf-8") as stream:
        return json.load(stream)


def atomic_write(path, content):
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=destination.parent,
                                         prefix="." + destination.name, delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(content)
        temporary.replace(destination)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def review_report(document, today=None):
    today = today or utc_today()
    rows = []
    for record in document["records"]:
        state = freshness(record, today)
        due = parse_date(record["review_due"])
        rows.append({
            "id": record["id"], "title": record["title"], "organisation": record["organisation"],
            "area_ids": record["area_ids"], "kind": record["kind"], "status": record["status"],
            "freshness": state, "checked_at": record["checked_at"], "review_due": record["review_due"],
            "review_overdue_days": max(0, (today - due).days),
            "review_due_today": due == today, "source_url": record["source_url"],
        })
    return {
        "generated_on": today.isoformat(), "data_updated": document["updated"],
        "notice": "Editorial review queue only. Current means source-check review is in date; it does not confirm vacancies or host capacity.",
        "counts": {state: sum(row["freshness"] == state for row in rows)
                   for state in ("current", "review_required", "expired", "closed")},
        "review_due_today": sum(row["review_due_today"] for row in rows),
        "records": sorted(rows, key=lambda row: (row["review_due"], row["id"])),
    }


def markdown_report(report):
    def cell(value):
        return str(value).replace("|", "\\|").replace("\r", " ").replace("\n", " ").replace("<", "&lt;")
    lines = [
        "# Volunteering source-review report", "", "Generated: " + report["generated_on"], "",
        report["notice"], "", " · ".join(f"{key.replace('_', ' ')}: {value}" for key, value in report["counts"].items()),
        "", f"Review due today: {report['review_due_today']}. A due date remains current through that date.", "",
        "| ID | Title | State | Source checked | Review due | Overdue days | Source |",
        "|---|---|---|---|---|---:|---|",
    ]
    for row in report["records"]:
        lines.append("| " + " | ".join(cell(row[key]) for key in
                     ("id", "title", "freshness", "checked_at", "review_due", "review_overdue_days", "source_url")) + " |")
    lines.extend(["", "No source-check dates or publication files were changed.", ""])
    return "\n".join(lines)


def assert_public_destination(url):
    message = url_error(url)
    if message:
        raise ValueError(message)
    parsed = urllib.parse.urlsplit(url)
    addresses = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise ValueError("refusing a destination resolving to a non-public address")


class PublicRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        assert_public_destination(newurl)
        return super().redirect_request(request, fp, code, message, headers, newurl)


def check_url(url, timeout=10):
    result = {"url": url, "final_url": None, "http_status": None, "result": "unconfirmed", "detail": None}
    try:
        assert_public_destination(url)
        opener = urllib.request.build_opener(PublicRedirectHandler())
        headers = {"User-Agent": "EnglandAtlasLinkReview/1.0 (public-source reachability only)"}
        request = urllib.request.Request(url, headers=headers, method="HEAD")
        try:
            response = opener.open(request, timeout=timeout)
        except urllib.error.HTTPError as exc:
            if exc.code not in (405, 501):
                raise
            request = urllib.request.Request(url, headers={**headers, "Range": "bytes=0-1023"}, method="GET")
            response = opener.open(request, timeout=timeout)
        with response:
            result.update(final_url=response.url, http_status=response.status, result="reachable")
    except urllib.error.HTTPError as exc:
        result.update(final_url=exc.url, http_status=exc.code, result="http_error", detail=str(exc))
    except (OSError, ValueError, urllib.error.URLError) as exc:
        result.update(result="unconfirmed", detail=str(exc))
    return result


def link_report(document, timeout=10, workers=4):
    references = {}
    for record in document["records"]:
        urls = [record["source_url"], record["apply_url"]] + [item["url"] for item in record["evidence"]]
        if record["location"]:
            urls.append(record["location"]["source_url"])
            if record["location"].get("geocode_source_url"):
                urls.append(record["location"]["geocode_source_url"])
        if record.get("location_source_url"):
            urls.append(record["location_source_url"])
        for url in urls:
            url = urllib.parse.urldefrag(url)[0]
            references.setdefault(url, set()).add(record["id"])
    with ThreadPoolExecutor(max_workers=workers) as pool:
        results = list(pool.map(lambda url: check_url(url, timeout), sorted(references)))
    for item in results:
        item["record_ids"] = sorted(references[item["url"]])
    return {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "notice": "HTTP reachability only. Success does not confirm page content, an available place, or host capacity. Errors may reflect blocking. checked_at and review_due were not changed.",
        "counts": dict(Counter(item["result"] for item in results)), "links": results,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    for name in ("validate", "review", "export", "check-links"):
        sub = subparsers.add_parser(name)
        sub.add_argument("input", nargs="?", type=Path, default=DEFAULT_DATA)
        if name in ("validate", "review"):
            sub.add_argument("--today", type=parse_date, default=utc_today())
        if name != "validate":
            sub.add_argument("--output", type=Path, required=name == "export")
        if name == "review":
            sub.add_argument("--format", choices=("markdown", "json"), default="markdown")
        if name == "check-links":
            sub.add_argument("--timeout", type=float, default=10)
            sub.add_argument("--workers", type=int, default=4)
    importer = subparsers.add_parser("import", help="replace all records from CSV, preserving metadata from --base")
    importer.add_argument("input", type=Path)
    importer.add_argument("--base", type=Path, required=True)
    importer.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == "import":
            document = import_csv(args.input, load_json(args.base))
            atomic_write(args.output, json.dumps(document, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
            print(f"Imported {len(document['records'])} records. Source-check dates were preserved exactly.")
            return 0
        document = load_json(args.input)
        assert_valid(document, getattr(args, "today", None))
        if args.command == "validate":
            print(f"Valid: {len(document['records'])} records; {len(document['areas'])} pilot areas.")
        elif args.command == "export":
            args.output.parent.mkdir(parents=True, exist_ok=True)
            export_csv(document, args.output)
            print(f"Exported {len(document['records'])} records. Formula-like text is escaped for spreadsheets.")
        else:
            if args.command == "review":
                report = review_report(document, args.today)
                content = markdown_report(report) if args.format == "markdown" else json.dumps(report, ensure_ascii=False, indent=2) + "\n"
            else:
                if not 0 < args.timeout <= 60 or not 1 <= args.workers <= 8:
                    raise DataError("Use timeout in (0, 60] seconds and workers between 1 and 8")
                content = json.dumps(link_report(document, args.timeout, args.workers), ensure_ascii=False, indent=2) + "\n"
            if args.output:
                atomic_write(args.output, content)
                print(f"Wrote {args.output}. Catalogue data and source-check dates were not changed.")
            else:
                print(content, end="")
        return 0
    except (DataError, OSError, ValueError, TypeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
