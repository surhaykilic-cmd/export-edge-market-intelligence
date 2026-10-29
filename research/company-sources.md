# Free buyer and supplier discovery evidence

Checked 29 October 2026. This connector imports official public business/organisation evidence only. It creates no accounts, sends no messages and purchases no data. Personal contacts and addresses are not imported.

## Food Standards Agency approved establishments

- Official catalog: https://data.food.gov.uk/catalog/datasets/1e61736a-2a1a-4c6a-b8b1-e45912ebc8e3
- Latest verified CSV: https://fsaopendata.blob.core.windows.net/opendatacatalog/Approved-Establishments-01-10-2026.csv
- Documentation: https://www.food.gov.uk/business-guidance/approved-food-establishments
- Licence: Open Government Licence v3.0, as stated by the catalog.
- Cadence: monthly source snapshot; catalog-link discovery on refresh, with the last verified direct file retained if discovery is unavailable.
- Coverage: England/Wales establishments approved for specified animal-origin food activities; selected corporate/business names, bounded to 1,000 plant-level records for this MVP.
- Imported fields: approval identifier, trading name, country/region, listed food category and activity, official file URL and retrieval time. No street address, telephone, personal contact, coordinates or email.
- Meaning: official approval/establishment activity evidence. It does not prove commercial supply, current trading status beyond the dated source, export capability, current inventory, product quality or willingness to transact. Separate approval numbers remain separate records.

## UK Find a Tender public OCDS feed

- Official open-contracting documentation: https://www.gov.uk/government/publications/open-contracting
- Public no-key read endpoint: https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?limit=100
- Licence: Open Government Licence v3.0, supplied in the release package.
- Coverage: recent public UK notices. Food-related notices are identified using published CPV 15 (food/beverages and related products), 555 (canteen/catering), narrower food/agricultural-product categories 032, 0331 and 03131, or an explicit food-related title match. Broad CPV 03 alone is deliberately insufficient: it also includes timber, biodiversity credits and landscaping. Title-only matches are labelled for inspection.
- Routine bound: two pages, 100 releases/page, with a pause between pages. Explicit backfill is capped at six pages. HTTP 429 and Retry-After are respected without an immediate retry; successfully retrieved pages and prior evidence remain available. This is a discovery sample, not exhaustive procurement coverage.
- Imported fields: organisation name, buyer or named award-supplier role, procurement title, CPV codes, notice date/status, notice identifier, official notice URL and source/retrieval time. Names are not enriched with personal contacts.
- Meaning: a buyer named in a published procurement or an award supplier named in that procurement. Awarded/complete notices describe historical evidence, not current buying intent. No contact verification, sanctions checks, export verification or qualification has been performed.

The Contracts Finder public OCDS endpoint was also tested successfully. Its recent sample contained no qualifying food notices, so the implemented buyer connector uses Find a Tender. The notice-submission API's account/API-key requirements are distinct from the public OCDS read endpoint; no submission interface is used.

## Data handling

Keep prior verified evidence on source failure. Deduplicate procurement organisations by source party identifier, retaining their latest published evidence. A register entry is an establishment, so it is not merged into a single supposed global company. Entries are labelled `supplier-discovery` or `buyer-discovery` with source-specific confidence and limitations, never “verified buyer/supplier”.

The verified bootstrap contains 1,000 approved-establishment records and three procurement organisations: Manchester City Council and Places for People Group Limited as published-procurement buyers, and BFS Group Limited T/A Bidfood as a named food-contract award supplier. Two unrelated broad-CPV03 notices (biodiversity units and timber signage) were excluded after inspection and are covered by regression tests. This is a UK discovery sample and should not be represented as global buyer coverage.

`node scripts/seed-companies.mjs --fsa-only` refreshes the verified register file in one request, counts the eligible corporate/business-named establishment rows using the same parser, and keeps the first 1,000. It preserves all existing procurement records without querying Find a Tender. The eligible count is parser-filtered, not the total number of establishments in the underlying FSA register and not a count of distinct corporate groups.
