// SPDX-License-Identifier: MIT
// The `em api surface --json` document (apiSurfaceSchemaVersion "1.x", em#448) — the
// companion-tool interface: em's own notion of the public surface, so no publicSurfaceOf
// re-implementation on this path.
//
// Schema 1.0 caveat (feedback filed on em#448, 2026-11-07): the document carries field-level
// `tag` flags but NOT the event-level `tags` array — composite and external DCB tags don't
// make the trip, and identity keys are only recoverable as the field's own name (which the
// DSL guarantees: an inline identity tag's key defaults to, and cannot differ from, the
// field name). Until the follow-up lands, augment output from this input derives identity
// candidates only and says so.

import { AugmentEvent, AugmentSource } from "./augment.js";
import { pascalCase } from "./exportDoc.js";

export interface SurfaceField {
  name: string;
  type: { kind: string; scalar: string | null; tsType: string; array: boolean };
  optional: boolean;
  tag: boolean;
  assigned: boolean;
  renamedFrom: string[] | null;
}

export interface SurfaceElement {
  name: string;
  slug: string;
  fields: SurfaceField[] | null;
  invariants: { id: string; rule: string | null }[] | null;
}

export interface SurfaceDoc {
  apiSurfaceSchemaVersion: string;
  generator: { name: string; version: string };
  file: string;
  modelKey: string;
  commands: SurfaceElement[];
  events: SurfaceElement[];
  views: SurfaceElement[];
  types: { name: string; fields: SurfaceField[] | null }[];
}

/** Parse + sanity-check an `em api surface --json` document. Throws with a user-facing message. */
export function readSurfaceDoc(text: string, label: string): SurfaceDoc {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    throw new Error(`${label}: not valid JSON (${(e as Error).message})`);
  }
  const d = doc as Partial<SurfaceDoc>;
  if (typeof d !== "object" || d === null || typeof d.apiSurfaceSchemaVersion !== "string") {
    throw new Error(`${label}: not an em api surface document (missing apiSurfaceSchemaVersion)`);
  }
  if (!d.apiSurfaceSchemaVersion.startsWith("1.")) {
    throw new Error(
      `${label}: apiSurfaceSchemaVersion ${d.apiSurfaceSchemaVersion} is not 1.x — this em-contract build reads schema 1.x`,
    );
  }
  if (!Array.isArray(d.events) || !Array.isArray(d.types) || typeof d.modelKey !== "string") {
    throw new Error(`${label}: surface document has no events/types/modelKey`);
  }
  return d as SurfaceDoc;
}

/** Normalize a surface document into augment's input. */
export function fromSurfaceDoc(doc: SurfaceDoc): AugmentSource {
  const events: AugmentEvent[] = doc.events.map((e) => ({
    name: e.name,
    // Identity tags synthesized from field flags; key == field name per the DSL guarantee.
    tags: (e.fields ?? [])
      .filter((f) => f.tag)
      .map((f) => ({ key: f.name, kind: "identity" as const, fields: [f.name], description: null })),
    assignedFields: (e.fields ?? []).filter((f) => f.assigned).map((f) => f.name),
  }));

  const warnings: string[] = [];
  if (doc.events.length > 0) {
    warnings.push(
      "api surface schema 1.0 carries no composite/external DCB tags — candidates derive from field-level identity flags only (em#448 follow-up pending); use em export input for full tag fidelity",
    );
  }

  return {
    sourceName: doc.file.split("/").pop() ?? doc.file,
    schemaLabel: `em api surface schema ${doc.apiSurfaceSchemaVersion}`,
    // The surface document carries the model key, not the name; pascalCase agrees for both
    // because the key is the kebab slug of the name (same word boundaries).
    namespace: pascalCase(doc.modelKey),
    typeNames: doc.types.map((t) => t.name),
    events,
    warnings,
  };
}
