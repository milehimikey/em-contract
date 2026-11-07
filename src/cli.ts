#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// em-contract — TypeSpec intelligence for em-generated contracts. House rules match em:
// deterministic outputs, clean stdout (the artifact), diagnostics to stderr, version read
// from package.json at runtime, no LLM/AI calls anywhere.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { buildAugment } from "./augment.js";
import { buildBindingScaffold } from "./bindInit.js";
import { runBindCheck, type BindCheckResult } from "./bindCheck.js";
import { EM_CONTRACT_HEADER, loadContract } from "./contractInfo.js";
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

const bind = program.command("bind").description("scaffold and verify binding files for a generated contract");

bind
  .command("init")
  .argument("<contract.tsp>", "a generated em contract (em api generate output)")
  .description(
    "scaffold a binding project around the contract per em's binding-file convention " +
      "(docs/contract-bindings.md): binding.tsp with commented, contract-derived examples + tspconfig.yaml",
  )
  .option("-o, --out <dir>", "output directory (default: <contract dir>/../api)")
  .option("--force", "overwrite existing files", false)
  .action(async (contractPath: string, opts: { out?: string; force: boolean }) => {
    try {
      if (!readFileSync(contractPath, "utf8").startsWith(EM_CONTRACT_HEADER)) {
        process.stderr.write(`warn: ${contractPath} does not carry the em api generate header — scaffolding anyway\n`);
      }
      const { info } = await loadContract(resolve(contractPath));
      const outDir = resolve(opts.out ?? join(dirname(contractPath), "..", "api"));
      let contractImport = relative(outDir, resolve(contractPath)).split("\\").join("/");
      if (!contractImport.startsWith(".")) contractImport = `./${contractImport}`;
      const files = buildBindingScaffold(info, { contractImport });
      const clashes = files.filter((f) => existsSync(join(outDir, f.name)));
      if (clashes.length > 0 && !opts.force) {
        process.stderr.write(`error: ${clashes.map((f) => join(outDir, f.name)).join(", ")} already exist${clashes.length === 1 ? "s" : ""} — re-run with --force to overwrite\n`);
        process.exit(1);
      }
      mkdirSync(outDir, { recursive: true });
      for (const f of files) {
        writeFileSync(join(outDir, f.name), f.text);
        process.stderr.write(`wrote ${join(outDir, f.name)}\n`);
      }
    } catch (e) {
      process.stderr.write(`error: ${(e as Error).message}\n`);
      process.exit(1);
    }
  });

function formatBindCheck(result: BindCheckResult, cwd: string): string {
  const rel = (p: string | null) => (p === null ? null : relative(cwd, p) || p);
  const lines: string[] = [];
  lines.push(`contract: ${result.contractFiles.map((f) => rel(f)).join(", ") || "(none)"}`);
  for (const a of result.augments) lines.push(`augment: ${a.decorator} -> ${a.target} (${rel(a.file)})`);
  for (const f of result.findings) {
    const where = f.file ? ` [${rel(f.file)}${f.line === null ? "" : `:${f.line}`}]` : "";
    lines.push(`${f.severity === "error" ? "error" : "warn"} ${f.code}: ${f.message}${where}`);
  }
  const warnings = result.findings.filter((f) => f.severity === "warning").length;
  lines.push(
    !result.ok
      ? "binding check FAILED"
      : warnings > 0
        ? `binding compiles against the contract — ${warnings} warning${warnings === 1 ? "" : "s"} to review`
        : "binding is honest against the contract",
  );
  return lines.join("\n");
}

bind
  .command("check")
  .argument("<binding.tsp>", "the binding entry file (imports the generated contract)")
  .description(
    "compile binding + contract and verify the binding stays honest: compile errors are drift, " +
      "binding models must not re-declare contract shapes; reports every binding augment onto the contract",
  )
  .option("--json", "print a JSON document instead of the text report", false)
  .option("--strict", "warnings also fail (exit 1)", false)
  .action(async (entry: string, opts: { json: boolean; strict: boolean }) => {
    let result: BindCheckResult;
    try {
      result = await runBindCheck(resolve(entry));
    } catch (e) {
      process.stderr.write(`error: ${(e as Error).message}\n`);
      process.exit(1);
    }
    const cwd = process.cwd();
    const rel = (p: string | null) => (p === null ? null : relative(cwd, p) || p);
    if (opts.json) {
      const doc = {
        bindCheckSchemaVersion: "0.1",
        generator: { name: "em-contract", version: VERSION },
        entry: rel(result.entry),
        contractFiles: result.contractFiles.map((f) => rel(f)),
        augments: result.augments.map((a) => ({ ...a, file: rel(a.file) })),
        findings: result.findings.map((f) => ({ ...f, file: rel(f.file) })),
        ok: result.ok,
      };
      process.stdout.write(JSON.stringify(doc, null, 2) + "\n");
    } else {
      process.stdout.write(formatBindCheck(result, cwd) + "\n");
    }
    const failed = !result.ok || (opts.strict && result.findings.length > 0);
    process.exit(failed ? 1 : 0);
  });

program.parse();
