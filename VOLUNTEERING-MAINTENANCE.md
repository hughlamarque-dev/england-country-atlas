# Maintaining the community volunteering pilot

18 September 2026 · England Community & Emergency Atlas

**This is a public-source referral pilot for London, Somerset and Cumbria.** It helps employers and individuals find potential routes into community volunteering. Organisations have not agreed to participate in this pilot and their inclusion does not imply National Emergencies Trust endorsement. Listing an enquiry route is not confirmation that a host can accept a team on a particular date.

**Keep one accountable editor and one local reviewer per pilot area.** The roles below need named people before this becomes an ongoing service. They are proposed responsibilities, not commitments made by any organisation.

| Owner | Responsibility | Cadence |
|---|---|---|
| Atlas editor | Own the published catalogue, check evidence, review changes, correct or close records, and inspect automated reports | Weekly triage; monthly full source review |
| Local broker or area reviewer | Check local relevance, identify willing hosts, confirm which community an activity serves, and flag changes | Monthly; promptly when a host changes or withdraws an offer |
| Host organisation | Confirm useful work, capacity, dates, skills, accessibility, supervision, any checks and any costs | Before accepting a placement and whenever details change |
| Technical maintainer | Maintain validation, map/list behaviour and report generation; publish reviewed data updates | Each release; check the reporting workflow weekly |
| Programme sponsor | Agree the definition of resilience relevance and assess whether placements benefit communities | At pilot start and after each pilot cycle |

One person can hold more than one role. Automated checks help the editor find work to review; they do not replace the local relationship or source review.

**Maintain the distinction between a source check, a working link and host confirmation.** `checked_at` means an editor read the cited public source on that date and found it supported the record. `review_due` is the next scheduled editorial review. A link check reports whether a URL responded. None of these means the host has confirmed a placement. The current data format has no host-confirmation field and the interface must not claim host confirmation. If a host-confirmed service is introduced, add an explicit confirmation date, scope and evidence reference, with private contact records stored outside the public repository.

**Keep the catalogue small enough to review.** Every published record needs a stable ID, official source, short factual description, area, kind, status, source-check date and review deadline. Add only attributes the source supports. Use `null` for unknown cost, date, duration or team size. Dates in a news story or a past case study are not future opportunity dates. A programme offering team days by enquiry should normally remain `enquiry`; an ongoing trained role should be `ongoing`, even if the recruitment page is live. An organisation or search portal is a `broker` or `platform`, rather than an activity.

The `resilience_relevance` text is an atlas assessment. Keep it modest and specific to the task, such as supporting continuity of a community service, a preparedness activity or recovery support. An attractive outdoor activity is not automatically flood protection; a high-risk area is not proof of volunteer demand. Source-derived descriptions and this assessment should remain visibly separate.

For location, record whether the coordinate is an activity venue, an office or an approximate area marker. Preserve the source for a precise location. The pilot's area markers are display anchors, not destinations or claims of proximity. Postcode matching identifies a pilot search area. It does not calculate travel distance or establish host coverage. A future travel-radius search should use verified activity locations, and should separately identify the community served by remote work. Do not infer service boundaries from an office address or assume all members of a network share one catchment.

**The editorial cycle is simple.**

1. Add or amend a record from an official host or broker source, recording evidence for its important attributes. Search existing IDs and source links first to avoid duplicating one programme across several venues or platforms.
2. Have an editor check the proposed status, location basis and evidence. Read the page itself, including any closure or eligibility note. A page returning HTTP 200 is not enough.
3. Set `checked_at` to the day of that review and `review_due` to the agreed next review date. The initial pilot uses a monthly review cycle. Use an earlier date for short-lived recruitment and scheduled events. Retain actual end dates and application deadlines when the host publishes them.
4. Validate the dataset, inspect the difference from the previous version, and preview the changed records in the map and list. Publish through the atlas's existing repository release process.
5. Triage broken links, overdue records and host corrections weekly. Close a withdrawn offer promptly. Keep stable IDs and previous versions so that a change can be understood or reversed.
6. Re-read every active source by its review deadline. Update the evidence and check date only after reviewing it. If the editor cannot establish that the source still supports the record, leave it out of active results until reviewed.

**Expiry is independent of whether someone opens the maintenance report.** The runtime interface excludes closed, expired and overdue-review records from its default active results. It allows them to be inspected separately. A record is expired when its end date or application deadline is before today. A review date before today requires review; a record due today remains current. Missing activity dates remain unknown, rather than becoming invented open-ended bookings. The pipeline uses the same precedence: closed, then expired, then review required, then current. These rules operate on dates; an exact closing time is not represented in this pilot schema.

The initial records checked on 18 September 2026 and due on 18 October 2026 will leave active results after that review date unless an editor actually checks them again. This is intentional: an unattended pilot should not indefinitely look current. An empty map or area means no current listings are recorded, not that the community has no volunteering opportunities.

**The included pipeline supports reviewable updates.** Run these commands from the repository root with Python 3. They do not advance source-check dates automatically. The master data is `data/volunteering.json`; `data/volunteering-template.csv` is the empty input template.

```bash
python3 scripts/volunteering_data.py validate data/volunteering.json
python3 scripts/volunteering_data.py export data/volunteering.json --output opportunities.csv
```

Edit the exported file or prepare records from the template. Arrays use pipe-separated values, location fields are flattened and the evidence column contains a JSON array. Keep the full field structure and stable IDs. Import to a staging file before replacing the published dataset:

```bash
python3 scripts/volunteering_data.py import opportunities.csv --base data/volunteering.json --output volunteering-staged.json
python3 scripts/volunteering_data.py validate volunteering-staged.json
python3 scripts/volunteering_data.py review volunteering-staged.json --output review.md
```

Import replaces the record collection with the CSV rows and preserves the base metadata; it is not an append operation. Importing a filtered subset would remove all other records. Inspect the staged file and version-control diff before replacing `data/volunteering.json`. The interface's shortlist export is for users' reference, not a substitute for the pipeline's complete round-trip export.

Routine maintenance reports:

```bash
python3 scripts/volunteering_data.py review data/volunteering.json --output review.md
python3 scripts/volunteering_data.py review data/volunteering.json --format json --output review.json
python3 scripts/volunteering_data.py check-links data/volunteering.json --output link-report.json --timeout 10 --workers 4
python3 -m unittest discover -s tests -p 'test_volunteering_data.py'
```

`review` also accepts `--today YYYY-MM-DD` to test a future catalogue date. Use this to inspect ageing, not to change source-check history. `check-links` creates a report without rewriting the catalogue. Treat timeouts, 403s, redirects and other failures as review leads: some valid sites block automated requests. Conversely, a successful response can be a homepage redirect or a closed programme page. Record closure only on evidence, not on one network failure.

The repository includes `.github/workflows/volunteering-review.yml` for read-only validation, tests and a review-report artifact, scheduled for Mondays at 07:23 UTC. It also checks pull requests and main-branch changes to the catalogue or pipeline. A manual run can request link checking. Reports are retained as workflow artifacts for 30 days. It does not open issues, email organisations, commit changes, or renew records. A maintainer must inspect the workflow results; adding the file alone does not establish that a scheduled run has succeeded. Scheduling depends on the workflow being present and enabled on the repository's default branch.

The additional organisation directory is maintained separately from opportunities. Check its role, coverage text and volunteering link when checking a related activity. The volunteering CLI validates `data/volunteering.json`; do not assume it also validates the separate partner directory. A single host can have several activities without becoming several separate organisations.

**Move from referrals to a working placement pilot through local agreement.** First ask a willing broker in each selected area to identify useful work that hosts actually want. Agree a small set of employee-suitable activities, then settle dates, capacity, responsibilities and any supervision or materials costs with hosts. Test referrals with a small group of employers before adding booking or accounts. Any outreach requires a separate authorised step; this build has not contacted organisations or made arrangements on their behalf.

Candidate local routes are grounded in existing public offers: [London Plus's volunteer centre network](https://londonplus.org/london-vc-network/) can help identify borough contacts, [Spark Somerset](https://www.sparksomerset.org.uk/volunteering/) runs a local opportunity platform, and [Cumbria CVS](https://cumbriacvs.org.uk/volunteering/employer-supported-volunteering/) advertises employer-supported brokerage. Coordination organisations such as [LCEP](https://londonplus.org/lcep/), [Somerset Prepared](https://www.somersetprepared.org.uk/) and [ACT](https://cumbriaaction.org.uk/community-emergency-planning/) can inform relevance and connections. Their inclusion here does not establish willingness to participate.

Before using a bulk platform feed, agree the export format, permitted reuse, update frequency, attribution and withdrawal process. This pilot uses brief original descriptions with links to public sources; it does not demonstrate permission to reproduce whole databases, photos or host-supplied personal details. An agreed CSV export is a sufficient starting point. Automated ingestion should preserve the last meaningful source or host update separately from the time a feed was fetched. Add live capacity management only if partners can supply and maintain it.

**Budget for coordination and host support, as well as technical work.** The main cost drivers are editorial checking, broker time, developing useful tasks, host supervision, equipment and materials, transport or access needs, and resolving cancellations. Cumbria CVS explicitly invites discussion of brokerage costs, so free employee time should not be equated with a cost-free service.

For workload planning, measure the first month rather than adopting an unsupported price. A transparent illustrative calculation is 30 records × 10 minutes for a monthly source review = five hours of reading and editing, before link triage, partner calls, new-record research or host coordination. Both 30 records and 10 minutes are planning assumptions, not measured requirements or a quote. If maintenance capacity falls short, reduce active catalogue size and retain useful broker referrals rather than extending review dates without checking.

Assess the pilot using hosts' experience as well as employee participation: useful tasks completed, whether promised work was delivered, repeat host participation, unresolved enquiries, host time/cost, catalogue freshness and which areas lack a willing local reviewer. Clicks and volunteering hours alone do not establish improved resilience. Do not display an invented monetary impact score.

The most useful next inputs are a named editor; willing local brokers; a small set of host-confirmed tasks with dates, locations and constraints; employer office areas and aggregate team/skills availability; and permission for any partner exports. No additional large geospatial download is needed to maintain this referral pilot.
