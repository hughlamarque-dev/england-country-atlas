#!/usr/bin/env python3
"""Audit editorial geography, without inferring coverage from point locations."""
import argparse
import datetime as dt
import json
from pathlib import Path
from volunteering_data import assert_valid, freshness, load_json, atomic_write


def coverage_report(document, today=None):
    today = today or dt.datetime.now(dt.timezone.utc).date()
    assert_valid(document, today)
    records = [r for r in document['records'] if freshness(r, today) == 'current']
    authorities = []
    for area in document.get('authorities', []):
        matched = [r for r in records if area['code'] in r.get('coverage_codes', [])]
        brokers = [r for r in matched if r['kind'] in ('broker', 'platform')]
        authorities.append({
            'code': area['code'], 'name': area['name'], 'region_id': area['region_id'],
            'current_routes': len(matched), 'broker_routes': len(brokers),
            'activity_routes': len(matched) - len(brokers),
            'team_routes': sum('team_day' in r['employee_fit'] for r in matched),
            'record_ids': [r['id'] for r in matched],
            'coverage_gap': 'no_source_matched_route' if not matched else 'no_broker_recorded' if not brokers else None,
        })
    return {
        'generated_on': today.isoformat(), 'data_updated': document['updated'],
        'notice': 'Counts describe this researched directory, not volunteering supply, capacity, partnerships or resilience. A source town may match a containing council without serving the whole council. Regional discovery tags and map positions never assign local coverage. Multiple councils may share the same route; do not sum council counts as unique records.',
        'current_records': len(records),
        'regions': [{'id': a['id'], 'name': a['name'], 'current_records': sum(a['id'] in r['area_ids'] for r in records)} for a in document['areas']],
        'councils_total': len(authorities),
        'councils_with_source_matched_route': sum(a['current_routes'] > 0 for a in authorities),
        'councils_with_broker_route': sum(a['broker_routes'] > 0 for a in authorities),
        'councils_with_activity_route': sum(a['activity_routes'] > 0 for a in authorities),
        'records_without_council_match': [r['id'] for r in records if not r.get('coverage_codes')],
        'authorities': authorities,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    report = coverage_report(load_json(args.input))
    atomic_write(args.output, json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(f"{report['current_records']} current records; {report['councils_with_source_matched_route']}/{report['councils_total']} councils source-matched; {report['councils_with_broker_route']} with broker routes.")


if __name__ == '__main__':
    main()
