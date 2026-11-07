# BOOTSTRAP-REPORT — em-contract v0

2026-11-07, bootstrapped per KICKOFF.md from the em 1.22 planning session. KICKOFF.md is
absorbed into README.md + docs/ and deleted.

## State

- **Repo builds, tests green**: 14 vitest tests (2 files), `tsc` build + typecheck clean.
  TypeScript ESM, Node ≥18, commander CLI (`em-contract`), MIT + SPDX headers, version read
  from package.json at runtime. `@typespec/compiler` pinned exact at **1.17.0** (current
  latest); `typespec-asyncapi` **0.2.0** exact as a devDependency (compile tests only — not a
  runtime dependency).
- **Compiler-API spike: GO** — [docs/spike-compiler-api.md](docs/spike-compiler-api.md),
  kept alive as `test/spike.compiler-api.test.ts`. Compiling contract + binding and
  attributing binding augments/references to contract declarations all works on stable core
  APIs; the pre-1.0 churn risk concentrates in emitter-framework APIs this tool doesn't use.
- **`em-contract augment` v0 shipped** — consumes `em export` JSON (schema 1.x guard),
  emits deterministic augment candidates (`@@correlationId`/`@@header` from identity DCB
  tags, notes for composite/external tags and `assigned` fields), commented by default,
  `--active` + `--contract <path>` for live output. Golden-file tests over three fixtures,
  including em's own `examples/order-fulfillment`; the `--active` output is compiled in a
  test against the real contract + typespec-asyncapi and the decorators verified on the
  resolved program.

## Decisions taken (not in KICKOFF, flagging for review)

1. **Package name `em-contract`, unscoped** — matches sibling `em-sdd-bridge` (unscoped),
   not em itself (`@milehimikey/em`). Trivial to flip before any publish.
2. **Correlation rule**: every identity-tag field → `@@header` candidate; the event's
   *first* identity tag also → `@@correlationId` (AsyncAPI allows one correlationId per
   message; typespec-asyncapi's idiom is `@header @correlationId` on the same field).
   Multi-identity-tag events (fixture `pricing.em` has one) make the rest headers only.
3. **Composite/external tags emit as comments, not decorators** — they are computed keys
   with no declared field to target. The comment carries the key, source fields/description.
4. **Augment header carries no version** and only the export source's *basename* (em
   export's `source.path` can be absolute; output must stay machine-independent). Same
   posture as em's contract header.
5. **Naming replication**: `src/exportDoc.ts` mirrors em's `publicSurfaceOf` +
   `buildApiContract` naming sequence (pascalCase → shared dedupe set: reachable types,
   then events, then views) so augment targets resolve against the committed contract.
   Tests pin this against both committed contracts. This is the acknowledged drift risk
   that **em#448 (`em api surface --json`) retires** — the module header marks the seam.
6. **Fixtures are committed em output** (em 1.21.0, export schema 1.20), each with its
   regeneration command; `fixtures/pricing.em` is a purpose-built model exercising
   identity/composite/external tags, `assigned`, a reachable declared type, and a
   tagged-but-internal event (the warning path).

## Deferred, with seams marked

- **`bind init` / `bind check`** — wait on em 1.22 Wave 1 (#445 payload models, #446
  `interface Events`) and the drift-check sample requested from the em#443 reporter.
  Seams: `src/exportDoc.ts` header (surface consumption), spike doc §"What this unlocks"
  (check rules sketch: augment-target resolution, shape-shadowing detection, compile errors
  as first-class drift signal).
- **em#448 adoption** — switch `augment` input from full export to `em api surface --json`
  when it ships.

## Open questions for the owner

1. ~~**GitHub remote**~~ — resolved 2026-11-07: owner approved; public repo
   https://github.com/milehimikey/em-contract created and `main` pushed.
2. **Publish intent** — package.json is publish-shaped (files/bin/prepublishOnly) and now
   carries `repository`/`homepage`/`bugs`. npm scope still open: keep `em-contract`
   unscoped like em-sdd-bridge, or `@milehimikey/em-contract`?
3. **Correlation rule above** (decision 2) — right default for the day-job prototype
   workflow behind em#443, or should `--active` take a per-event choice flag before anyone
   depends on it?
4. **`assigned` on commands/views** is currently ignored (notes emitted for events only) —
   events are the async-binding surface; widen if the REST side wants it.
5. When **em 1.22 Wave 1** lands, fixtures/goldens here need one regeneration pass (new
   contract shape); the naming-replication tests will catch any emitter naming change.
