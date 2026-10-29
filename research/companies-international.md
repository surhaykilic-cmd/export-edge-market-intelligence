# Official international establishment discovery

Verified 29 October 2026. The normalized bootstrap contains **285 plant-level discovery records across India and Ireland**, not 285 verified commercial suppliers. Only factual establishment identities, official approval identifiers, product/activity scope, source links and dates are retained. No source address, telephone, email or named contact column is imported. No paid service, account, authentication bypass or outreach is used.

| Source ID | Official evidence | Bootstrap | Refresh state |
| --- | --- | ---: | --- |
| `in-eic-approved` | India Export Inspection Council dairy and seafood approval tables | 237 records | Verified snapshot; portable refresh warning |
| `ie-fsai-approved` | Food Safety Authority of Ireland, HSE-approved food establishments | 48 records | Public no-key connection tested in Node |

## India EIC

- [Official dairy table](https://archive.eicindia.gov.in/WebApp1/pages/menuInfo/approvedCommoditiesList.xhtml?CT=MP)
- [Official fish and fishery products table](https://archive.eicindia.gov.in/WebApp1/pages/menuInfo/approvedCommoditiesList.xhtml?CT=FFP)
- The normal public JSF pagination action was tested without a login: obtain its public session and ViewState, then request two 60-row pages per commodity. At retrieval, the tables reported 127 dairy and 331 seafood rows. The bounded sample retained 120 dairy and 117 seafood approvals; this is not a complete directory.
- Country is **India**, independently of countries named in the approval scope. The exact scope remains in `activities` and `evidence`; destination approval is not turned into another country's supplier record.
- The source's `dd/mm/yyyy` expiry becomes ISO `approvalExpiresAt`. Entries before the current UTC day, invalid nonempty dates, explicit suspended/withdrawn/inactive/revoked/cancelled entries, and scopes unfit for human consumption are excluded. The same expiry/status check applies to earlier evidence retained during an outage. No raw status column exists here, so `approvalStatus` is null. No source publication date is asserted; `retrievedAt` is the actual fetch time.
- **Portable connection limitation:** default Node 24 fetch fails `SELF_SIGNED_CERT_IN_CHAIN` (`self-signed certificate in certificate chain`), including with `--use-system-ca`. Current official host variants `eicindia.gov.in` and `www.eicindia.gov.in` return 404 for this register path. No certificate validation was disabled.
- Windows' native, certificate-validating HTTP client succeeded. The seed script supports this public transport through a fixed PowerShell script, with request JSON over stdin, exact HTTPS host/path/query allowlists, public-session cookies only, hidden child windows and normal certificate checking. Its output explicitly marks India `status: snapshot`, `refreshMode: snapshot-only`, and supplies a refresh warning. It does **not** claim a healthy hosted automatic connection. The pure Web API Worker path attempts normal fetch and retains earlier unexpired records if the source fails.

## Ireland FSAI / HSE

- [Official approved food-establishment register](https://oapi.fsai.ie/HSEApprovedEstablishments.aspx)
- The source reports **Last refreshed on 29/10/2026**, preserved as `sourcePublishedAt: 2026-10-29`.
- Only establishments whose listed primary type is Manufacturer, Wholesale or Wholesaling are included; hospital, health, nursing, residential and prison kitchens are excluded. Activities and species are read using HTML rowspans, so multiple approved activities/species are merged under the actual approval number rather than misattributed to another company.
- Approval number, public trading name, county, listed activity and species are retained. The address column is dropped. Beef/pork/poultry/dairy etc. labels derive solely from the listed activity/species. An approval is not evidence of exporting or present willingness to supply.
- This list provides no approval expiry or raw active/inactive status, so `approvalExpiresAt` and `approvalStatus` remain null. No current-validity claim is inferred from the missing expiry. The source snapshot date is always shown in evidence.

## Runtime boundaries and verification

`worker/companies-international.mjs` exports `SOURCE_POLICIES` and `refreshInternationalCompanies(previous, options)`. It uses Web APIs only. A refresh is capped at seven public HTTP requests (three initial reads, plus two pagination POSTs per India commodity), a 25-second overall request deadline, and three megabytes per response. It independently retains each failed source/category's prior eligible evidence. Source changes fail closed; the Ireland parser requires known headings and a snapshot date. The EIC parser requires its known table or partial-response layout.

`scripts/seed-companies-international.mjs` creates the normalized data. On Windows it can obtain a new India snapshot using the native client; `--web-fetch-only` tests the portable path. Other platforms use the normal portable path. India remains explicitly snapshot-only until that path is verified successfully in the hosted environment.

`scripts/test-companies-international.mjs` covers approval expiry/status filtering, exact scope and country assignment, invalid-date rejection, exclusion of addresses and emails, HTML rowspan merging, species mapping (including the Bovine/Ovine distinction), snapshot dates, bounded pagination with its public session and retained evidence during source outages. The actual normalized bootstrap was also checked for contact fields/email strings; none were found. The earliest retained India expiry is 2 November 2026.

## Other researched official sources

- Australia DAFF publishes dairy export-registered [processing and storage establishment lists](https://www.agriculture.gov.au/export/controlled-goods/dairy/registered-establishment/registered-establishments) as DOCX. Direct official downloads timed out during this run, so no Australian rows or connected status were invented.
- New Zealand MPI's public registers returned an anti-bot challenge or 403 from available clients. No challenge bypass was attempted, and no New Zealand rows were created from country-approval lists.
- India APEDA's public exporter directory is interactive and did not expose a tested data response during this run. It is research-only, not counted as connected.

The factual public-register data is linked to the official authority. No open data licence is asserted for these sources; source terms apply.
