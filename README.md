# Export Edge Market Intelligence

GitHub source: https://github.com/surhaykilic-cmd/export-edge-market-intelligence.

This repository contains the **market intelligence application**: trade data, prices, production, news, and buyer/supplier discovery. The separate **Academy marketing website and waitlist** lives at https://exportedge.academy/ and has its own source repository.

Shareable research platform inspired by the functions of Tridge's market-curations reference. It combines official trade observations, annual national producer prices, weekly/monthly market benchmarks, USDA production estimates, official news links and evidence-linked company discovery. Tridge's proprietary database and reports have not been copied. Broader commodity coverage remains a later phase.

Site: https://intel.exportedge.academy

The original platform address remains available for scheduled data updates and existing links.

The app uses the Academy's original logo, favicon and local Export Edge Round wordmark font, copied unchanged from its published website source (version 10, commit `83ed8136fa3c51b7f68889b260feb0b6aba8efa4`). The shared visual identity uses navy, blue and cyan; the app is explicitly labelled **Market Intelligence**. Its hosting project `appgprj_6ae3240b27bc8191a0dca39f64db666e` and R2 data remain separate from the Academy website project `appgprj_6abc20aac2e08191b402f615ef397e6b` and its D1 waitlist. Repository backups contain source and public seed data, never the live waitlist submissions.

## Version 3 additions and verified operation

- 438 price series: 32 World Bank monthly benchmarks, 373 FAOSTAT annual national producer-price series (1,688 observations), 25 weekly EU cereal/dairy series and 8 selected monthly FPMA series from USDA/FAO-labelled origins.
- 31 official FAO/FEWS NET news-feed headlines and links. Publisher feed dates may indicate updates or republication; full article bodies are not copied.
- A bounded sample of 1,000 FSA-approved England/Wales establishments plus UK food-procurement buyers and named award suppliers. Live count was 1,004 on verification, including three buyer organizations. Establishment approval and historical notices do not establish commercial availability or a verified trading relationship. No personal contacts or addresses were imported.
- 25 source families in the registry. Runtime source statuses distinguish actual connections from candidates and licensing/access dependencies.

FAOSTAT and the additional EU/FPMA prices now use an authenticated scheduled-runner import path. The website host cannot retrieve the FAOSTAT public files directly (HTTP 403), while the task runner can access the original public files. The runner sends the official catalog and original producer-price ZIP to private validating import endpoints, then refreshes EU/FPMA prices through the site's own fixed-source connector. There is no external proxy, paid account or third-party credential. The end-to-end import and a subsequent hosted refresh completed with zero source errors on 29 October 2026. See `research/verification-v3.json`.

The existing 06:30 Europe/London schedule remains enabled. It reads the current `/api/update-instructions`: obtain supported private-site service access; execute the standalone helper at `/api/faostat-relay-script` (also `scripts/relay-faostat.mjs`); then call the hosted refresh tool and read status back. The helper loads only this site's own `/api/market-feeds-module`, and private tokens are sent only to this site on hidden input. Credentials must never be saved in source, files, command arguments or logs. Imports older than 48 hours are reported as stale rather than silently marked successful. The first scheduled occurrence is 30 October 2026; manual end-to-end operation is verified, not that future occurrence.

Additional checks: `node scripts/test-faostat.mjs --original`, `node scripts/test-faostat-import.mjs`, `node scripts/test-market-feeds.mjs`, `node scripts/test-market-price-import.mjs`, `node scripts/test-companies.mjs`, and `node scripts/test-runner-freshness.mjs`.

## International discovery expansion (revision 4)

Added 1,083 records outside the existing UK collection: 401 Ontario meat establishments, 245 US USDA AMS dairy plants, 237 Indian EIC dairy/seafood approvals, 48 Irish HSE manufacturers/wholesalers, and 152 TED food-procurement buyers across 22 reported countries. This is 25 international countries, or 26 including the UK. These are establishment/notice records, not a verified trading network. Canada coverage is Ontario only and provincial licensing does not establish export permission. TED is public procurement evidence, not a commercial-importer directory or current buying intent.

Four new source connectors refresh through the existing private scheduled helper. India's certificate chain is rejected by portable Node transport; its certificate-validating Windows import is labelled snapshot-only, with per-record approval expiry filtering and source warnings. No TLS validation was disabled. Failed/partial sources retain earlier evidence; a successful complete register snapshot replaces its prior listings. The international collection is stored separately from the UK connector so routine UK updates cannot discard it.

The company view adds country, source, evidence, product/activity and role filters, actual coverage counts, evidence dates and richer CSV exports. Private import validation restricts source hosts, IDs, countries and roles, rejects contact/address fields and expired/inactive approvals, and uses conditional storage writes. No paid sources, sign-ups or outreach are required. See research/companies-*.md and research/verification-v4.json.

## Implemented coverage

The version-2 bootstrap contains the following. Counts describe the imported release; live counts and freshness come from `/api/status` and can change after updates.

| Dataset | Imported scope | Meaning |
|---|---|---|
| UN Comtrade | 40 HS four-digit product headings, 30 catalog countries; 4,418 observations across 1,121 country–product markets with data in 28 countries, reference years 2024–2025 | Annual imports/exports with World as partner. Viet Nam and UAE have no observations in this imported slice; their catalog entries are not proof of available data. |
| World Bank Pink Sheet | 32 agricultural benchmark series | Monthly reference prices with source units and product specifications. These are not supplier offers or shipment prices. |
| USDA PSD | 5,146 production observations for 19 products, 165 country/territory labels plus European Union and Other aggregates | Marketing years 2023–2026 in original units. Includes USDA estimates and forecasts; retain release vintage and aggregate flags. |
| FAOSTAT | 69 dataset metadata entries | Catalog descriptions, release dates and official download links. FAOSTAT production observations have **not** been imported. |
| FAO GIEWS FPMA | 90 international price-series metadata entries | Series, underlying source, units and coverage dates. FPMA price observations have **not** been imported. |
| Source registry | 17 source families | Distinguishes connected data, metadata-only connections, tested endpoints, access requirements and candidates. It is not an exhaustive list of Tridge suppliers. |

The interface provides product/country/year filters, imports and exports, trade comparisons, source-linked briefs, benchmark and supply views, CSV export, source status and a browser-local watchlist. Product headings may include several commercial products; read the full definition before comparing markets.

## Public research, owner-only maintenance

Anyone with the shared Site URL can read the research pages and public data endpoints. Every data import, refresh, schedule change and mutating MCP call requires verified owner access. The four maintenance module/state downloads are protected too. No visitor sign-in, personal-data storage or account creation is added. Watchlists remain local to each visitor's browser.

The runtime secrets UPDATE_OWNER_EMAIL and UPDATE_SERVICE_TOKEN_SHA256 contain the owner policy and SHA256 verifier of the existing Site service bearer. No bearer is committed or sent to upstream data publishers. The scheduled task obtains the existing credential with Sites get_site and follows /api/update-instructions; do not generate or rotate service tokens routinely. If the credential is explicitly rotated, update the verifier using the helper's hidden-stdin digestOnly mode and the Sites runtime-environment tool, then deploy to apply it. Missing configuration fails closed for maintenance. GitHub repositories and the Academy website are independent of this sharing policy.

## Hosted data and updates

The site is a Cloudflare Worker with persistent R2 storage bound as `BUCKET`. `.openai/hosting.json` retains the existing Site identity, R2 binding and MCP capability. The Worker embeds a verified bootstrap; later successful imports persist in R2 without republishing the application.

`POST /api/refresh` supports bounded official-source refreshes. The intended daily run uses `{ "scope": "all", "batchSize": 6 }`: six country/year trade queries rotate through 30 countries and two reference years, giving a full trade cycle of approximately ten daily runs. Prices, production and catalogs are checked in each all-source run. A daily check is not a promise that the source publishes daily or that every observation is recent.

The intended schedule is **06:30 Europe/London daily**. Treat it as active only after the Sites scheduling API has returned a saved, enabled schedule and the site's persisted schedule state confirms it. Source readiness, a successful manual refresh and schedule creation are distinct verification steps. Check `/api/status` for the recorded schedule state, last successful source runs, errors and coverage. Do not infer unattended execution merely from a saved schedule.

Research views support public sharing. Update writers and maintenance downloads require the verified Site owner identity or the existing Site service credential checked against a server-only SHA256 verifier. Fresh hosted service access or the supported Site MCP connection allows a cloud task to update while the browser is closed. `/api/update-instructions` supplies the current revision's update instructions. `scripts/site-request.mjs` accepts the existing service credential only through hidden stdin and sends it only to this Site, in both the platform OAI-Sites-Authorization header and X-Export-Edge-Update-Token maintenance header. Never put credentials in files, source control, shell arguments, logs or the schedule prompt.

The refresh pipeline checks source dimensions, rejects duplicate and potentially truncated trade responses, replaces matching observations when revisions arrive, and preserves previous good values on source failure or empty responses. Explicit source zeros remain zeros; missing observations are not converted to zero. USDA's 202 MB uncompressed CSV is parsed as a stream rather than materialized in Worker memory.

## Local build and verification

Use a current Node.js runtime with native Web APIs, including `DecompressionStream`. This project has no application dependency installation or framework build step.

```text
node --check dist/app.js
node scripts/validate-trade.mjs
node scripts/test-worker.mjs
node scripts/validate-supply.mjs
node scripts/build-worker.mjs
node scripts/preview-worker.mjs
```

The preview serves `http://127.0.0.1:4173`. It exercises the Worker and a local storage substitute; it does not prove hosted R2 or cloud-schedule operation. The supply validation uses the downloaded official USDA archive to reconcile the extract and its fingerprint; use a configured Python runtime where the validator requires one.

For controlled bootstrap updates:

```text
node scripts/fetch-trade.mjs --refresh --limit=6
node scripts/seed-sources.mjs
```

Trade imports retain checkpoints and respect provider throttling. The source-seeding script requires the official World Bank workbook at `research/worldbank-monthly.xlsx`, refreshes the FAO catalogs, and writes the corresponding bootstrap files under `data/`. The original USDA supply extract can be reproduced with `research/extract-usda-production.py` from the official archive at `research/usda-psd.zip`; its output must be reconciled before replacing `data/supply.json`. Downloaded research ZIP/XLSX files are excluded from source control.

Build output is `dist/server/index.js`. For publication, use the Sites source workflow to push and package that exact checked revision, then deploy its saved version while preserving the site's sharing settings. Do not replace the hosting manifest with the old static-only configuration.

## Data interpretation and source access

Trade values are current US dollars, not quantities, current offer prices or proof of a profitable opportunity. Country aggregates do not identify individual buyers, suppliers or shipments. USDA quantities use marketing years and different native units, including 1,000 metric tonnes, carcass-weight equivalents and 1,000 60 kg bags; do not sum or compare unlike measures. Source release dates, retrieval times, observation periods, classifications and flags remain separate.

FAO catalogs and FPMA series metadata are useful discovery layers, but they do not establish that the underlying observations are connected. Several registry sources require API keys, dataset-specific terms or licensed access. No paid data plan has been purchased. Bundled data snapshots are subject to the terms of their respective sources.

Tridge publicly names UN Comtrade, national customs databases and FAO, while describing a larger wholesale/farmgate network without disclosing its complete supplier inventory. Its public pages prohibit unauthorized bulk extraction. Comparable functions can be built from permitted evidence, but this implementation does not claim to contain every Tridge source, its company-resolution work or its proprietary product ontology.

See `research/source-audit.md`, `research/sources.json` and `research/tridge-comparison.json` for source evidence, capability comparison and remaining gaps. Licensed company/shipment coverage, full FPMA and FAOSTAT observation imports, tariffs, crop calendars, weather integration and broader commodities remain separate work.

## Historical version-2 hosted check (FAOSTAT issue subsequently repaired above)

The private hosted writer refreshed and persisted UN Comtrade, World Bank, USDA PSD and FPMA metadata, then separate requests read the saved values back. FAOSTAT's catalog returned HTTP 403 from the hosted network; its last verified 69-dataset catalog remains available and the source status records the failure. No attempt was made to bypass that restriction.

The linked schedule `Automation_e62fb6f2aa9c8191b8cc4ce5afaa2411` is enabled daily at 06:30 Europe/London, starting 30 October 2026. Native schedule readback and the site's persisted status both confirm enabled state. The first scheduled occurrence has not run yet. Routine unchanged outcomes remain quiet; only new material failures, recovery or required action should notify the user. `research/verification.json` records the checks and remaining limitations.
