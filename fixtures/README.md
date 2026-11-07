# Fixtures

Committed `em export` / `em api generate` output (em 1.21.0, export schemaVersion 1.20) —
tests must not depend on having em installed. Regenerate from the em repo root:

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
- `spike/` — hand-authored binding + entry point for the compiler-API spike
  (see `docs/spike-compiler-api.md`).

When em 1.22 Wave 1 (#444/#445/#446) changes the contract shape, regenerate everything here
plus `test/golden/` in one pass.
