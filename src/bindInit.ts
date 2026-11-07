// SPDX-License-Identifier: MIT
// `em-contract bind init`: scaffold a binding project around a generated contract, per em's
// documented binding-file convention (em docs/contract-bindings.md, GH #447): import the
// generated contract, never edit it; augments, envelopes, routes and channels live here.
//
// The scaffold is derived from the contract's real declarations (compiled, not grepped), so
// every commented example names an op/model that actually exists. Everything protocol-shaped
// starts commented out: `bind init` cannot know routes or channel names — those are the
// binding author's opinions. Deterministic: a pure function of the contract's distilled
// surface and the relative import path.

import { ContractInfo } from "./contractInfo.js";

export interface BindInitOptions {
  /** Relative import path from the binding directory to the contract file. */
  contractImport: string;
}

export interface ScaffoldFile {
  /** Path relative to the output directory. */
  name: string;
  text: string;
}

export function buildBindingScaffold(info: ContractInfo, options: BindInitOptions): ScaffoldFile[] {
  const ns = info.namespace;
  const lines: string[] = [
    "// Binding file for the generated contract — hand-authored, binding-owned.",
    `// Convention: em docs/contract-bindings.md — import ${JSON.stringify(options.contractImport)}, never edit it;`,
    "// shapes stay model-owned, everything with a protocol opinion lives here.",
    "// Scaffolded by em-contract bind init; uncomment and shape the sections you need.",
    "",
    `import ${JSON.stringify(options.contractImport)};`,
    "",
    `using ${ns};`,
  ];

  const firstAugmentTarget = (() => {
    const el = info.commands[0] ?? info.events[0] ?? info.views[0];
    if (!el || el.fields.length === 0) return null;
    return `${ns}.${el.model}.${el.fields[0]}`;
  })();
  lines.push(
    "",
    "// ── Per-field customization (TypeSpec built-ins; no extra imports) ─────────────",
    ...(firstAugmentTarget
      ? [`// @@format(${firstAugmentTarget}, "uuid");`, `// @@visibility(${firstAugmentTarget}, Lifecycle.Create);`]
      : ["// (no payload fields in this contract to augment)"]),
    "",
    "// ── Wrapping (binding-owned generic models) ─────────────────────────────────────",
    "// model Envelope<T> {",
    "//   data: T;",
    "//   requestId: string;",
    "// }",
  );

  if (info.commands.length > 0 || info.views.length > 0) {
    lines.push(
      "",
      "// ── HTTP binding (routes/status codes/errors; uncomment the import too) ────────",
      `// import "@typespec/http";  // move next to the contract import above`,
      "// using TypeSpec.Http;",
      `// @route("/${ns.toLowerCase()}")`,
      `// interface ${ns}Api {`,
    );
    for (const c of info.commands) {
      lines.push(`//   @post op ${c.op}(@body payload: ${ns}.${c.model}): void;`);
    }
    for (const v of info.views) {
      lines.push(`//   @get op ${v.op}(): ${ns}.${v.model};`);
    }
    lines.push("// }");
  }

  if (info.events.length > 0) {
    lines.push(
      "",
      "// ── AsyncAPI binding (channels; uncomment the import too) ───────────────────────",
      `// import "typespec-asyncapi";  // move next to the contract import above`,
      "// using AsyncAPI;",
    );
    for (const e of info.events) {
      lines.push(`// @@channel(${ns}.Events.${e.op}, "<channel.name>");`, `// @@publish(${ns}.Events.${e.op});`);
    }
    lines.push(
      "//",
      "// Correlation/header candidates derive from the model's DCB tags — generate them:",
      "//   em export <model>.em -o export.json && em-contract augment export.json",
    );
  }

  const binding = lines.join("\n") + "\n";

  const tspconfig =
    [
      "# Binding-project emitter config (binding-owned; the generated contract has none).",
      "# Uncomment the emitters this binding compiles to, and `npm install` them.",
      "emit:",
      '#  - "@typespec/openapi3"',
      '#  - "typespec-asyncapi"',
      "options:",
      '#  "@typespec/openapi3":',
      '#    output-file: openapi.yaml',
    ].join("\n") + "\n";

  return [
    { name: "binding.tsp", text: binding },
    { name: "tspconfig.yaml", text: tspconfig },
  ];
}
