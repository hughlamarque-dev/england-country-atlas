# Data credits and implementation references

The downloaded data retains its original licences. This kit does not relicense third-party data. Provider pages and the metadata supplied with each download are the authoritative source for the exact release and licence. The generated map retains provider names and dates.

- **ONS:** [Open Geography Portal](https://geoportal.statistics.gov.uk/). December 2025 LAD and counties/unitary authority boundaries. Contains National Statistics data © Crown copyright and database right 2025; administrative boundary sources may include Ordnance Survey attribution as stated in the download.
- **WorldPop:** [WorldPop](https://www.worldpop.org/). GBR 2025 constrained population, R2025A. Retain the dataset's citation and attribution.
- **ESA WorldCover:** [2021 product and downloads](https://esa-worldcover.org/en/data-access). ESA WorldCover 10 m 2021 v200. The web display is generalised and is not a 10 m analysis product.
- **GHSL:** [GHSL data](https://human-settlement.emergency.copernicus.eu/download.php). European Commission Joint Research Centre, GHS-BUILT-S R2023A. 2000/2020 historical estimates and 2030 projection remain separate.
- **Night lights:** [Earth Observation Group annual VIIRS](https://eogdata.mines.edu/products/vnl/). Annual 2025 masked radiance. A missing observation-count companion is disclosed.
- **Surface water:** Source: EC JRC/Google. [Global Surface Water data access](https://global-surface-water.appspot.com/download), [v5 data users guide](https://storage.googleapis.com/water-world/downloads_ancillary/DataUsersGuidev2024_v.5.pdf). Pekel, J.-F., Cottam, A., Gorelick, N. & Belward, A. S. (2016), High-resolution mapping of global surface water and its long-term changes, Nature 540, 418–422, [doi:10.1038/nature20584](https://doi.org/10.1038/nature20584). The v1.5 release combines Landsat collections; registration differences can affect small changes. Code 253 is non-water, 254 lacks comparable months and 255 is no data in the change TIFF. These are not numeric change measurements.
- **BGS:** [Hydrogeology 1:625,000](https://www.bgs.ac.uk/datasets/hydrogeology-625k/). British Geological Survey © UKRI. Regional aquifer type/productivity, with original descriptive attributes retained.
- **SPEI:** [SPEI global drought monitor and data](https://spei.csic.es/). CSIC SPEIbase six-month index. Read dates from the file. Historical threshold frequency is not a current hazard forecast.
- **OSM:** [OpenStreetMap contributors, ODbL](https://www.openstreetmap.org/copyright); [Geofabrik England extract](https://download.geofabrik.de/europe/united-kingdom/england.html). Selected/simplified OSM-derived GeoJSON remains subject to the applicable ODbL obligations. Original source extract and source dates are identified.
- **Accessibility:** [Malaria Atlas Project accessibility](https://malariaatlas.org/research-project/accessibility-to-healthcare/). Global healthcare travel-time surfaces (2019) and the separate global cities travel-time surface (2015), if present. This is historical modelled access.
- **Rainfall:** [Met Office HadUK-Grid](https://www.metoffice.gov.uk/research/climate/maps-and-data/data/haduk-grid/haduk-grid). Optional 2025 monthly totals and 1991–2020 monthly normals, summed only when all twelve fields are available.

Technical references:

- [QGIS command-line options](https://docs.qgis.org/latest/en/docs/user_manual/introduction/qgis_configuration.html#command-line-and-environment-variables): new instance/profile and `--code` bootstrap.
- [QGIS tasks](https://docs.qgis.org/latest/en/docs/pyqgis_developer_cookbook/tasks.html): background GDAL processing, UI-thread project construction.
- [GDAL OSM driver](https://gdal.org/en/stable/drivers/vector/osm.html): interleaved dataset reading, preserving nodes needed for ways.
- [GDAL VRT](https://gdal.org/en/stable/drivers/raster/vrt.html): masking special byte codes before resampling.
- [GitHub Pages REST API](https://docs.github.com/en/rest/pages/pages): main-branch publication and build verification.
- [Leaflet](https://leafletjs.com/): bundled 1.9.4, licence in `web/vendor/LICENSE`. Basemaps are supplied online by Esri or CARTO/OSM with displayed attribution.


## Community planning additions (18 September 2026)

- MHCLG English Indices of Deprivation 2025, corrected File 10 (lower tier), updated 17 November 2025: https://www.gov.uk/government/statistics/english-indices-of-deprivation-2025
- Exact code joins for 294 of 296 local authorities. Barnsley and Sheffield withheld pending reconciliation of changed boundary codes.
- Four indicators retain their official definitions: share of neighbourhoods in the most deprived decile, Income, IDACI and IDAOPI average scores multiplied by 100. No combined risk score or inferred individual eligibility.
- UK Community Foundations directory, 45 offices grouped under English regions, checked 18 September 2026: https://www.ukcommunityfoundations.org/find-a-foundation
- The office directory is not a map of service areas or a list of confirmed NET appeal partners.
- See NET-Atlas-Review.md for rationale and prioritised additions.


## Environment Agency flood-exposure summaries

User-supplied RoFRS_KeySummaryInfo.zip and RoFSW_KeySummaryInfo.zip, inspected 18 September 2026. River/sea workbooks June 2026; surface-water workbooks September 2025; NRD 2023 property base. Source catalogues: https://environment.data.gov.uk/dataset/dcbad548-ba75-4f32-bf22-306f9059343e and https://environment.data.gov.uk/dataset/0ff39df9-b8da-4885-831d-2d3bca8eb6cd . Open Government Licence. Workbook hashes, sheet names, coverage and source checks accompany data/flood_risk.json. See NET-Atlas-Review.md for known inconsistencies and excluded geographic matches.
