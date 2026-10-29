# Food and agriculture source audit

Checked 29 October 2026. This is a public-evidence audit, not an exhaustive inventory of Tridge's private supplier agreements. Source availability does not prove connection to Export Legacy. See `sources.json` for separate test and integration status.

## What Tridge actually discloses

Tridge names **UN Comtrade and national customs databases** for trade statistics, and **FAO** for production data. Its price-source network is described collectively; the public pages inspected do not enumerate all 400-plus suppliers. Company resolution, product mappings and analysis are additional Tridge work, not fields supplied by UN Comtrade.

- [Tridge Data & Analytics](https://www.tridge.com/data-analytics)
- [Tridge Shelf capabilities](https://www.tridge.com/about/tridge-eye/shelf)
- [Market-curations reference](https://www.tridge.com/market-curations)

The reference site's footer requires prior written consent for bulk extraction. Shelf also says public pages are readable, but not bulk-extractable. No Tridge articles, proprietary datasets, supplier profiles or private APIs were bulk copied in this audit. We can build comparable research functions and cite/link public material. Importing their content wholesale needs licensed access.

## Feature coverage to target

| Layer | MVP evidence source | Important gap |
|---|---|---|
| Country/product trade values | UN Comtrade; national customs | Country aggregates do not identify individual firms or shipments |
| Production, harvested area and yield | FAOSTAT QCL | Product/country/year definitions and flags must be retained |
| Domestic wholesale/retail prices | FAO GIEWS FPMA; USDA Market News | Uneven commodity/market coverage; grades and units differ |
| International reference prices | World Bank Pink Sheet; FPMA international | Benchmarks are not current offers or transaction quotes |
| Supply, stocks and consumption | USDA PSD; FAO/AMIS | Marketing-year forecasts differ from calendar-year observations |
| Tariffs | WTO; national customs | Free access is not unrestricted commercial redistribution; route detail matters |
| Weather at origin | NASA POWER; Copernicus | Geospatial modelling is needed; a national average is insufficient |
| Harvest windows | FAO crop calendars / GIEWS | Agricultural calendars are distinct from statistical seasonality |
| News and briefs | Official releases, original arithmetic summaries | Do not copy full articles or invent causes for numeric changes |
| Company and shipment analytics | Separately licensed customs/manifests; verified registrations | No general free source offers equivalent worldwide company coverage |

This gives a path to a useful MVP, not evidence of feature or data parity with Tridge.

## Endpoints verified during this audit

1. **FAOSTAT catalog:** `https://bulks-faostat.fao.org/production/datasets_E.json` returned official JSON. Entries include dataset codes, descriptions, update dates and bulk download locations. Fetch only required domains rather than the all-data bundles. FAOSTAT's older query API timed out in a 20-second test; this is a failed test, not proof of permanent unavailability.
2. **FAO FPMA international series:** `https://fpma.fao.org/giews/v4/global/price_module/api/v1/FpmaSerieInternational/` returned 90 series with identifiers, product names, source names, units, currencies and each series' time coverage. This count is a test-time observation.
3. **FAO FPMA observations:** `https://fpma.fao.org/giews/v4/global/price_module/api/v1/FpmaSeriePrice/?uuid__in=00398845-2bc6-4f4d-98e9-0a655ef74ea7&periodicity=monthly` returned actual observations. The tested series' latest point was August 2026. Preserve `source_name`: the series catalog includes external providers, not only FAO-origin data.
4. **USDA PSD bulk:** `https://apps.fas.usda.gov/PSDOnline/downloads/psd_alldata_csv.zip` returned HTTP 200 and a ZIP content type, with approximately 10.45 MB content length. A successful HEAD test establishes file availability, not that this platform has parsed or ingested it.
5. **Brazil Comex Stat releases:** `https://api-comexstat.mdic.gov.br/general/dates/updated` returned update date 6 October 2026 and latest period September 2026. [Official OpenAPI specification](https://api-comexstat.mdic.gov.br/docs/doc.yaml) documents public aggregation queries and metadata. Queries should respect throttling and use monthly detail for partial-year ranges.
6. **World Bank Pink Sheet file:** the current workbook link was resolved from the [official Commodity Markets page](https://www.worldbank.org/en/research/commodity-markets): `https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx`. The web reader identified XLSX content but cannot parse it; import and schema validation remain implementation work. Resolve from the official landing page rather than assuming the document hash never changes.

## Access and reuse findings

- **FAO:** corporate statistical datasets default to CC BY 4.0 unless metadata or the webpage specifies otherwise. Retain attribution, flags and explicit third-party restrictions. [FAO database terms](https://www.fao.org/contact-us/terms/db-terms-of-use/en/).
- **UN Comtrade:** basic preview access needs no key; greater API capacity needs a free or premium key. Access limits and commercial redistribution permission are separate questions. [API access](https://uncomtrade.org/docs/un-comtrade-api/), [data-use policy](https://uncomtrade.org/docs/policy-on-comtrade-data-use/).
- **USDA FAS:** PSD/GATS API documentation requires an api.data.gov key. PSD's public bulk ZIP is a usable separate distribution route. [Official portal](https://apps.fas.usda.gov/opendatawebv2/).
- **WTO:** free API-key signup exists. Tariff data has additional use and dissemination conditions; do not launch commercial resale based only on the word free. [API portal](https://apiportal.wto.org/), [official tariff portal](https://ttd.wto.org/en).
- **UK HMRC:** official documentation offers open OData endpoints without an Authorization header, pagination and a 60-request-per-minute limit. This audit verified the documentation, not a live data query. [Official API documentation](https://www.uktradeinfo.com/api-documentation).
- **US Census:** a live international-trade query returned a Missing Key HTML page. Older general documentation describes a no-key allowance, so the actual response takes precedence: treat this integration as requiring a key until a successful current test proves otherwise.
- **Eurostat:** the documented no-key Statistics API supports JSON-stat and Comext. One guessed agricultural-price dataset code returned 404. Discover valid datasets/codelists before integrating; do not label an arbitrary endpoint working. [Official API guide](https://ec.europa.eu/eurostat/en/web/user-guides/data-browser/api-data-access/api-getting-started/api).

## Production source contract

Every observation should retain source ID, exact query or file URL, source release/update date when supplied, retrieval timestamp, reference period, classification edition, reporter/partner IDs, product code and definition, measure, currency, unit, price basis, source flags and import run ID. Distinguish reported, estimated, provisional, revised and forecast values. Retain previous good data on source failure, log retryable failures, and never turn missing values into zeros. Connector counts, product counts and last-success dates must be derived from successful ingestion, not the planned catalog.

For unattended runs, use conditional/availability checks, respectful request budgets and backoff; ingest releases without needing an open browser. Report a source as connected only after both a successful write and persisted readback have been verified. A schedule being created does not prove any run executed.

## Additional import work completed after the initial audit

USDA's complete bulk CSV was downloaded and streamed through a local parser. A bounded food-production extract was saved to `dist/production.json`: 19 product definitions, 167 geography labels and 5,146 observations in the four marketing years 2023–2026. The source's European Union and Other labels are retained with `isAggregate: true`; 165 other labels are countries or territories. Source units and release vintages are preserved. These data include estimates/forecasts and must not be described as observed calendar-year totals.

The complete ZIP is about 10.45 MB compressed but its CSV expands to 202.22 MB. Server ingestion must stream it, not load the entire uncompressed CSV in memory. The smaller `https://apps.fas.usda.gov/PSDOnline/downloads/psd_coffee_csv.zip` was downloaded and verified: it contains `psd_coffee.csv`, about 9.31 MB uncompressed, with the same field structure.

World Bank XLSX structure was checked directly: choose the named Monthly Prices worksheet (currently `xl/worksheets/sheet2.xml`), not the first hidden worksheet. Commodity headings are on row 5, units on row 6, data begin on row 7, and periods are strings such as `1960M01`. Row 4 holds the publisher update note. Preserve missing-cell markers and do not import the separate index sheet as prices.
