# Fixtures

Committed `em export` / `em api generate` output — tests must not depend on having em
installed. Exports: schemaVersion 1.20 (em 1.21.0). Contracts: regenerated 2026-11-07 from
em main post-#444 (formatted scalars — `@format("uuid") scalar Uuid`); regenerate again when
#445/#446 merge. From the em repo root:

```bash
npx tsx src/cli.ts export ../em-contract/fixtures/pricing.em -o ../em-contract/fixtures/pricing-export.json
npx tsx src/cli.ts api generate ../em-contract/fixtures/pricing.em -o ../em-contract/fixtures/contracts/pricing.tsp
npx tsx src/cli.ts export examples/order-fulfillment/order-fulfillment.em -o ../em-contract/fixtures/order-fulfillment-export.json
cp examples/order-fulfillment/contracts/order-fulfillment.tsp ../em-contract/fixtures/contracts/
```

- `pricing.em` — purpose-built model: identity/composite/external DCB tags, `assigned`
  fields, a reachable declared type (`Money`), a public command with an invariant, and a
  tagged-but-internal event (augment's warning path).
- `order-fulfillment-export.json` / `contracts/order-fulfillment.tsp` — em's real example
  (assigned fields, no tags).
- `pricing-surface.json` — `em api surface --json` output (apiSurfaceSchemaVersion 1.0),
  generated with the vendored em-main tarball:
  `node node_modules/@milehimikey/em/dist/cli.js api surface fixtures/pricing.em --json > fixtures/pricing-surface.json`
- `spike/` — hand-authored binding + entry point for the compiler-API spike
  (see `docs/spike-compiler-api.md`).
- `bindings/` — bind-check cases: `good.tsp` (honest), `shadow.tsp` (re-declared contract
  shape → warning), `broken.tsp` (augment target the contract no longer has → error).

When the remaining Wave 1 emitters (#445/#446) change the contract shape, regenerate
everything here plus `test/golden/` in one pass. (#444's regen landed 2026-11-07 with no
golden changes — augment targets don't carry field types.)
