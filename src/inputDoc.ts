// SPDX-License-Identifier: MIT
// One entry point for augment's two input documents, detected by schema discriminator:
// `apiSurfaceSchemaVersion` -> em api surface (em#448), else em export.

import { AugmentSource } from "./augment.js";
import { fromExportDoc, readExportDoc } from "./exportDoc.js";
import { fromSurfaceDoc, readSurfaceDoc } from "./surfaceDoc.js";

export function readAugmentInput(text: string, label: string): AugmentSource {
  let peek: unknown;
  try {
    peek = JSON.parse(text);
  } catch (e) {
    throw new Error(`${label}: not valid JSON (${(e as Error).message})`);
  }
  if (peek && typeof peek === "object" && "apiSurfaceSchemaVersion" in (peek as object)) {
    return fromSurfaceDoc(readSurfaceDoc(text, label));
  }
  return fromExportDoc(readExportDoc(text, label));
}
