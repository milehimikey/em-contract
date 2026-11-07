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
import { contractNames, fromExportDoc, readExportDoc } from "../src/exportDoc.js";
import { readAugmentInput } from "../src/inputDoc.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => resolve(here, "../fixtures", name);
const golden = (name: string) => readFileSync(resolve(here, "golden", name), "utf8");
const loadDoc = (name: string) => readExportDoc(readFileSync(fixture(name), "utf8"), name);
const loadSrc = (name: string) => readAugmentInput(readFileSync(fixture(name), "utf8"), name);

describe("buildAugment", () => {
  it("pricing: tags + assigned -> commented candidates (golden)", () => {
    const { text, warnings } = buildAugment(loadSrc("pricing-export.json"));
    expect(text).toBe(golden("pricing.augment.tsp"));
    expect(warnings).toEqual([
      'event "Price Audit Recorded" carries DCB tags but is not public — it is not in the contract, no augment emitted (mark it `public` in the model to bind it)',
    ]);
  });

  it("pricing: --active --contract -> live decorators + imports (golden)", () => {
    const { text } = buildAugment(loadSrc("pricing-export.json"), {
      active: true,
      contractImport: "./contracts/pricing.tsp",
    });
    expect(text).toBe(golden("pricing.augment.active.tsp"));
  });

  it("order-fulfillment: no tags -> assigned notes only, no decorator prelude (golden)", () => {
    const { text, warnings } = buildAugment(loadSrc("order-fulfillment-export.json"));
    expect(text).toBe(golden("order-fulfillment.augment.tsp"));
    expect(warnings).toEqual([]);
    expect(text).not.toContain("import");
  });

  it("is deterministic: same input, same bytes", () => {
    const src = () => loadSrc("pricing-export.json");
    expect(buildAugment(src()).text).toBe(buildAugment(src()).text);
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
    for (const name of [
      ...names.eventModel.values(),
      ...names.viewModel.values(),
      ...names.typeModel.values(),
      ...names.commandModel.values(), // payload models, em#445
    ]) {
      expect(contract).toContain(`model ${name} {`);
    }
    expect(names.typeModel.size).toBe(1); // Money is reachable from the surface
    expect([...names.commandModel.values()]).toEqual(["DesignateSellingPrice"]);
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

describe("augment from em api surface --json (em#448)", () => {
  it("surface fixture: identity candidates + assigned notes, schema caveat as warning (golden)", () => {
    const { text, warnings } = buildAugment(loadSrc("pricing-surface.json"));
    expect(text).toBe(golden("pricing-from-surface.augment.tsp"));
    // Composite/external tags don't survive surface schema 1.0 — the caveat says so.
    expect(warnings).toEqual([
      "api surface schema 1.0 carries no composite/external DCB tags — candidates derive from field-level identity flags only (em#448 follow-up pending); use em export input for full tag fidelity",
    ]);
    expect(text).not.toContain("composite");
    expect(text).toContain("@@correlationId(Pricing.SellingPriceDesignated.priceId)");
  });

  it("input detection: surface vs export by schema discriminator", () => {
    expect(loadSrc("pricing-surface.json").schemaLabel).toBe("em api surface schema 1.0");
    expect(loadSrc("pricing-export.json").schemaLabel).toBe("em export schema 1.20");
    expect(() => readAugmentInput('{"apiSurfaceSchemaVersion":"2.0","events":[],"types":[],"modelKey":"x","file":"x.em"}', "x.json")).toThrow(
      /apiSurfaceSchemaVersion 2.0 is not 1.x/,
    );
  });

  it("live: the vendored em main binary's surface output feeds augment byte-identically", async () => {
    // Pins the real integration: em (packed from main, vendor/) must keep emitting
    // apiSurfaceSchemaVersion 1.x that this reader accepts.
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const emCli = resolve(here, "../node_modules/@milehimikey/em/dist/cli.js");
    const { stdout } = await promisify(execFile)("node", [emCli, "api", "surface", fixture("pricing.em"), "--json"]);
    expect(JSON.parse(stdout).apiSurfaceSchemaVersion).toBe("1.0");
    const { text } = buildAugment(readAugmentInput(stdout, "live-surface"));
    expect(text).toBe(golden("pricing-from-surface.augment.tsp"));
  });
});

describe("--active output compiles", () => {
  it("augment + contract + typespec-asyncapi compile with no errors", async () => {
    // Inside the repo so `import "typespec-asyncapi"` resolves via node_modules.
    const tmp = resolve(here, ".tmp/augment-compile");
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    copyFileSync(fixture("contracts/pricing.tsp"), resolve(tmp, "pricing.tsp"));
    const { text } = buildAugment(loadSrc("pricing-export.json"), {
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
