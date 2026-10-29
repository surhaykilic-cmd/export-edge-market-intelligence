# USA and Canada company-discovery sources

Checked and seeded on 29 October 2026. This connector contributes **646 plant-level discovery records: 245 United States and 401 Canada**. These are official registry/approval facts, not verified commercial suppliers, leads, live offers, or a count of unique corporate groups. Plants operated by the same organisation remain distinct.

## Connected sources

| Source | Snapshot | Coverage | Reuse basis |
| --- | --- | --- | --- |
| [USDA AMS — Dairy Plants Surveyed and Approved for USDA Grading Service](https://apps.ams.usda.gov/dairy/ApprovedPlantList/) | Publication 20 October 2026; retrieved 29 October 2026 | 245 eligible business-named United States dairy plants, including product-code operations from Sections I and II | USDA public-domain information with attribution; see [USDA digital rights policy](https://www.usda.gov/about-usda/policies-and-links) |
| [Ontario — Provincially licensed meat plants](https://data.ontario.ca/dataset/provincially-licensed-meat-plants) | All-plants resource last modified 6 October 2026; retrieved 29 October 2026 | 401 eligible business-named Ontario meat plants from 458 source rows | Dataset declares `OGL-ON-1.0`, [Open Government Licence – Ontario](https://www.ontario.ca/page/open-government-licence-ontario) |

The [USDA program explanation](https://www.ams.usda.gov/services/auditing/dairy-plant-survey-program) links to the official approved-plant application. The application publishes a full HTML table in one public GET. The publication states it is revised every three months; underlying official inspections occur at least twice yearly. Each record retains the original state-qualified plant number, listed product codes, source URL, publication date and retrieval time. A repeated plant across dairy Sections I/II is merged by state and plant number only; a conflicting name fails the source refresh rather than combining identities. State headings determine actual establishment geography. Foreign headings are not relabelled as US establishments.

USDA Section I dairy codes identify listed products/operations eligible for grading or inspection service. Section II P-code operations meet facilities and sanitation requirements; the product's grading eligibility is conditional on approved ingredients and continuous inspection. The public registry is not a blanket product-quality endorsement or export clearance. Product family labels are mapped from the source's code prefixes, not guessed from the company name.

Ontario's CKAN metadata endpoint is fetched before the CSV. It confirms the same fixed resource identifier and the open licence on each refresh. The source's `last_modified` field supplies the publication date; the catalogue page modification date is not substituted. Its bilingual CSV is Windows-1252. Only business name, original plant number, province, food-animal flags and processing flags are retained. Products follow explicit flags in the source. Leading-zero plant numbers remain strings. Provincial plant registration is **domestic evidence**: the [Ontario Meat Inspection Program](https://www.ontario.ca/page/meat-inspection-program) states provincially licensed abattoirs sell only within Ontario. The records explicitly avoid claiming permission to trade across provincial or international borders.

No private-person contact names, street/city/postal addresses, phone numbers, email addresses, coordinates or unverified company websites are retained. Agency/university names and entries without a business-name indicator are excluded. This intentional filter means these counts are a subset of the public registers and should not be presented as all companies in either country.

## Request limits and recovery

- Three public requests per run: USDA HTML, Ontario dataset metadata, Ontario CSV. No accounts, API keys, paid services or proxy hosts.
- Two source jobs run concurrently. Each source shares a deadline of 18 seconds across its requests. Responses are capped at 1.5 MB; redirects are rejected.
- Default bounds are 1,000 USDA and 800 Ontario records. The current snapshots are below these limits.
- A changed licence, unexpected resource host/layout, very small response, duplicate/conflicting identifier or more than 50% count reduction retains all previous records from that source.
- Other source records passed in `previous.records` remain untouched.
- HTTP errors retain prior source timestamps and counts. `Retry-After` is respected up to 24 hours; otherwise 429 backs off for six hours, 403 for 24 hours, and other failures for one hour. Active cooldowns make no source request.
- `retrievedAt` changes only when at least one source succeeds. `lastAttemptAt` and per-source status dates distinguish attempts from successful data refreshes.

The existing scheduled company-import runner can call `refreshAmericasCompanies(previous)` and import its record/status result. Worker deployment and scheduled-run confirmation are the parent task's integration work; a successful local seed alone does not prove unattended operation.

Source import policy entries are exported as `SOURCE_POLICIES` from `worker/companies-americas.mjs`:

| Source ID | Allowed source URL host | Country | Role | Record prefix |
| --- | --- | --- | --- | --- |
| `usda-ams-dairy-approved` | `apps.ams.usda.gov` | United States | supplier-discovery | `usda-ams-dairy-` |
| `ca-ontario-meat-plants` | `data.ontario.ca` | Canada | supplier-discovery | `ca-ontario-meat-` |

## Investigated sources not connected

**CFIA federal meat register**: [official search](https://active.inspection.gc.ca/scripts/meavia/reglist/reglist.asp?lang=e), [full HTML list](https://active.inspection.gc.ca/scripts/meavia/reglist/regresults.asp). The source intentionally supports an empty search for the complete public register and returned 891 rows. Some are marked temporarily inactive. The complete downloadable file is a legacy binary XLS, while the HTML table is directly machine-readable. However, CFIA's [Crown copyright conditions](https://inspection.canada.ca/en/about-cfia/applying-crown-copyright) require clearance for commercial distribution or adaptation. It is **not** labelled as OGL or automatically redistributed in this MVP. Unchanged personal/noncommercial reproduction has separate conditions. A future clearance or actual open-licensed release would support federal Canadian coverage without assuming provincial plants are exporters. An exploratory raw download was removed; no contact-containing raw CFIA file is retained.

**USDA FSIS MPI directory/API**: [directory](https://www.fsis.usda.gov/inspection/establishments/meat-poultry-and-egg-product-inspection-directory), [official developer page](https://www.fsis.usda.gov/science-data/developer-resources/mpi-api), [Data.gov dataset](https://catalog.data.gov/dataset/fsis-mpi-meat-poultry-and-egg-inspection-directory-by-establishment-name). The federal catalogue describes public CC0 data. The FSIS host returned HTTP 403 in the task environment. No paid mirror, proxy, archived copy or browser-header impersonation was used. Its accessibility and exact API contract need a permitted working response before it is counted as connected.

**FDA Interstate Milk Shippers list**: [official explanation](https://www.fda.gov/food/federal-state-local-tribal-and-territorial-cooperative-human-food-programs/interstate-milk-shippers-list), [public HTML branch](https://www.hfpappexternal.fda.gov/scripts/ims/mkex/ims/imssl-br1.cfm). Public HTML works, but a branch's default response contains only its first state, while other states use separate links. This is a credible next US expansion; schedule a bounded state rotation rather than claiming one branch response covers the whole country. Facilities, rating agencies, laboratories and packaging manufacturers must be separated before treating it as food supplier discovery.

## Verification

`node scripts/seed-companies-americas.mjs` fetched both official live sources successfully and wrote `data/companies-americas.json` with 646 records and two connected statuses. `node scripts/test-companies-americas.mjs` validates the actual snapshot and deterministic fixture cases: source IDs/hosts, state/country scope, original plant IDs, dairy Section I/II merging, Ontario product flags, absence of address/contact fields, changed-licence rejection, retained data on errors, cooldowns and the three-request/shared-deadline bound.
