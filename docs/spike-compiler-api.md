# Spike: the TypeSpec compiler API as the engine of `bind check`

**Date:** 2026-11-07 · **Compiler:** `@typespec/compiler` 1.17.0 (pinned exact) · **Verdict: GO**

The question (KICKOFF item 2): can we programmatically compile a generated em contract plus a
hand-authored binding file and walk the resolved program well enough to see **which contract
declarations the binding references and augments**? That attribution is the semantic core of
the future `bind check`.

The spike is kept alive as [`test/spike.compiler-api.test.ts`](../test/spike.compiler-api.test.ts),
compiled against [`fixtures/spike/`](../fixtures/spike/) (a generated `pricing.tsp` contract +
a binding file using built-in `@@doc`/`@@format` augments and a generic `Envelope<T>` wrapper).
A second compile-level check lives in `test/augment.test.ts`: the `--active` output of
`em-contract augment` compiles cleanly alongside the contract and `typespec-asyncapi` 0.2.0,
and the `@correlationId`/`@header` augments land on the contract's properties.

## What works (proven by the test)

1. **Programmatic compile** — `compile(NodeHost, entryFile)` resolves a multi-file project
   (contract + binding + a library import) with zero ceremony; `program.diagnostics` carries
   errors. No emitter needed: the checker's resolved type graph is available directly.
2. **Enumerating contract declarations** — `program.getGlobalNamespaceType()` →
   `namespaces.get("Pricing")` → `.models` / `.interfaces` / `.operations` maps. Each type's
   `node` gives its source file via `getSourceLocation(...)`, so "declared in the contract
   file" is a reliable predicate.
3. **Attributing augments** — an `@@decorator(Target.path, ...)` application appears in the
   *target's* `decorators` array, and the application's `node` points at the **binding** file.
   So "binding B augments contract declaration D with decorator X" is a direct query —
   exactly what `bind check` needs for rules like "every `@@` in the binding targets a
   declaration that still exists in the contract" (a retired target is already a compile
   *error*, which is even stronger).
4. **References survive template instantiation** — a binding op returning
   `Envelope<Pricing.SellingPrices>` resolves so that the instantiated model's `data`
   property's type **is** the contract's `SellingPrices` model, attributable to the contract
   file. Envelope-wrapping (em#447's convention) is therefore checkable, not opaque.

## Gotchas recorded

- **Implicit doc decorators**: the contract's own `/** ... */` comments surface as a
  `docFromCommentDecorator` application with `definition: undefined` and **no node**. Filter
  explicit applications with `d.definition != null` before attributing, or
  `getSourceLocation` sees garbage.
- **`source` in `em export` is `{ path, sha256 }`**, and `path` can be absolute — never copy
  it into deterministic output (we emit the basename only).
- **Pre-1.0 churn risk** (named in the kickoff): the APIs used here (`compile`, `NodeHost`,
  `getGlobalNamespaceType`, `getSourceLocation`, `decorators`, `templateMapper`-resolved
  properties) are the same stable core the official emitters sit on — the churn risk
  concentrates in emitter-framework APIs, which this tool does not use. Pinning exact
  (1.17.0) plus the living spike test means a bump that breaks us fails loudly in CI.

## What this unlocked (built 2026-11-07, after em 1.22 Wave 1 merged)

Both commands now exist on exactly the groundwork above — `src/bindCheck.ts` and
`src/bindInit.ts`, tested in `test/bind.test.ts`:

- **`bind check`**: (a) every explicit decorator application in the binding resolves onto a
  contract declaration — reported as the augment inventory; (b) binding-file models that
  structurally shadow contract models raise `shadow-model` (exact field-set match,
  deliberately conservative until the em#443 reporter's drift-check sample calibrates it);
  (c) compile errors are the first-class drift signal (`compile-error` findings).
- **`bind init`**: compiles the contract via `src/contractInfo.ts` and scaffolds
  `binding.tsp` + `tspconfig.yaml` from its real declarations.
