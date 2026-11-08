#!/usr/bin/env node
"use strict";

// scripts/oneoff/reconcile-gate0d-2026-11-08.js
//
// One-off Gate 0d data reconciliation (audit finding 2026-11-08):
//   1. Preserve an immutable, byte-exact copy of the pre-reconciliation
//      data under data/prospective/archive/2026-11-08-pre-reconciliation/
//      together with a SHA256SUMS.txt manifest.
//   2. Produce canonical, deduplicated datasets keyed by txHash
//      (first occurrence wins; original row order preserved).
//   3. Reconcile state.json buys_collected to the canonical unique count.
//   4. Record the reconciliation inside state.json (machine-readable).
//
// SAFETY:
// - Idempotent: refuses to run if the archive already exists.
// - Validates before writing: the canonical txHash set must EQUAL the
//   original txHash set (dedup only — no fabrication, no loss).
// - Never touches data/pepe-buyer-list, freeze-hashes.txt, or any
//   hash-pinned artifact from the Gate 0d freeze.
//
// Full narrative: docs/audits/gate-0d-reconciliation-2026-11-08.md

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const DIR = path.join("data", "prospective");
const ARCHIVE = path.join(DIR, "archive", "2026-11-08-pre-reconciliation");
const DOC = "docs/audits/gate-0d-reconciliation-2026-11-08.md";

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function readJsonl(p) {
  return fs
    .readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

function dedupeByTxHash(rows) {
  const seen = new Set();
  const kept = [], dropped = [];
  for (const r of rows) {
    if (seen.has(r.txHash)) dropped.push(r);
    else { seen.add(r.txHash); kept.push(r); }
  }
  return { kept, dropped };
}

function counts(rows) {
  const m = new Map();
  for (const r of rows) m.set(r.txHash, (m.get(r.txHash) || 0) + 1);
  return m;
}

function main() {
  if (fs.existsSync(ARCHIVE)) {
    process.stderr.write(
      "REFUSING: archive already exists at " + ARCHIVE + "\n" +
      "This reconciliation has already been applied (idempotency guard).\n"
    );
    process.exit(1);
  }

  const buysPath = path.join(DIR, "buys.jsonl");
  const outcomesPath = path.join(DIR, "outcomes.jsonl");
  const statePath = path.join(DIR, "state.json");

  const origBuys = readJsonl(buysPath);
  const origOutcomes = readJsonl(outcomesPath);
  const origState = JSON.parse(fs.readFileSync(statePath, "utf8"));

  const buysByTx = counts(origBuys);
  const outcomesByTx = counts(origOutcomes);
  const dupBuyRows = origBuys.length - buysByTx.size;
  const dupOutcomeRows = origOutcomes.length - outcomesByTx.size;

  process.stderr.write("=== BEFORE ===\n");
  process.stderr.write(
    "buys: " + origBuys.length + " rows, " + buysByTx.size + " unique txHash, " +
    dupBuyRows + " duplicate row(s)\n"
  );
  process.stderr.write(
    "outcomes: " + origOutcomes.length + " rows, " + outcomesByTx.size +
    " unique txHash, " + dupOutcomeRows + " duplicate row(s)\n"
  );
  process.stderr.write("state.buys_collected: " + origState.buys_collected + "\n");
  process.stderr.write(
    "duplicate buy txHashes: " +
    [...buysByTx.entries()].filter(([, n]) => n > 1).map(([h, n]) => h.slice(0, 12) + "…x" + n).join(", ") +
    "\n"
  );

  // ---- Step 1: immutable archive -------------------------------------
  fs.mkdirSync(ARCHIVE, { recursive: true });
  const filesToArchive = ["buys.jsonl", "outcomes.jsonl", "state.json", "freeze-hashes.txt"];
  const manifest = [
    "# Pre-reconciliation archive — Gate 0d, 2026-11-08",
    "# Created by scripts/oneoff/reconcile-gate0d-2026-11-08.js",
    "# These bytes are the ORIGINAL (pre-correction) evidence. Do not edit.",
    "# Canonical post-reconciliation hashes are recorded in " + DOC,
    "",
  ];
  for (const f of filesToArchive) {
    const src = path.join(DIR, f);
    if (!fs.existsSync(src)) continue;
    const buf = fs.readFileSync(src);
    fs.writeFileSync(path.join(ARCHIVE, f), buf); // byte-exact copy
    manifest.push(sha256(buf) + "  " + f);
  }
  fs.writeFileSync(path.join(ARCHIVE, "SHA256SUMS.txt"), manifest.join("\n") + "\n");
  process.stderr.write("\narchived originals -> " + ARCHIVE + "\n");

  // ---- Step 2: canonical dedupe ---------------------------------------
  const buys = dedupeByTxHash(origBuys);
  const outcomes = dedupeByTxHash(origOutcomes);

  // Validation: dedupe must not change the txHash universe.
  const origTxSet = new Set(origBuys.map((r) => r.txHash));
  const canonTxSet = new Set(buys.kept.map((r) => r.txHash));
  if (origTxSet.size !== canonTxSet.size ||
      [...origTxSet].some((h) => !canonTxSet.has(h))) {
    process.stderr.write("FATAL: canonical txHash set diverged — aborting, no writes.\n");
    process.exit(1);
  }

  // ---- Step 3: state reconciliation -----------------------------------
  const nowIso = new Date().toISOString();
  const newState = Object.assign({}, origState, {
    buys_collected: buys.kept.length,
    reconciliation: {
      at: nowIso,
      script: "scripts/oneoff/reconcile-gate0d-2026-11-08.js",
      doc: DOC,
      buys_before: { rows: origBuys.length, unique: buysByTx.size, state_counter: origState.buys_collected },
      buys_after: { rows: buys.kept.length },
      dropped_buy_rows: dupBuyRows,
      dropped_outcome_rows: dupOutcomeRows,
      rule: "first occurrence per txHash; originals archived byte-exact",
      archive: path.relative(".", ARCHIVE) + "/",
    },
  });

  // ---- Step 4: write canonical files ----------------------------------
  fs.writeFileSync(buysPath, buys.kept.map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.writeFileSync(outcomesPath, outcomes.kept.map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.writeFileSync(statePath, JSON.stringify(newState, null, 2) + "\n");

  process.stderr.write("\n=== AFTER ===\n");
  process.stderr.write("buys: " + buys.kept.length + " rows (canonical)\n");
  process.stderr.write("outcomes: " + outcomes.kept.length + " rows (canonical)\n");
  process.stderr.write("state.buys_collected: " + origState.buys_collected + " -> " + newState.buys_collected + "\n");
  process.stderr.write("\n=== SHA256 (canonical) ===\n");
  for (const f of ["buys.jsonl", "outcomes.jsonl", "state.json"]) {
    process.stderr.write(sha256(fs.readFileSync(path.join(DIR, f))) + "  data/prospective/" + f + "\n");
  }
  process.stderr.write("\n=== SHA256 (archive manifest) ===\n");
  process.stderr.write(fs.readFileSync(path.join(ARCHIVE, "SHA256SUMS.txt"), "utf8"));
}

main();
