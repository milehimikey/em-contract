// SPDX-License-Identifier: MIT
// `em-contract bind check`: compile a binding file together with the generated contract it
// imports and verify the binding stays honest. The rules the spike proved out
// (docs/spike-compiler-api.md):
//
//  1. compile-error  — any TypeSpec error is a drift finding first-class: a removed contract
//     field breaks the binding's `@@` target path or model reference right here.
//  2. no-contract    — the compilation contains no `em api generate` file: nothing to bind.
//  3. shadow-model   — a binding-declared model re-states a contract model's exact field set;
//     the convention (em docs/contract-bindings.md) is to reference contract models, never
//     copy them, because copies drift silently. Rule calibration pending the em#443
//     reporter's drift-check sample — exact-field-set match is deliberately conservative.
//
// The augment inventory (which binding decorators land on which contract declarations) rides
// along in the result: it is bind check's positive evidence, the "binding X augments contract
// declaration Y" attribution.

import { readFileSync } from "node:fs";
import {
  compile,
  getSourceLocation,
  NodeHost,
  type DecoratorApplication,
  type Model,
  type Namespace,
  type Program,
} from "@typespec/compiler";
import { EM_CONTRACT_HEADER } from "./contractInfo.js";

export interface Finding {
  severity: "error" | "warning";
  code: "compile-error" | "no-contract" | "shadow-model";
  message: string;
  file: string | null;
  line: number | null;
}

export interface AugmentEntry {
  decorator: string;
  target: string;
  file: string;
}

export interface BindCheckResult {
  entry: string;
  contractFiles: string[];
  augments: AugmentEntry[];
  findings: Finding[];
  ok: boolean;
}

function locOf(entity: { node?: unknown }): { file: string; line: number } | null {
  if (!entity.node) return null;
  const loc = getSourceLocation(entity.node as never);
  if (!loc) return null;
  const pos = loc.file.getLineAndCharacterOfPosition(loc.pos);
  return { file: loc.file.path, line: pos.line + 1 };
}

function isContractFile(path: string, cache: Map<string, boolean>): boolean {
  let hit = cache.get(path);
  if (hit === undefined) {
    let text = "";
    try {
      text = readFileSync(path, "utf8");
    } catch {
      /* virtual/unreadable file: not a contract */
    }
    hit = text.startsWith(EM_CONTRACT_HEADER);
    cache.set(path, hit);
  }
  return hit;
}

/** Walk every user namespace (skips the TypeSpec std lib namespace). */
function* userNamespaces(program: Program): Generator<Namespace> {
  const global = program.getGlobalNamespaceType();
  const queue = [...global.namespaces.values()].filter((n) => n.name !== "TypeSpec");
  while (queue.length > 0) {
    const ns = queue.shift()!;
    yield ns;
    queue.push(...ns.namespaces.values());
  }
}

function qualifiedName(ns: Namespace, rest: string): string {
  const parts: string[] = [];
  let cur: Namespace | undefined = ns;
  while (cur && cur.name) {
    parts.unshift(cur.name);
    cur = cur.namespace;
  }
  return [...parts, rest].join(".");
}

export async function runBindCheck(entry: string): Promise<BindCheckResult> {
  const program = await compile(NodeHost, entry);
  const findings: Finding[] = [];
  const contractCache = new Map<string, boolean>();

  for (const d of program.diagnostics) {
    if (d.severity !== "error") continue;
    // d.target is a DiagnosticTarget or the NoTarget symbol.
    const loc = d.target && typeof d.target !== "symbol" ? getSourceLocation(d.target as never) : null;
    const pos = loc ? loc.file.getLineAndCharacterOfPosition(loc.pos) : null;
    findings.push({
      severity: "error",
      code: "compile-error",
      message: d.message,
      file: loc ? loc.file.path : null,
      line: pos ? pos.line + 1 : null,
    });
  }

  // Which files in this compilation are generated em contracts?
  const contractFiles = [...program.sourceFiles.keys()].filter((p) => isContractFile(p, contractCache));
  if (contractFiles.length === 0) {
    findings.push({
      severity: "error",
      code: "no-contract",
      message: `no generated em contract in the compilation — the binding must import the contract file (header "${EM_CONTRACT_HEADER} ...")`,
      file: entry,
      line: null,
    });
  }

  const inContract = (e: { node?: unknown }) => {
    const loc = locOf(e);
    return loc !== null && isContractFile(loc.file, contractCache);
  };

  // Contract declarations by field-set, for the shadow rule; and the augment inventory.
  const contractModels: { name: string; fields: string[] }[] = [];
  const augments: AugmentEntry[] = [];
  const collectAugments = (decorators: readonly DecoratorApplication[], target: string) => {
    for (const d of decorators) {
      if (d.definition == null) continue; // implicit doc-comment decorators
      const loc = locOf(d);
      if (!loc || isContractFile(loc.file, contractCache)) continue; // contract's own decorators
      augments.push({ decorator: d.definition.name, target, file: loc.file });
    }
  };

  for (const ns of userNamespaces(program)) {
    for (const model of ns.models.values()) {
      if (!inContract(model)) continue;
      contractModels.push({ name: qualifiedName(ns, model.name), fields: [...model.properties.keys()] });
      collectAugments(model.decorators, qualifiedName(ns, model.name));
      for (const prop of model.properties.values()) {
        collectAugments(prop.decorators, qualifiedName(ns, `${model.name}.${prop.name}`));
      }
    }
    for (const iface of ns.interfaces.values()) {
      if (!inContract(iface)) continue;
      for (const op of iface.operations.values()) {
        collectAugments(op.decorators, qualifiedName(ns, `${iface.name}.${op.name}`));
      }
    }
  }

  // Shadow rule: a binding model whose field-name set exactly matches a contract model's.
  // Several contract models can share one field set (e.g. a view and the command payload
  // that feeds it) — the finding names every one of them.
  const byFieldSet = new Map<string, string[]>();
  for (const m of contractModels) {
    if (m.fields.length === 0) continue;
    const key = [...m.fields].sort().join(",");
    byFieldSet.set(key, [...(byFieldSet.get(key) ?? []), m.name]);
  }
  for (const ns of userNamespaces(program)) {
    for (const model of ns.models.values()) {
      const loc = locOf(model);
      if (!loc || isContractFile(loc.file, contractCache) || loc.file.includes("node_modules")) continue;
      if (model.properties.size === 0 || (model.node as { templateParameters?: unknown[] })?.templateParameters?.length) continue;
      const shadowed = byFieldSet.get([...model.properties.keys()].sort().join(","));
      if (shadowed) {
        findings.push({
          severity: "warning",
          code: "shadow-model",
          message: `model ${qualifiedName(ns, model.name)} re-declares the exact field set of contract model${shadowed.length > 1 ? "s" : ""} ${shadowed.join(", ")} — reference the contract model instead of copying it (copies drift silently)`,
          file: loc.file,
          line: loc.line,
        });
      }
    }
  }

  const ok = !findings.some((f) => f.severity === "error");
  return { entry, contractFiles, augments, findings, ok };
}
