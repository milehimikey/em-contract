// SPDX-License-Identifier: MIT
// The subset of em's `em export` JSON document (exportSchemaVersion "1.x") that em-contract
// reads, plus the public-surface walk and the emitted-name computation.
//
// SEAM (em#448): `em api surface --json` shipped (src/surfaceDoc.ts consumes it), but its
// schema 1.0 drops the event-level `tags` array — so this export path remains the
// full-fidelity input until the em#448 follow-up lands, and the walk below keeps mirroring
// em's src/emit/api.ts `publicSurfaceOf` and `buildApiContract` naming exactly (verified
// against em main 2026-11-07); any divergence is a bug here, not in em.

import { AugmentSource } from "./augment.js";

export interface FieldExport {
  name: string;
  type: string | null;
  typeRef: { ref: string; name: string; array?: boolean } | null;
  tag: boolean;
  renamedFrom: string[] | null;
  assigned: boolean;
  optional: boolean;
}

export interface TagExport {
  key: string;
  kind: "identity" | "composite" | "external";
  fields: string[] | null;
  description: string | null;
}

export interface ElementExport {
  ref: string;
  kind: string;
  name: string;
  fields: FieldExport[] | null;
  public: boolean;
  tags: TagExport[] | null;
}

export interface TypeExport {
  ref: string;
  name: string;
  fields: FieldExport[] | null;
}

export interface ExportDoc {
  schemaVersion: string;
  generator: { name: string; version: string };
  source: { path: string; sha256: string };
  model: {
    name: string | null;
    key: string;
    types: TypeExport[];
    slices: { key: string; elements: ElementExport[] }[];
  };
}

/** Parse + sanity-check an `em export` document. Throws with a user-facing message. */
export function readExportDoc(text: string, label: string): ExportDoc {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    throw new Error(`${label}: not valid JSON (${(e as Error).message})`);
  }
  const d = doc as Partial<ExportDoc>;
  if (typeof d !== "object" || d === null || typeof d.schemaVersion !== "string") {
    throw new Error(`${label}: not an em export document (missing schemaVersion) — produce it with: em export <model>.em`);
  }
  if (!d.schemaVersion.startsWith("1.")) {
    throw new Error(`${label}: export schemaVersion ${d.schemaVersion} is not 1.x — this em-contract build reads schema 1.x`);
  }
  if (!d.model || !Array.isArray(d.model.slices) || !Array.isArray(d.model.types)) {
    throw new Error(`${label}: export document has no model.slices/model.types`);
  }
  return d as ExportDoc;
}

/** Mirrors em src/emit/api.ts `publicSurfaceOf`: public elements in export (timeline) order;
 *  a repeated view contributes its first public instance only. */
export function publicSurfaceOf(slices: { elements: ElementExport[] }[]): {
  commands: ElementExport[];
  events: ElementExport[];
  views: ElementExport[];
} {
  const commands: ElementExport[] = [];
  const events: ElementExport[] = [];
  const views: ElementExport[] = [];
  const seenViews = new Set<string>();
  for (const slice of slices) {
    for (const el of slice.elements) {
      if (!el.public) continue;
      if (el.kind === "command") commands.push(el);
      else if (el.kind === "event") events.push(el);
      else if (el.kind === "view") {
        const key = el.name.trim().toLowerCase();
        if (seenViews.has(key)) continue;
        seenViews.add(key);
        views.push(el);
      }
    }
  }
  return { commands, events, views };
}

/** Mirrors em src/emit/api.ts `pascalCase`. */
export function pascalCase(name: string): string {
  const words = name.match(/[A-Za-z0-9]+/g) ?? [];
  const joined = words.map((w) => w[0].toUpperCase() + w.slice(1)).join("");
  if (joined.length === 0) return "Unnamed";
  return /^[0-9]/.test(joined) ? `_${joined}` : joined;
}

/** Mirrors em src/util/slug.ts `dedupe`. */
export function dedupe(id: string, used: Set<string>, sep: string): string {
  let candidate = id;
  let n = 2;
  while (used.has(candidate)) candidate = `${id}${sep}${n++}`;
  used.add(candidate);
  return candidate;
}

/** Mirrors em src/emit/api.ts `fieldIdentifier`: non-identifier field names are backtick-quoted. */
export function fieldIdentifier(name: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return name;
  return "`" + name.replace(/\\/g, "\\\\").replace(/`/g, "\\`") + "`";
}

export interface ContractNames {
  /** `namespace <X>` in the generated contract. */
  namespace: string;
  /** event ref -> emitted `model` name. */
  eventModel: Map<string, string>;
  /** view ref -> emitted `model` name. */
  viewModel: Map<string, string>;
  /** declared-type ref -> emitted `model` name (reachable types only). */
  typeModel: Map<string, string>;
  /** command ref -> emitted payload `model` name (em#445, contracts from em ≥ 1.22). */
  commandModel: Map<string, string>;
}

/**
 * Replicates `buildApiContract`'s naming sequence so augment targets resolve against the
 * committed contract: reachable declared types claim names first (in model.types order),
 * then public events, then public views, then command payload models (em#445), all through
 * one shared dedupe set.
 */
export function contractNames(doc: ExportDoc): ContractNames {
  const surface = publicSurfaceOf(doc.model.slices);
  const typesByRef = new Map(doc.model.types.map((t) => [t.ref, t]));

  const reachable = new Set<string>();
  const walk = (fields: FieldExport[] | null) => {
    for (const f of fields ?? []) {
      if (f.typeRef && !reachable.has(f.typeRef.ref)) {
        reachable.add(f.typeRef.ref);
        walk(typesByRef.get(f.typeRef.ref)?.fields ?? null);
      }
    }
  };
  for (const el of [...surface.commands, ...surface.events, ...surface.views]) walk(el.fields);

  const usedNames = new Set<string>();
  const typeModel = new Map<string, string>();
  for (const t of doc.model.types) {
    if (reachable.has(t.ref)) typeModel.set(t.ref, dedupe(pascalCase(t.name), usedNames, "_"));
  }
  const eventModel = new Map<string, string>();
  for (const el of surface.events) eventModel.set(el.ref, dedupe(pascalCase(el.name), usedNames, "_"));
  const viewModel = new Map<string, string>();
  for (const el of surface.views) viewModel.set(el.ref, dedupe(pascalCase(el.name), usedNames, "_"));
  const commandModel = new Map<string, string>();
  for (const el of surface.commands) commandModel.set(el.ref, dedupe(pascalCase(el.name), usedNames, "_"));

  return { namespace: pascalCase(doc.model.name ?? "Model"), eventModel, viewModel, typeModel, commandModel };
}

/** Normalize an export document into augment's input (full tag fidelity). */
export function fromExportDoc(doc: ExportDoc): AugmentSource {
  const surface = publicSurfaceOf(doc.model.slices);
  const typesByRef = new Map(doc.model.types.map((t) => [t.ref, t]));

  const reachable = new Set<string>();
  const walk = (fields: FieldExport[] | null) => {
    for (const f of fields ?? []) {
      if (f.typeRef && !reachable.has(f.typeRef.ref)) {
        reachable.add(f.typeRef.ref);
        walk(typesByRef.get(f.typeRef.ref)?.fields ?? null);
      }
    }
  };
  for (const el of [...surface.commands, ...surface.events, ...surface.views]) walk(el.fields);

  const warnings: string[] = [];
  for (const slice of doc.model.slices) {
    for (const el of slice.elements) {
      if (el.kind === "event" && !el.public && (el.tags ?? []).length > 0) {
        warnings.push(
          `event "${el.name}" carries DCB tags but is not public — it is not in the contract, no augment emitted (mark it \`public\` in the model to bind it)`,
        );
      }
    }
  }

  return {
    sourceName: doc.source.path.split("/").pop() ?? doc.source.path,
    schemaLabel: `em export schema ${doc.schemaVersion}`,
    namespace: pascalCase(doc.model.name ?? "Model"),
    typeNames: doc.model.types.filter((t) => reachable.has(t.ref)).map((t) => t.name),
    events: surface.events.map((el) => ({
      name: el.name,
      tags: el.tags ?? [],
      assignedFields: (el.fields ?? []).filter((f) => f.assigned).map((f) => f.name),
    })),
    warnings,
  };
}
