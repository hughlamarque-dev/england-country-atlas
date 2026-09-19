"""
England Atlas · QGIS Police.uk community-safety importer
========================================================

Run this file from the QGIS Python Editor while the England Atlas QGIS
project (or another project containing the 296 English local-authority
boundaries) is open.

What it does
------------
1. Finds the extracted Police.uk monthly folders, for example:
       Downloads\\4c1982...\\2025-08\\2025-08-avon-and-somerset-street.csv
2. Reads the English force files only. Welsh, Scottish, Northern Irish and
   British Transport Police files are excluded by default.
3. Assigns the anonymised street-level records to the local-authority
   boundary in QGIS using their approximate longitude/latitude.
4. Produces a 12-month local-authority summary with counts, rates per 1,000
   residents, category totals, monthly trend values, outcome counts and
   stop-and-search counts.
5. Adds a graduated community-safety layer to the open QGIS project.
6. Optionally uploads only the aggregated JSON to:
       data/community_safety.json
   in hughlamarque-dev/england-country-atlas.

The raw CSVs are never uploaded. The public map should use the aggregated
authority-level view. Police.uk street locations are deliberately not
published as a new public point layer here: they are approximate and
recorded activity is not a complete measure of underlying harm.

Before running
--------------
- Extract the downloaded ZIP first. The script scans the extracted folder,
  not the ZIP itself.
- Set CRIME_ROOT if automatic discovery does not find the folder.
- Make sure the QGIS project contains the local-authority boundary layer.
  The script tries the name below, then chooses a polygon layer with roughly
  296 features.
- Leave UPLOAD_TO_GITHUB = False for the first run. Inspect the QGIS layer
  and JSON, then set it to True and run again when ready to publish.
- For upload, set the GITHUB_TOKEN environment variable, or the script will
  ask for a token in a password field. The token needs repository contents
  write access to hughlamarque-dev/england-country-atlas.

This is intended for QGIS 3.x and uses only the Python standard library plus
the QGIS Python API. It does not require pandas or geopandas.
"""

from __future__ import annotations

import base64
import csv
import datetime as dt
import hashlib
import json
import math
import os
import re
import sys
import urllib.error
import urllib.request
from collections import Counter, defaultdict, OrderedDict
from pathlib import Path

from qgis.PyQt.QtCore import QVariant
from qgis.PyQt.QtGui import QColor
from qgis.PyQt.QtWidgets import QInputDialog, QLineEdit, QMessageBox
from qgis.core import (
    QgsCoordinateReferenceSystem,
    QgsCoordinateTransform,
    QgsFeature,
    QgsField,
    QgsFillSymbol,
    QgsGeometry,
    QgsMessageLog,
    QgsMapLayer,
    QgsPointXY,
    QgsProject,
    QgsRendererRange,
    QgsSpatialIndex,
    QgsVectorLayer,
    QgsWkbTypes,
    QgsGraduatedSymbolRenderer,
    Qgis,
)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Leave blank to discover a folder in Downloads containing 20xx-xx folders.
# You can paste the Windows path shown in File Explorer here, for example:
# CRIME_ROOT = r"C:\Users\Hugh\Downloads\4c1982b0e4bb0ef5fa910151d11693252f72bbeb"
CRIME_ROOT = ""

# The layer name used by the England Atlas QGIS project. If it differs, set
# BOUNDARY_LAYER_NAME, or set BOUNDARY_LAYER_PATH to a local GeoPackage/Shapefile.
BOUNDARY_LAYER_NAME = "Local authority districts"
BOUNDARY_LAYER_PATH = ""

# The bundle shown in the screenshots runs through 2026-07. The default is
# the latest 12 available months, rather than mixing several years into one
# rate. Set to None to process every month found in the extracted bundle.
MONTHS_TO_PROCESS = 12

# British Transport Police records are not included by default. They cover a
# different policing footprint and can otherwise make local comparisons look
# like ordinary resident crime rates.
INCLUDE_BTP = False

# Add a temporary authority-level layer to the current QGIS project.
ADD_QGIS_LAYER = True

# First run should remain False. When True, only the small aggregated JSON is
# uploaded. No raw CSVs and no source point layer are uploaded.
UPLOAD_TO_GITHUB = False
GITHUB_REPOSITORY = "hughlamarque-dev/england-country-atlas"
GITHUB_BRANCH = "main"
GITHUB_DATA_PATH = "data/community_safety.json"
GITHUB_TOKEN_ENV = "GITHUB_TOKEN"

# Local output folder. It is created beside the extracted download by default.
OUTPUT_FOLDER_NAME = "england_atlas_community_safety_output"


# Police.uk force slugs in the England download. The files shown in the
# screenshots also include Welsh forces and btp; those are excluded here.
ENGLISH_FORCE_SLUGS = {
    "avon-and-somerset",
    "bedfordshire",
    "cambridgeshire",
    "cheshire",
    "city-of-london",
    "cleveland",
    "cumbria",
    "derbyshire",
    "devon-and-cornwall",
    "dorset",
    "durham",
    "essex",
    "gloucestershire",
    "greater-manchester",
    "hampshire",
    "hertfordshire",
    "humberside",
    "kent",
    "lancashire",
    "leicestershire",
    "lincolnshire",
    "merseyside",
    "metropolitan",
    "norfolk",
    "northamptonshire",
    "northumbria",
    "north-yorkshire",
    "nottinghamshire",
    "south-yorkshire",
    "staffordshire",
    "suffolk",
    "surrey",
    "sussex",
    "thames-valley",
    "warwickshire",
    "west-mercia",
    "west-midlands",
    "west-yorkshire",
    "wiltshire",
}


# Stable, user-facing groups. The original crime type remains available in
# the JSON's top-category summary, while the map uses these less cluttered
# groups.
SAFETY_GROUPS = OrderedDict(
    [
        ("total", "All recorded crime"),
        ("violence", "Violence and sexual offences"),
        ("burglary", "Burglary"),
        ("robbery", "Robbery"),
        ("anti_social", "Anti-social behaviour"),
        ("vehicle", "Vehicle crime"),
        ("theft", "Theft"),
        ("criminal_damage", "Criminal damage and arson"),
        ("drugs", "Drugs"),
        ("public_order", "Public order"),
        ("weapons", "Possession of weapons"),
        ("other", "Other recorded crime"),
    ]
)

CRIME_GROUPS = {
    "violence and sexual offences": "violence",
    "burglary": "burglary",
    "robbery": "robbery",
    "anti-social behaviour": "anti_social",
    "vehicle crime": "vehicle",
    "other theft": "theft",
    "theft from the person": "theft",
    "shoplifting": "theft",
    "bicycle theft": "theft",
    "criminal damage and arson": "criminal_damage",
    "drugs": "drugs",
    "public order": "public_order",
    "possession of weapons": "weapons",
    "other crime": "other",
}

FILE_RE = re.compile(
    r"^(?P<month>\d{4}-\d{2})-(?P<force>.+?)-(?P<kind>street|outcomes|stop-and-search)\.csv$",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Logging and small utilities
# ---------------------------------------------------------------------------


def log(message: str, level=Qgis.Info) -> None:
    """Write to both the QGIS log and the Python console."""

    message = str(message)
    try:
        QgsMessageLog.logMessage(message, "England Atlas · community safety", level)
    except Exception:
        pass
    print(message)


def normalise_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def clean_text(value) -> str:
    return str(value or "").strip()


def as_float(value):
    try:
        value = clean_text(value).replace(",", "")
        if not value:
            return None
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def as_int(value):
    number = as_float(value)
    return int(round(number)) if number is not None else None


def slug_label(slug: str) -> str:
    return " ".join(word.capitalize() for word in slug.replace("-", " ").split())


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


# ---------------------------------------------------------------------------
# Input discovery
# ---------------------------------------------------------------------------


def discover_download_root() -> Path:
    if CRIME_ROOT:
        root = Path(CRIME_ROOT).expanduser()
        if not root.exists() or not root.is_dir():
            raise RuntimeError(f"CRIME_ROOT does not exist or is not a folder: {root}")
        return root

    home = Path.home()
    candidates = [home / "Downloads", home / "OneDrive" / "Downloads"]
    found = []
    for parent in candidates:
        if not parent.exists():
            continue
        for child in parent.iterdir():
            if not child.is_dir():
                continue
            try:
                has_month_folder = any(
                    p.is_dir() and re.fullmatch(r"\d{4}-\d{2}", p.name)
                    for p in child.iterdir()
                )
                has_police_csv = any(
                    FILE_RE.match(p.name) for p in child.rglob("*.csv")
                )
            except OSError:
                continue
            if has_month_folder or has_police_csv:
                found.append(child)

    if not found:
        raise RuntimeError(
            "I could not find the extracted Police.uk folder in Downloads. "
            "Set CRIME_ROOT at the top of this file to the folder containing "
            "the 2023-08, 2023-09, … monthly folders."
        )
    found.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    if len(found) > 1:
        log("Possible Police.uk folders found:")
        for item in found:
            log(f"  - {item}")
        log(f"Using the most recently modified: {found[0]}")
    return found[0]


def discover_files(root: Path):
    files = []
    for path in root.rglob("*.csv"):
        match = FILE_RE.match(path.name)
        if not match:
            continue
        info = match.groupdict()
        info["path"] = path
        info["month"] = info["month"]
        info["force"] = info["force"].lower()
        info["kind"] = info["kind"].lower()
        if info["force"] == "btp" and not INCLUDE_BTP:
            continue
        if info["force"] not in ENGLISH_FORCE_SLUGS and info["force"] != "btp":
            continue
        files.append(info)
    files.sort(key=lambda x: (x["month"], x["force"], x["kind"], str(x["path"])))
    if not files:
        raise RuntimeError(
            f"No English Police.uk CSVs were found below {root}. "
            "The expected names look like 2025-08-avon-and-somerset-street.csv."
        )
    return files


def choose_months(files):
    months = sorted({item["month"] for item in files})
    selected = months if MONTHS_TO_PROCESS is None else months[-MONTHS_TO_PROCESS:]
    if not selected:
        raise RuntimeError("No months available in the Police.uk bundle.")
    log(f"Available months: {months[0]} to {months[-1]} ({len(months)} months)")
    log(f"Processing months: {selected[0]} to {selected[-1]} ({len(selected)} months)")
    return months, set(selected)


# ---------------------------------------------------------------------------
# QGIS boundary handling
# ---------------------------------------------------------------------------


def get_boundary_layer():
    if BOUNDARY_LAYER_PATH:
        layer = QgsVectorLayer(BOUNDARY_LAYER_PATH, "Local authority districts", "ogr")
        if not layer.isValid():
            raise RuntimeError(f"Could not open BOUNDARY_LAYER_PATH: {BOUNDARY_LAYER_PATH}")
        return layer

    project = QgsProject.instance()
    named = project.mapLayersByName(BOUNDARY_LAYER_NAME)
    for layer in named:
        if layer.isValid() and layer.type() == QgsMapLayer.VectorLayer:
            return layer

    candidates = []
    for layer in project.mapLayers().values():
        if layer.type() != QgsMapLayer.VectorLayer or not layer.isValid():
            continue
        if QgsWkbTypes.geometryType(layer.wkbType()) != QgsWkbTypes.PolygonGeometry:
            continue
        count = layer.featureCount()
        if 250 <= count <= 350:
            candidates.append(layer)
    if candidates:
        candidates.sort(key=lambda item: abs(item.featureCount() - 296))
        log(f"Using boundary layer discovered in the QGIS project: {candidates[0].name()}")
        return candidates[0]

    raise RuntimeError(
        "No local-authority polygon layer was found. Open the England Atlas QGIS "
        "project first, or set BOUNDARY_LAYER_PATH to the boundary file."
    )


def find_field(layer, candidates, required=True):
    names = {normalise_key(field.name()): field.name() for field in layer.fields()}
    for candidate in candidates:
        found = names.get(normalise_key(candidate))
        if found:
            return found
    if required:
        raise RuntimeError(
            f"Could not find any of these fields in {layer.name()}: {', '.join(candidates)}. "
            f"Available fields: {', '.join(field.name() for field in layer.fields())}"
        )
    return None


class AuthorityIndex:
    def __init__(self, layer):
        self.layer = layer
        self.code_field = find_field(
            layer,
            ["code", "LAD25CD", "LAD24CD", "LAD23CD", "LAD22CD", "GSS_CODE", "area_code"],
        )
        self.name_field = find_field(
            layer,
            ["name", "LAD25NM", "LAD24NM", "LAD23NM", "LAD22NM", "NAME", "area_name"],
        )
        self.population_field = find_field(
            layer,
            ["population_2025", "population", "pop_2025", "residents_2025"],
            required=False,
        )
        self.index = QgsSpatialIndex()
        self.features = {}
        self.geometries = {}
        self.authorities = {}
        for feature in layer.getFeatures():
            code = clean_text(feature[self.code_field])
            name = clean_text(feature[self.name_field])
            if not code or not name:
                continue
            self.index.addFeature(feature)
            self.features[feature.id()] = feature
            self.geometries[feature.id()] = QgsGeometry(feature.geometry())
            population = (
                as_float(feature[self.population_field]) if self.population_field else None
            )
            self.authorities[code] = {
                "code": code,
                "name": name,
                "population_2025": population,
                "feature_id": feature.id(),
            }
        if len(self.authorities) < 250:
            raise RuntimeError(
                f"Only {len(self.authorities)} usable local authorities were found in "
                f"{layer.name()}. The England Atlas layer should contain about 296."
            )

        source_crs = QgsCoordinateReferenceSystem("EPSG:4326")
        self.to_boundary = QgsCoordinateTransform(
            source_crs, layer.crs(), QgsProject.instance().transformContext()
        )
        log(
            f"Indexed {len(self.authorities)} local authorities from {layer.name()} "
            f"({layer.crs().authid() or 'unknown CRS'})."
        )
        if not self.population_field:
            log(
                "No population_2025 field was found. Counts will be produced, but "
                "per-1,000 rates will be blank until a population field is supplied.",
                Qgis.Warning,
            )

    def match(self, longitude, latitude):
        if longitude is None or latitude is None:
            return None
        try:
            point = self.to_boundary.transform(QgsPointXY(float(longitude), float(latitude)))
            geometry = QgsGeometry.fromPointXY(point)
        except Exception:
            return None
        candidate_ids = self.index.intersects(geometry.boundingBox())
        for feature_id in candidate_ids:
            boundary = self.geometries.get(feature_id)
            if boundary is None:
                continue
            if boundary.contains(geometry) or boundary.intersects(geometry):
                feature = self.features[feature_id]
                return clean_text(feature[self.code_field])
        return None


# ---------------------------------------------------------------------------
# CSV parsing and aggregation
# ---------------------------------------------------------------------------


def iter_rows(path: Path):
    with path.open("r", encoding="utf-8-sig", errors="replace", newline="") as handle:
        reader = csv.DictReader(handle)
        for raw in reader:
            yield {normalise_key(key): clean_text(value) for key, value in raw.items()}


def value(row, *keys):
    for key in keys:
        found = row.get(normalise_key(key))
        if found not in (None, ""):
            return found
    return ""


def crime_group(raw_type: str) -> str:
    label = clean_text(raw_type)
    if not label:
        return "other"
    lower = label.lower()
    if lower in CRIME_GROUPS:
        return CRIME_GROUPS[lower]
    if "theft" in lower or "shoplifting" in lower or "bicycle" in lower:
        return "theft"
    return "other"


def new_month_bucket():
    return {
        "crime_total": 0,
        "crime_groups": Counter(),
        "raw_crime_types": Counter(),
        "outcome_total": 0,
        "outcomes": Counter(),
        "stop_search_total": 0,
        "stop_search_types": Counter(),
        "stop_search_outcomes": Counter(),
    }


def new_authority_bucket(authority):
    return {
        "code": authority["code"],
        "name": authority["name"],
        "population_2025": authority.get("population_2025"),
        "months": defaultdict(new_month_bucket),
    }


def process_files(files, selected_months, authority_index):
    records = {
        code: new_authority_bucket(authority)
        for code, authority in authority_index.authorities.items()
    }
    stats = Counter()
    excluded_forces = Counter()
    used_files = []

    process_files_list = [item for item in files if item["month"] in selected_months]
    total_files = len(process_files_list)
    for file_number, item in enumerate(process_files_list, start=1):
        path = item["path"]
        if item["force"] not in ENGLISH_FORCE_SLUGS and item["force"] != "btp":
            excluded_forces[item["force"]] += 1
            continue
        log(f"[{file_number}/{total_files}] Reading {path.name}")
        used_files.append(path)
        month = item["month"]
        kind = item["kind"]
        row_count = 0
        for row in iter_rows(path):
            row_count += 1
            stats[f"{kind}_rows"] += 1
            longitude = as_float(value(row, "longitude", "lon"))
            latitude = as_float(value(row, "latitude", "lat"))
            if longitude is None or latitude is None:
                stats[f"{kind}_missing_coordinates"] += 1
                continue
            if not (-7.7 <= longitude <= 2.2 and 49.7 <= latitude <= 55.9):
                stats[f"{kind}_outside_england_box"] += 1
                continue
            code = authority_index.match(longitude, latitude)
            if code is None or code not in records:
                stats[f"{kind}_unmatched"] += 1
                continue
            stats[f"{kind}_matched"] += 1
            bucket = records[code]["months"][month]

            if kind == "street":
                raw_type = value(row, "crime type", "category") or "Other recorded crime"
                group = crime_group(raw_type)
                bucket["crime_total"] += 1
                bucket["crime_groups"][group] += 1
                bucket["raw_crime_types"][raw_type] += 1
            elif kind == "outcomes":
                outcome = value(row, "outcome type", "outcome") or "Outcome not stated"
                bucket["outcome_total"] += 1
                bucket["outcomes"][outcome] += 1
            elif kind == "stop-and-search":
                search_type = value(row, "type") or "Stop and search"
                outcome = value(row, "outcome") or "Outcome not stated"
                bucket["stop_search_total"] += 1
                bucket["stop_search_types"][search_type] += 1
                bucket["stop_search_outcomes"][outcome] += 1

        if row_count == 0:
            log(f"  Warning: {path.name} contained no rows", Qgis.Warning)

    stats["files_used"] = len(used_files)
    stats["files_seen"] = len(process_files_list)
    return records, stats, excluded_forces, used_files


def rate_per_1000(count, population):
    if count is None or not population or population <= 0:
        return None
    return round((count / population) * 1000, 2)


def top_counter(counter, limit=10):
    return [{"label": label, "count": count} for label, count in counter.most_common(limit)]


def distribution_thresholds(values, classes=5):
    """Return readable percentile thresholds for six web-map colour bins."""

    values = sorted(value for value in values if value is not None)
    if not values:
        return [10, 20, 40, 80, 120]
    thresholds = []
    for fraction in (0.20, 0.40, 0.60, 0.80, 0.95):
        index = min(len(values) - 1, round((len(values) - 1) * fraction))
        candidate = round(values[index], 2)
        if not thresholds or candidate > thresholds[-1]:
            thresholds.append(candidate)
    while len(thresholds) < classes:
        next_value = thresholds[-1] + max(1, thresholds[-1] * 0.25)
        thresholds.append(round(next_value, 2))
    return thresholds[:classes]


def build_web_payload(
    records,
    selected_months,
    all_months,
    stats,
    excluded_forces,
    root,
    used_files,
    authority_index,
):
    selected_months = sorted(selected_months)
    payload_records = {}
    for code, source_record in records.items():
        population = source_record.get("population_2025")
        months = source_record["months"]
        result = {
            "code": code,
            "name": source_record["name"],
            "population_2025": population,
        }
        total_latest = sum(months[m]["crime_total"] for m in selected_months)
        result["crime_total_12m"] = total_latest
        result["crime_rate_per_1000"] = rate_per_1000(total_latest, population)

        for key in SAFETY_GROUPS:
            if key == "total":
                continue
            count = sum(months[m]["crime_groups"].get(key, 0) for m in selected_months)
            result[f"crime_{key}_12m"] = count
            result[f"crime_{key}_rate_per_1000"] = rate_per_1000(count, population)

        result["crime_monthly"] = []
        for month in selected_months:
            bucket = months[month]
            monthly = {"month": month, "total": bucket["crime_total"]}
            for key in SAFETY_GROUPS:
                if key != "total":
                    monthly[key] = bucket["crime_groups"].get(key, 0)
            result["crime_monthly"].append(monthly)

        latest_raw = Counter()
        latest_outcomes = Counter()
        latest_search_types = Counter()
        latest_search_outcomes = Counter()
        outcome_total = 0
        stop_search_total = 0
        for month in selected_months:
            latest_raw.update(months[month]["raw_crime_types"])
            latest_outcomes.update(months[month]["outcomes"])
            latest_search_types.update(months[month]["stop_search_types"])
            latest_search_outcomes.update(months[month]["stop_search_outcomes"])
            outcome_total += months[month]["outcome_total"]
            stop_search_total += months[month]["stop_search_total"]
        has_crime_data = total_latest > 0
        result["data_status"] = "matched" if has_crime_data else "no matched street records"
        if not has_crime_data:
            result["crime_total_12m"] = None
            result["crime_rate_per_1000"] = None
        for key in SAFETY_GROUPS:
            if key == "total" or has_crime_data:
                continue
            result[f"crime_{key}_12m"] = None
            result[f"crime_{key}_rate_per_1000"] = None

        result["crime_top_types_12m"] = top_counter(latest_raw)
        result["outcomes_12m"] = outcome_total
        result["outcome_top_12m"] = top_counter(latest_outcomes)
        result["stop_search_12m"] = stop_search_total
        result["stop_search_top_types_12m"] = top_counter(latest_search_types, 5)
        result["stop_search_top_outcomes_12m"] = top_counter(latest_search_outcomes, 5)

        payload_records[code] = result

    checksums = []
    for path in used_files:
        try:
            checksums.append({"file": path.name, "sha256": hash_file(path)})
        except OSError:
            pass

    period_start = selected_months[0]
    period_end = selected_months[-1]
    breaks = {}
    for key in SAFETY_GROUPS:
        field = "crime_rate_per_1000" if key == "total" else f"crime_{key}_rate_per_1000"
        breaks[key] = distribution_thresholds(
            [record.get(field) for record in payload_records.values()]
        )
    return {
        "schema_version": 1,
        "generated_on": dt.date.today().isoformat(),
        "scope": "England local authorities",
        "source": "Police.uk open data downloads",
        "source_url": "https://data.police.uk/data/",
        "api_url": "https://data.police.uk/docs/",
        "period_start": period_start,
        "period_end": period_end,
        "months": selected_months,
        "all_available_months": sorted(all_months),
        "measure_note": (
            "Police-recorded activity for the selected release months, assigned by "
            "approximate street-level coordinates to December 2025 local authorities. "
            "This is not a complete measure of underlying harm or risk. Rates use "
            "the local-authority population_2025 field where available."
        ),
        "geography_note": (
            "Street-level coordinates are anonymised and approximate. The map uses "
            "authority-level aggregation rather than public incident points."
        ),
        "categories": [
            {"key": key, "title": title} for key, title in SAFETY_GROUPS.items()
        ],
        "breaks": breaks,
        "records": payload_records,
        "coverage": {
            "local_authorities": len(authority_index.authorities),
            "files_used": stats.get("files_used", 0),
            "files_seen": stats.get("files_seen", 0),
            "street_rows": stats.get("street_rows", 0),
            "street_matched": stats.get("street_matched", 0),
            "street_unmatched": stats.get("street_unmatched", 0),
            "street_missing_coordinates": stats.get("street_missing_coordinates", 0),
            "outcome_rows": stats.get("outcomes_rows", 0),
            "outcome_matched": stats.get("outcomes_matched", 0),
            "stop_search_rows": stats.get("stop-and-search_rows", 0),
            "stop_search_matched": stats.get("stop-and-search_matched", 0),
            "excluded_forces": sorted(excluded_forces),
            "british_transport_police_included": INCLUDE_BTP,
            "source_file_checksums": checksums[:250],
            "input_folder_name": root.name,
        },
    }


# ---------------------------------------------------------------------------
# QGIS output layer
# ---------------------------------------------------------------------------


QGIS_COLOURS = ["#f3f7f4", "#d5e9dc", "#a5ccb1", "#6d9e82", "#39715a", "#174a38"]


def quantile_breaks(values, classes=5):
    values = sorted(value for value in values if value is not None)
    if not values:
        return [0, 1]
    breaks = [values[0]]
    for i in range(1, classes + 1):
        index = min(len(values) - 1, round((len(values) - 1) * i / classes))
        candidate = values[index]
        if candidate > breaks[-1]:
            breaks.append(candidate)
    if len(breaks) == 1:
        breaks.append(breaks[0] + 1)
    return breaks


def add_qgis_layer(boundary_layer, authority_index, payload):
    """Add an authority-level graduated layer to the current QGIS project."""

    geometry_name = QgsWkbTypes.displayString(boundary_layer.wkbType())
    output = QgsVectorLayer(
        f"{geometry_name}?crs={boundary_layer.crs().authid()}",
        f"Community safety · {payload['period_start']} to {payload['period_end']}",
        "memory",
    )
    if not output.isValid():
        raise RuntimeError("QGIS could not create the temporary community-safety layer.")

    fields = [
        QgsField("code", QVariant.String),
        QgsField("name", QVariant.String),
        QgsField("population_2025", QVariant.Double),
        QgsField("crime_total_12m", QVariant.Int),
        QgsField("crime_rate_per_1000", QVariant.Double),
    ]
    for key in SAFETY_GROUPS:
        if key == "total":
            continue
        fields.extend(
            [
                QgsField(f"{key}_12m", QVariant.Int),
                QgsField(f"{key}_rate_1000", QVariant.Double),
            ]
        )
    output.dataProvider().addAttributes(fields)
    output.updateFields()

    for source_feature in boundary_layer.getFeatures():
        code = clean_text(source_feature[authority_index.code_field])
        record = payload["records"].get(code)
        if record is None:
            continue
        feature = QgsFeature(output.fields())
        feature.setGeometry(source_feature.geometry())
        attrs = [
            code,
            record["name"],
            record.get("population_2025"),
            record.get("crime_total_12m"),
            record.get("crime_rate_per_1000"),
        ]
        for key in SAFETY_GROUPS:
            if key == "total":
                continue
            attrs.extend(
                [
                    record.get(f"crime_{key}_12m"),
                    record.get(f"crime_{key}_rate_per_1000"),
                ]
            )
        feature.setAttributes(attrs)
        output.dataProvider().addFeature(feature)

    output.updateExtents()
    rates = [
        feature["crime_rate_per_1000"]
        for feature in output.getFeatures()
        if feature["crime_rate_per_1000"] is not None
    ]
    breaks = quantile_breaks(rates, 5)
    ranges = []
    for index in range(len(breaks) - 1):
        lower = breaks[index]
        upper = breaks[index + 1]
        symbol = QgsFillSymbol.createSimple(
            {
                "color": QGIS_COLOURS[min(index + 1, len(QGIS_COLOURS) - 1)],
                "outline_color": "#ffffff",
                "outline_width": "0.25",
            }
        )
        label = f"{lower:.1f}–{upper:.1f} per 1,000"
        ranges.append(QgsRendererRange(lower, upper, symbol, label))
    if ranges:
        output.setRenderer(QgsGraduatedSymbolRenderer("crime_rate_per_1000", ranges))
    output.setCustomProperty("community_safety.source_url", payload["source_url"])
    output.setCustomProperty("community_safety.period", f"{payload['period_start']} to {payload['period_end']}")
    output.setCustomProperty("community_safety.note", payload["measure_note"])
    QgsProject.instance().addMapLayer(output)
    log(f"Added QGIS layer: {output.name()} ({output.featureCount()} authorities)")


# ---------------------------------------------------------------------------
# Local output and GitHub upload
# ---------------------------------------------------------------------------


def write_payload(payload, root: Path) -> Path:
    output_dir = root.parent / OUTPUT_FOLDER_NAME
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "community_safety.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log(f"Wrote local output: {path} ({path.stat().st_size / 1024:.1f} KB)")
    return path


def get_github_token():
    token = os.environ.get(GITHUB_TOKEN_ENV, "").strip()
    if token:
        return token
    token, accepted = QInputDialog.getText(
        None,
        "England Atlas · GitHub upload",
        "GitHub token with contents: write access\n(It is used for this upload only and is not saved.)",
        QLineEdit.Password,
    )
    return token.strip() if accepted else ""


def github_request(method, url, token, body=None):
    data = None
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "england-atlas-qgis-community-safety-importer",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"GitHub API returned HTTP {error.code}: {detail[:500]}")


def upload_file_to_github(path: Path, token: str):
    api_base = f"https://api.github.com/repos/{GITHUB_REPOSITORY}/contents/{GITHUB_DATA_PATH}"
    current_sha = None
    try:
        current = github_request("GET", f"{api_base}?ref={GITHUB_BRANCH}", token)
        current_sha = current.get("sha")
    except RuntimeError as error:
        if "HTTP 404" not in str(error):
            raise

    content = base64.b64encode(path.read_bytes()).decode("ascii")
    body = {
        "message": f"Add community safety data for {path.stat().st_mtime_ns}",
        "content": content,
        "branch": GITHUB_BRANCH,
    }
    if current_sha:
        body["sha"] = current_sha
    result = github_request("PUT", api_base, token, body)
    commit = result.get("commit", {}).get("html_url", "")
    log(f"Uploaded aggregated data to {GITHUB_REPOSITORY}/{GITHUB_DATA_PATH}")
    if commit:
        log(f"GitHub commit: {commit}")
    return result


# ---------------------------------------------------------------------------
# Main routine
# ---------------------------------------------------------------------------


def run():
    started = dt.datetime.now()
    root = discover_download_root()
    log(f"Police.uk input folder: {root}")
    files = discover_files(root)
    all_months, selected_months = choose_months(files)
    boundary_layer = get_boundary_layer()
    authority_index = AuthorityIndex(boundary_layer)

    records, stats, excluded_forces, used_files = process_files(
        files, selected_months, authority_index
    )
    payload = build_web_payload(
        records,
        selected_months,
        all_months,
        stats,
        excluded_forces,
        root,
        used_files,
        authority_index,
    )
    local_output = write_payload(payload, root)

    if ADD_QGIS_LAYER:
        add_qgis_layer(boundary_layer, authority_index, payload)

    if UPLOAD_TO_GITHUB:
        token = get_github_token()
        if not token:
            raise RuntimeError("Upload cancelled: no GitHub token was supplied.")
        upload_file_to_github(local_output, token)
    else:
        log("GitHub upload is OFF. Set UPLOAD_TO_GITHUB = True after inspecting the output.")

    elapsed = dt.datetime.now() - started
    summary = (
        f"Community-safety import finished in {elapsed}. "
        f"Street rows matched: {stats.get('street_matched', 0):,}; "
        f"unmatched: {stats.get('street_unmatched', 0):,}; "
        f"output: {local_output}"
    )
    log(summary)
    try:
        QMessageBox.information(None, "England Atlas · community safety", summary)
    except Exception:
        pass
    return payload


if __name__ == "__main__":
    run()
