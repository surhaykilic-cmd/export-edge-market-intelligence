# International buyer discovery through TED

Verified 29 October 2026 using the official European Union Publications Office Search API. No signup, API key, fee or publication action is involved.

- Official access documentation: https://docs.ted.europa.eu/api/latest/search.html
- Search/reuse limits: https://docs.ted.europa.eu/ODS/latest/reuse/search-api.html
- API endpoint: `POST https://api.ted.europa.eu/v3/notices/search`.
- The official documentation explicitly describes anonymous published-notice access and reuse, including commercial data users. Source notices remain linked; notice text is not treated as verified company or trade intelligence.

## Imported release

Two bounded official queries returned 200 published food/catering notices. The resulting sample contains **152 buyer-name/country identities across 22 explicitly reported buyer countries**: Belgium, Bulgaria, Croatia, Czechia, Estonia, Finland, France, Germany, Hungary, Ireland, Italy, Latvia, Moldova, Netherlands, Norway, Poland, Portugal, Romania, Slovakia, Slovenia, Spain and Sweden. These are buyer-discovery records, predominantly public procurers, not a commercial importer directory or evidence of current buying intent.

Queries cover the hierarchical food CPV15 category, excluding tobacco-only notices, plus CPV032 (crop/produce),0331 (fish/aquaculture) and555 (catering). Every record also retains specific source CPV codes and the original notice title. Broad CPV03 alone is deliberately not accepted because it contains forestry and biodiversity purchases. Names/country are only combined when the notice reports one unique buyer country. Multiple buyer countries are omitted rather than guessed. Repeated same-country values are harmless. Organization identifiers are retained only when exactly one name and one identifier are present; ambiguous name/identifier arrays are not paired by position.

Records retain the newest representative notice for each unambiguous official organization identifier and country, falling back to normalized official buyer name and country when the identifier is absent. Exact name/country matches reconcile earlier evidence without an identifier only when the known identifier is unambiguous. Conflicting organization identifiers remain separate. Identity is deterministic, not fuzzy entity resolution, and can leave aliases separate. Each record keeps the original country code, publication-number, published date, raw notice type, CPV codes and official source URL. No notice is relabelled as an active buying opportunity; even competition notices can be outdated or amended. No supplier identity is inferred from a buyer field. Personal contact names, phones, addresses and emails are not imported.

## Routine updates and recovery

`refreshProcurementCompanies` uses two requests of 100 notices each, separated by 800 ms, with a 20 s request deadline and a 15 MiB streamed response-body limit. It retains earlier and successfully retrieved evidence on partial failure. A 429 honors numeric or HTTP-date `Retry-After`, saves a cooldown and does not immediately retry. A whole-source failure preserves the previous collection date and last success timestamp. The connector is bounded to 500 representative identities and derives an 18-month query window at runtime.

`scripts/seed-companies-procurement.mjs --from-verified-sample` reproduces the initial import from retained official JSON responses in `research/ted-food-sample.json` and `research/ted-food-catering-sample.json`. Run `node scripts/test-companies-procurement.mjs` for provenance, country, food-scope, PII exclusion, date, deduplication and failure-retention checks.

World Bank's public procurement search endpoint was also checked and returned data, but it is not connected here: the sampled response did not establish a safe direct buyer-organization/country mapping. No recipient/project country was repurposed as a buyer's country.
