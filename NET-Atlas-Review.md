# England atlas: review for the National Emergencies Trust

Reviewed 18 September 2026. Prepared by Hugh Lamarque with research and implementation support.

## Assessment

The atlas is a useful geographical reference, but its original emphasis on land cover, groundwater, settlement and global access models does not closely match NET’s everyday decisions. The strongest next step is to connect an affected area with its population, barriers to support and local organisations. More environmental layers alone would not achieve this.

The live build was inspected on desktop. It offers 296 local authorities, modelled population, 5 km hexagons, environmental rasters, transport and OpenStreetMap facilities. The original panel split controls and legends into separate small scrolling areas. Satellite imagery competed with thematic colours and the generic country-analysis page gave equal prominence to measures with very different practical uses.

## Why this direction fits NET

NET’s 2024–25 annual report describes national appeals, help to local disaster responses including Southport, work with community foundations and Local Resilience Forums, and support for survivors’ financial, physical and mental-health needs. Its work also includes young survivors and bereavement. This supports an atlas organised around people and recovery, rather than a system limited to natural hazards. [Annual report, especially pages 7–8 and 12–20](https://cdn.nationalemergenciestrust.org.uk/docs/3513_NETAnnualReport_24_25_v7.pdf).

NET and Lancaster University’s *Stories After The Storms* research highlights difficulty accessing practical, financial and wellbeing support. The findings support mapping support routes and unmet needs over time. They do not provide a representative national risk model and their survey percentages should not be assigned to mapped populations. [NET research summary](https://nationalemergenciestrust.org.uk/new-report-stories-after-the-storms).

## Implemented in this release

- A lighter default basemap, more readable theme controls and one continuous sidebar scroll.
- Four financial-pressure maps: deprivation concentration, income deprivation, income deprivation affecting children, and income deprivation affecting older people.
- Corrected IoD2025 local-authority summaries, linked by exact codes to 294 authorities. Barnsley and Sheffield remain unavailable because their 2025 atlas codes differ from the source. A name match would conceal the geography issue.
- Forty-five England community-foundation offices from the UKCF directory, with region and text filters, websites, phone numbers, map locations and a filtered CSV export. Office markers are explicitly distinguished from service areas and confirmed NET appeal relationships.
- Area briefings combining modelled population with the new indicators, available as a standalone printable HTML document and CSV. Source dates and denominator notes travel with the export.
- Clearer notices for historical water observations, old travel-time models, projected settlements and unverified facility availability.
- Deprivation measures in the area-comparison page, with missing values sorted last and the selected measure carried back onto the map.

## Next datasets, in priority order

| Priority | Addition | Practical use | Source and implementation requirements |
|---|---|---|---|
| 1 | Neighbourhood deprivation and Census characteristics | Locate needs hidden by district averages; plan accessible outreach and transport assistance. | Use the [official IoD2025 small-area files](https://www.gov.uk/government/statistics/english-indices-of-deprivation-2025) and [ONS Census 2021 topic summaries](https://www.ons.gov.uk/census). Start with age, disability, unpaid care, household composition, car availability and English-language proficiency. Keep denominators and census dates visible. Reconcile 2021 LSOAs with current local authorities. Authority-level TS038 disability and TS045 car availability are now included; the remaining task is finer geography and additional characteristics. |
| 1 | Flood exposure and event footprints | Identify populated neighbourhoods intersecting river, coastal or surface-water risk, then distinguish long-term exposure from a current event. | Obtain the actual Environment Agency risk datasets and their scenario/probability metadata. The current build reports no validated flood-risk raster. Use [EA flood warnings](https://check-for-flooding.service.gov.uk/alerts-and-warnings) for current status. Alert polygons are warning areas, not observed inundation. Historical JRC water is not a substitute. |
| 1 | Verified support coverage | Identify which organisations serve an affected area and how to reach them. | Develop the [UKCF directory](https://www.ukcommunityfoundations.org/find-a-foundation) into confirmed coverage areas. The directory now includes the 38 English Local Resilience Forums listed by the Cabinet Office. Next add local voluntary-sector infrastructure bodies, followed by specialist disability, youth, mental-health and bereavement organisations. Obtain capability, referral route, accessibility, last verification date and named organisational contacts from the organisations. A charity’s registered office is not its delivery footprint. |
| 2 | Official population estimates | Give robust administrative-area denominators while retaining WorldPop for spatial exploration. | Add ONS population estimates for the same geography and clearly labelled year. Use Census data for household characteristics and check local-authority reorganisations. Do not silently replace WorldPop’s spatial cell values with district totals. |
| 2 | Housing and financial pressures | Understand displacement, difficulty paying for essentials and longer recovery. | Start with government local-authority homelessness and temporary-accommodation statistics, Census tenure/overcrowding, and DESNZ fuel-poverty statistics. Verify the exact release and denominator before ingestion. Insurance gaps require an appropriate survey or partner dataset; deprivation cannot establish whether a household is insured. |
| 2 | Heat and cold vulnerability | Combine weather conditions with age, disability, housing and ability to reach help. | Use UKHSA/Met Office alert products and appropriately licensed heat-exposure data. Keep live warnings separate from long-term vulnerability. A drought raster is not a heat-risk layer. |
| 2 | Grant and recovery monitoring | Show whether support reaches affected places and continues as needs change. | A separate restricted workspace should hold NET/partner-approved aggregate applications, awards, amounts, support type, time to payment, unmet needs and follow-up outcomes. Publish only safe aggregates. Public [360Giving](https://www.threesixtygiving.org/) data may provide historical context, after checking coverage and whether geography refers to recipients or beneficiaries. Missing grants do not establish no support. |
| 3 | Current care facilities and access | Identify potential access barriers and key facilities. | Compare mapped healthcare with authoritative service directories and verified operating information. Add care homes and relevant community venues. Historical global travel times and OSM points do not establish current capacity, accessible routes or emergency-centre status. |

## Product direction

The most useful workflow would be: locate or draw an affected area, inspect its population and support needs, identify verified delivery partners, and export a short briefing with sources. Add a recovery view organised by the incident date and support still needed. Terrorist attacks and major fires can affect survivors living far from the incident location, so incident geography and survivor residence must remain separate concepts.

A future exposure calculation should intersect an identified footprint with appropriately detailed population data. It should report the date, method and uncertainty. Do not assign a district’s full population to a warning polygon, multiply district percentages by a small incident-area population, or use area-only apportionment as an unlabelled estimate of affected people.

Keep a neutral cartographic style: dark text, restrained sequential palettes, light contextual geography and clear source dates. Reserve strong warning colours for actual alert severity. A composite “NET risk score” would require validated assumptions and consultation; independent interpretable indicators are more useful at this stage.

NET works across the UK. This remains an England atlas. A UK extension needs Scotland, Wales and Northern Ireland data and a documented approach to cross-nation differences, especially deprivation indices. Do not combine country-specific deprivation ranks into one UK league table.

## Data provenance

**Deprivation:** [MHCLG IoD2025](https://www.gov.uk/government/statistics/english-indices-of-deprivation-2025), corrected File 10 (lower-tier), updated 17 November 2025. Proportions and average income-domain scores are multiplied by 100 for display. Ranks are not averaged or converted into percentages. Source definitions distinguish people, children, older people and neighbourhoods. A zero is retained as zero; unmatched geographies remain missing. Crown copyright, Open Government Licence v3.0.

**Community foundations:** [UK Community Foundations directory](https://www.ukcommunityfoundations.org/find-a-foundation), checked 18 September 2026. The 45 records cover directory entries grouped under English regions. The website supplies the office coordinates. Its regional grouping is retained and is not treated as a definitive service boundary. Foundation availability and NET partnership status have not been inferred.

**Existing layers:** Source dates, methods and coverage remain in the atlas’s original manifest. Population remains WorldPop 2025, not an official ONS population estimate. A raster footprint percentage should not be interpreted as a census response rate or assumed by itself to prove an equivalent share of residents is missing.


## Five further improvement rounds — release 2026.09.18.5

### 1. Data accuracy and barriers to support

Added three Census 2021 measures from the official Nomis API: disability under the Equality Act, activities limited a lot, and households without a car or van. Numerators and denominators are retained. Disability uses all usual residents; car availability uses households. Rates are calculated from published counts, not by applying percentages to WorldPop estimates. These are crude disability rates, not age-standardised comparisons. The source counts include Census disclosure-control adjustments.

The API geography is district/unitary authorities as of April 2023. 294 of 296 atlas codes match exactly. Barnsley and Sheffield remain unavailable; no boundary conversion or name-only join has been made. All 882 displayed Census rates were independently recomputed from their saved numerator and denominator. Existing deprivation extraction was checked against the corrected workbook’s actual column headings and sample rows.

Sources: [TS038 disability](https://www.nomisweb.co.uk/datasets/c2021ts038), [TS045 car availability](https://www.nomisweb.co.uk/datasets/c2021ts045). Exact request URLs, returned source CSVs and SHA-256 checksums accompany the updated builder.

### 2. Area comparisons and useful outputs

Added a six-area shortlist, persistent in the browser, with a side-by-side table, CSV export and printable HTML comparison. Shared links restore the selected indicator, area and shortlist. Census counts and their population/household bases now appear in briefings and CSV exports. Comparison bar scaling uses all authorities, so filtering does not change the apparent scale. Missing values remain distinct from zero.

### 3. Partner search and provenance

Added the 38 English Local Resilience Forum entries from the [Cabinet Office directory](https://www.gov.uk/guidance/local-resilience-forums-contact-details), listed as updated 11 February 2026 and checked 18 September 2026. Their published links include 38 community risk registers and 34 separate websites. These links were extracted from the government directory; their destination content and individual current roles were not all independently verified.

The combined directory has 83 entries: 45 foundations and 38 forums. Organisation type, region, text and saved-organisation filters carry into exports. Source region labels are retained while the two spellings of Yorkshire and the Humber are harmonised for filtering. No LRF office coordinates or service polygons have been invented. Foundation office markers remain separate from the broader directory.

### 4. Layout and accessibility

Prioritised six primary map views and placed the four contextual views in an explicit “More map views” disclosure. This brings the active indicator and legend higher in the panel. Added keyboard navigation for place search, clearer empty states, explicit legend range endpoints, a contrasting dashed area selection, more usable mobile controls and access to Sources on mobile. Selecting a town now clears the previous authority and selects its containing atlas authority where one is found.

### 5. Source catalogue and next-data guide

Added a searchable source catalogue, grouped filters, CSV and JSON provenance exports, and a combined all-area CSV including the new indicators. Source documentation, date and interpretation appear together. The additional-data guide gives verified Environment Agency product pages, the actual summary ZIP names, and observed GeoPackage download options. Flood exposure files have not yet been ingested.

## What is still unresolved

This is an England planning atlas, not a UK-wide incident management system. There are no live warning feeds, confirmed incident footprints, current service-capacity data, verified organisation service boundaries or grant case records. The atlas links to the live EA warning service. Historical water observations are clearly separate from flood risk.

The most useful next inputs are the two EA Key Summary Information ZIPs, followed by the actual RoFRS and RoFSW spatial layers. See [NET-Data-Download-Guide.html](NET-Data-Download-Guide.html). A NET-confirmed partner-coverage table would also be valuable. The guide distinguishes data already loaded from proposed additions.
