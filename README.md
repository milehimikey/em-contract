# em-contract

TypeSpec intelligence for [em](https://github.com/milehimikey/em)-generated contracts: bind a
model-owned contract to real HTTP/async specs **without forking or copying it**.

## The mission boundary

em ships **interface-as-data**: `em api generate` writes a deterministic, dependency-free
TypeSpec contract from a model's `public` surface, and `em export` ships the versioned JSON
behind it. em never compiles TypeSpec and takes no emitter config (owner ruling, 2026-11-07 —
a config that changes emission would break `em api check`'s contract-currency guarantee).

**em-contract owns the TypeSpec side of the line.** It may depend on `@typespec/compiler`
(pinned exact — pre-1.0 churn in emitter-adjacent APIs is a known risk), and it helps teams:

- **generate augment files** from model metadata (`em-contract augment`, shipped) —
  DCB tags and `assigned` fields become `@@correlationId`/`@@header` candidates against the
  generated contract, per the binding-file convention (em#447);
- **scaffold binding files** (`bind init`, planned) and **verify bindings stay honest**
  against the contract (`bind check`, planned) — both wait on em 1.22 Wave 1's contract shape
  (command payload models em#445, `interface Events` ops em#446); the compiler groundwork is
  proven in [docs/spike-compiler-api.md](docs/spike-compiler-api.md).

Shapes stay model-owned (generated, never hand-edited); protocols, routes, envelopes and
formats stay binding-owned (hand-authored, augmenting the contract). This tool lives in the
seam.

## `em-contract augment`

```bash
em export models/pricing/pricing.em -o pricing-export.json
em-contract augment pricing-export.json                      # commented candidates -> stdout
em-contract augment pricing-export.json --active \
  --contract ./contracts/pricing.tsp -o binding/augments.tsp # live decorators + imports
```

From the export document's public events it emits, deterministically:

- each **identity DCB tag** field → a `@@header(...)` candidate; the event's first identity
  tag also → `@@correlationId(...)` (the `typespec-asyncapi` idiom is `@header @correlationId`
  on the correlation field);
- **composite / external tags** → comment notes (computed keys have no augment target);
- **`assigned` fields** → comment notes (system-assigned, not supplied by the triggering
  command);
- events that carry tags but are **not `public`** → a stderr warning (they are not in the
  contract, so nothing is emitted for them).

Candidates are commented-out by default — review, then activate (or re-run with `--active`).
Activated output compiles against the generated contract with
[`typespec-asyncapi`](https://www.npmjs.com/package/typespec-asyncapi) (that exact compile is
a test in this repo).

House rules match em: deterministic outputs, clean stdout (the artifact), diagnostics to
stderr, version read from package.json at runtime, no LLM/AI calls anywhere.

## Development

```bash
npm install
npm test          # vitest: golden files + the living compiler-API spike
npm run build     # tsc -> dist/
npm run typecheck
```

Fixtures under `fixtures/` are committed `em export` output (em 1.21.0, export schema 1.20);
each carries its regeneration command. `fixtures/contracts/*.tsp` are real `em api generate`
output. When em 1.22 regenerates contract shapes (#444/#445/#446), regenerate fixtures and
goldens together.

## License

MIT
