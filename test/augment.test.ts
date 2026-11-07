// SPDX-License-Identifier: MIT
// `em-contract augment` v0: golden-file tests over committed `em export` fixtures
// (regeneration commands are noted in each fixture's header), plus a compile check that the
// --active output is real TypeSpec once typespec-asyncapi and the contract are in scope.

import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync, copyFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile, NodeHost } from "@typespec/compiler";
import { buildAugment } from "../src/augment.js";
import { contractNames, readExportDoc } from "../src/exportDoc.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => resolve(here, "../fixtures", name);
const golden = (name: string) => readFileSync(resolve(here, "golden", name), "utf8");
const loadDoc = (name: string) => readExportDoc(readFileSync(fixture(name), "utf8"), name);

describe("buildAugment", () => {
  it("pricing: tags + assigned -> commented candidates (golden)", () => {
    const { text, warnings } = buildAugment(loadDoc("pricing-export.json"));
    expect(text).toBe(golden("pricing.augment.tsp"));
    expect(warnings).toEqual([
      'event "Price Audit Recorded" carries DCB tags but is not public — it is not in the contract, no augment emitted (mark it `public` in the model to bind it)',
    ]);
  });

  it("pricing: --active --contract -> live decorators + imports (golden)", () => {
    const { text } = buildAugment(loadDoc("pricing-export.json"), {
      active: true,
      contractImport: "./contracts/pricing.tsp",
    });
    expect(text).toBe(golden("pricing.augment.active.tsp"));
  });

  it("order-fulfillment: no tags -> assigned notes only, no decorator prelude (golden)", () => {
    const { text, warnings } = buildAugment(loadDoc("order-fulfillment-export.json"));
    expect(text).toBe(golden("order-fulfillment.augment.tsp"));
    expect(warnings).toEqual([]);
    expect(text).not.toContain("import");
  });

  it("is deterministic: same input, same bytes", () => {
    const doc = () => loadDoc("pricing-export.json");
    expect(buildAugment(doc()).text).toBe(buildAugment(doc()).text);
  });

  it("refuses a non-export document with a pointed message", () => {
    expect(() => readExportDoc("{}", "x.json")).toThrow(/not an em export document/);
    expect(() => readExportDoc('{"schemaVersion":"2.0"}', "x.json")).toThrow(/schemaVersion 2.0 is not 1.x/);
  });
});

describe("contractNames mirrors em api generate naming", () => {
  it("pricing: namespace + model names match the committed contract", () => {
    const names = contractNames(loadDoc("pricing-export.json"));
    const contract = readFileSync(fixture("contracts/pricing.tsp"), "utf8");
    expect(contract).toContain(`namespace ${names.namespace} {`);
    for (const name of [...names.eventModel.values(), ...names.viewModel.values(), ...names.typeModel.values()]) {
      expect(contract).toContain(`model ${name} {`);
    }
    expect(names.typeModel.size).toBe(1); // Money is reachable from the surface
  });

  it("order-fulfillment: matches em's committed example contract", () => {
    const names = contractNames(loadDoc("order-fulfillment-export.json"));
    const contract = readFileSync(fixture("contracts/order-fulfillment.tsp"), "utf8");
    expect(contract).toContain(`namespace ${names.namespace} {`);
    for (const name of [...names.eventModel.values(), ...names.viewModel.values()]) {
      expect(contract).toContain(`model ${name} {`);
    }
  });
});

describe("--active output compiles", () => {
  it("augment + contract + typespec-asyncapi compile with no errors", async () => {
    // Inside the repo so `import "typespec-asyncapi"` resolves via node_modules.
    const tmp = resolve(here, ".tmp/augment-compile");
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    copyFileSync(fixture("contracts/pricing.tsp"), resolve(tmp, "pricing.tsp"));
    const { text } = buildAugment(loadDoc("pricing-export.json"), {
      active: true,
      contractImport: "./pricing.tsp",
    });
    writeFileSync(resolve(tmp, "augment.tsp"), text);

    const program = await compile(NodeHost, resolve(tmp, "augment.tsp"));
    expect(program.diagnostics.filter((d) => d.severity === "error").map((d) => d.message)).toEqual([]);

    // The correlationId augment really landed on the contract's property.
    const pricing = program.getGlobalNamespaceType().namespaces.get("Pricing")!;
    const priceId = pricing.models.get("SellingPriceDesignated")!.properties.get("priceId")!;
    const names = priceId.decorators.filter((d) => d.definition != null).map((d) => d.definition!.name);
    expect(names).toContain("@correlationId");
    expect(names).toContain("@header");
  });
});
