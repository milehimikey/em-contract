// SPDX-License-Identifier: MIT
// The compiler-API spike (KICKOFF item 2), kept as a living test: programmatically compile a
// generated contract plus a hand-authored binding file and walk the resolved program to
// attribute binding references/augments to contract declarations. This is the semantic core
// the future `bind check` stands on — see docs/spike-compiler-api.md for the findings.

import { beforeAll, describe, expect, it } from "vitest";
import {
  compile,
  getSourceLocation,
  NodeHost,
  type Interface,
  type Model,
  type Namespace,
  type Operation,
  type Program,
} from "@typespec/compiler";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const spikeMain = resolve(here, "../fixtures/spike/main.tsp");

function fileOf(entity: { node?: { pos: number } }): string {
  const loc = getSourceLocation(entity.node as never);
  return loc ? loc.file.path : "(unknown)";
}

describe("compiler-API spike: contract + binding in one program", () => {
  let program: Program;
  let pricing: Namespace;
  let binding: Namespace;

  beforeAll(async () => {
    program = await compile(NodeHost, spikeMain);
    const global = program.getGlobalNamespaceType();
    pricing = global.namespaces.get("Pricing")!;
    binding = global.namespaces.get("PricingBinding")!;
  });

  it("compiles the generated contract + binding with no errors", () => {
    const errors = program.diagnostics.filter((d) => d.severity === "error");
    expect(errors.map((d) => d.message)).toEqual([]);
    expect(pricing).toBeDefined();
    expect(binding).toBeDefined();
  });

  it("enumerates the contract's declarations and attributes them to the contract file", () => {
    // DesignateSellingPrice is the command's payload model (em#445, contracts from em ≥ 1.22).
    expect([...pricing.models.keys()].sort()).toEqual([
      "DesignateSellingPrice",
      "Money",
      "SellingPriceDesignated",
      "SellingPrices",
    ]);
    expect([...pricing.interfaces.keys()].sort()).toEqual(["Commands", "Views"]);
    for (const m of pricing.models.values()) {
      expect(fileOf(m)).toMatch(/contracts\/pricing\.tsp$/);
    }
  });

  it("sees which contract properties the binding augments, and from which file", () => {
    const event = pricing.models.get("SellingPriceDesignated")!;
    const priceId = event.properties.get("priceId")!;
    // FINDING: the contract's own `/** ... */` doc comments surface as an implicit
    // `docFromCommentDecorator` application with `definition: undefined` and no node —
    // explicit applications are the ones carrying a `definition`.
    const explicit = priceId.decorators.filter((d) => d.definition != null);
    expect(explicit.map((d) => d.definition!.name).sort()).toEqual(["@doc", "@format"]);
    // The augment application's syntax node lives in the binding file — this is the
    // attribution `bind check` needs ("binding X augments contract declaration Y").
    for (const d of explicit) {
      expect(fileOf(d)).toMatch(/spike\/binding\.tsp$/);
    }
    // A property the binding does not touch carries no explicit decorators.
    expect(event.properties.get("designatedAt")!.decorators.filter((d) => d.definition != null)).toHaveLength(0);
  });

  it("resolves a binding op's Envelope<T> back to the contract model it wraps", () => {
    const op: Operation = binding.operations.get("getSellingPrices")!;
    const envelope = op.returnType as Model;
    expect(envelope.name).toBe("Envelope");
    // The instantiated template's `data` property is the contract's model, declared in the
    // contract file — references survive template instantiation.
    const data = envelope.properties.get("data")!.type as Model;
    expect(data.name).toBe("SellingPrices");
    expect(fileOf(data)).toMatch(/contracts\/pricing\.tsp$/);
  });

  it("can list every binding-file augment targeting the contract (bind check's core query)", () => {
    const augments: string[] = [];
    const visitModel = (ns: Namespace) => {
      for (const m of ns.models.values()) {
        for (const p of m.properties.values()) {
          for (const d of p.decorators) {
            if (d.definition != null && fileOf(d).endsWith("binding.tsp")) {
              augments.push(`${d.definition?.name ?? "?"} -> ${ns.name}.${m.name}.${p.name}`);
            }
          }
        }
      }
    };
    visitModel(pricing);
    expect(augments.sort()).toEqual([
      "@doc -> Pricing.SellingPriceDesignated.priceId",
      "@format -> Pricing.SellingPriceDesignated.priceId",
      "@format -> Pricing.SellingPriceDesignated.productId",
    ]);
  });

  it("exposes interfaces' ops for future bind-check coverage of Commands/Views", () => {
    const views: Interface = pricing.interfaces.get("Views")!;
    const getOp = views.operations.get("getSellingPrices")!;
    expect((getOp.returnType as Model).name).toBe("SellingPrices");
  });
});
