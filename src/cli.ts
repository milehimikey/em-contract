#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// em-contract — TypeSpec intelligence for em-generated contracts. House rules match em:
// deterministic outputs, clean stdout (the artifact), diagnostics to stderr, version read
// from package.json at runtime, no LLM/AI calls anywhere.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { buildAugment } from "./augment.js";
import { readExportDoc } from "./exportDoc.js";

export const VERSION: string = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"),
).version;

const program = new Command();

program
  .name("em-contract")
  .description("bind em-generated TypeSpec contracts to real HTTP/async specs without forking them")
  .version(VERSION);

program
  .command("augment")
  .argument("<export.json>", "an `em export` document (produce it with: em export <model>.em -o export.json)")
  .description(
    "emit an augment-decorator file for the model's generated contract: DCB identity tags become " +
      "@@correlationId/@@header candidates, composite/external tags and `assigned` fields become notes",
  )
  .option("-o, --out <path>", "write to a file instead of stdout")
  .option("--active", "emit decorator lines active instead of commented-out candidates", false)
  .option("--contract <path>", "relative path to the generated .tsp, emitted as an import line")
  .action((file: string, opts: { out?: string; active: boolean; contract?: string }) => {
    let doc;
    try {
      doc = readExportDoc(readFileSync(file, "utf8"), file);
    } catch (e) {
      process.stderr.write(`error: ${(e as Error).message}\n`);
      process.exit(1);
    }
    const { text, warnings } = buildAugment(doc, { active: opts.active, contractImport: opts.contract ?? null });
    for (const w of warnings) process.stderr.write(`warn: ${w}\n`);
    if (opts.out) {
      mkdirSync(dirname(opts.out), { recursive: true });
      writeFileSync(opts.out, text);
      process.stderr.write(`wrote ${opts.out}\n`);
    } else {
      process.stdout.write(text);
    }
  });

program.parse();
