// SPDX-License-Identifier: MIT
// bind init + bind check against the pricing fixture contract. bind init's scaffold must
// itself pass bind check and compile as-is (everything protocol-shaped starts commented).

import { describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBindingScaffold } from "../src/bindInit.js";
import { runBindCheck } from "../src/bindCheck.js";
import { loadContract } from "../src/contractInfo.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => resolve(here, "../fixtures", name);

describe("contractInfo.loadContract", () => {
  it("distills the pricing contract's full surface", async () => {
    const { info } = await loadContract(fixture("contracts/pricing.tsp"));
    expect(info.namespace).toBe("Pricing");
    expect(info.commands).toEqual([
      { op: "designateSellingPrice", model: "DesignateSellingPrice", fields: ["priceId", "productId", "price"] },
    ]);
    expect(info.events).toEqual([
      {
        op: "onSellingPriceDesignated",
        model: "SellingPriceDesignated",
        fields: ["priceId", "productId", "price", "designatedAt"],
      },
    ]);
    expect(info.views).toEqual([{ op: "getSellingPrices", model: "SellingPrices", fields: ["priceId", "productId", "price"] }]);
    expect([...info.models.keys()].sort()).toEqual(["DesignateSellingPrice", "Money", "SellingPriceDesignated", "SellingPrices"]);
  });
});

describe("bind init", () => {
  it("scaffold is deterministic and contract-derived", async () => {
    const { info } = await loadContract(fixture("contracts/pricing.tsp"));
    const files = buildBindingScaffold(info, { contractImport: "../contracts/pricing.tsp" });
    expect(files.map((f) => f.name)).toEqual(["binding.tsp", "tspconfig.yaml"]);
    const binding = files[0].text;
    expect(binding).toContain('import "../contracts/pricing.tsp";');
    expect(binding).toContain("using Pricing;");
    // Examples name real declarations, commented out.
    expect(binding).toContain("// @@format(Pricing.DesignateSellingPrice.priceId");
    expect(binding).toContain('// @@channel(Pricing.Events.onSellingPriceDesignated, "<channel.name>");');
    expect(binding).toContain("//   @post op designateSellingPrice(@body payload: Pricing.DesignateSellingPrice): void;");
    expect(binding).toContain("em-contract augment");
    // Deterministic.
    const again = buildBindingScaffold(info, { contractImport: "../contracts/pricing.tsp" });
    expect(again[0].text).toBe(binding);
  });

  it("scaffolded binding.tsp compiles as-is and passes bind check", async () => {
    const tmp = resolve(here, ".tmp/bind-init");
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(resolve(tmp, "api"), { recursive: true });
    mkdirSync(resolve(tmp, "contracts"), { recursive: true });
    copyFileSync(fixture("contracts/pricing.tsp"), resolve(tmp, "contracts/pricing.tsp"));
    const { info } = await loadContract(fixture("contracts/pricing.tsp"));
    const [binding] = buildBindingScaffold(info, { contractImport: "../contracts/pricing.tsp" });
    writeFileSync(resolve(tmp, "api/binding.tsp"), binding.text);

    const result = await runBindCheck(resolve(tmp, "api/binding.tsp"));
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.contractFiles).toHaveLength(1);
  });
});

describe("bind check", () => {
  it("good binding: ok, augments attributed to the binding file", async () => {
    const result = await runBindCheck(fixture("bindings/good.tsp"));
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.augments.map((a) => `${a.decorator} -> ${a.target}`).sort()).toEqual([
      "@doc -> Pricing.Events.onSellingPriceDesignated",
      "@format -> Pricing.SellingPriceDesignated.priceId",
    ]);
    for (const a of result.augments) expect(a.file).toMatch(/bindings\/good\.tsp$/);
  });

  it("shadow binding: warning naming every contract model with that field set, still ok", async () => {
    const result = await runBindCheck(fixture("bindings/shadow.tsp"));
    expect(result.ok).toBe(true); // advisory unless --strict
    expect(result.findings).toHaveLength(1);
    const f = result.findings[0];
    expect(f.severity).toBe("warning");
    expect(f.code).toBe("shadow-model");
    // SellingPrices (view) and DesignateSellingPrice (command payload) share the field set.
    expect(f.message).toContain("PricingBinding.SellingPricesCopy");
    expect(f.message).toContain("Pricing.SellingPrices");
    expect(f.message).toContain("Pricing.DesignateSellingPrice");
  });

  it("broken binding: a dropped contract field surfaces as a compile-error finding, exit path fails", async () => {
    const result = await runBindCheck(fixture("bindings/broken.tsp"));
    expect(result.ok).toBe(false);
    const errors = result.findings.filter((f) => f.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("compile-error");
    expect(errors[0].message).toContain("legacyPriceRef");
    expect(errors[0].file).toMatch(/bindings\/broken\.tsp$/);
  });

  it("no contract in the compilation: error finding", async () => {
    const tmp = resolve(here, ".tmp/bind-nocontract");
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    writeFileSync(resolve(tmp, "standalone.tsp"), "namespace Lonely { model X { a: string; } }\n");
    const result = await runBindCheck(resolve(tmp, "standalone.tsp"));
    expect(result.ok).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain("no-contract");
  });

  it("Envelope wrapping does not trip the shadow rule", async () => {
    const result = await runBindCheck(fixture("bindings/good.tsp"));
    expect(result.findings.filter((f) => f.code === "shadow-model")).toEqual([]);
  });
});
