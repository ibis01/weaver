#!/usr/bin/env node
// Verifies that every Node version declaration agrees on a single
// exact patch. Run in CI; fails the build on drift.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");

function readNvmrc() {
  const p = path.join(root, ".nvmrc");
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8").trim();
}

function readEngines() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  return pkg.engines?.node || null;
}

function readDockerFiles() {
  const out = [];
  for (const name of ["Dockerfile.web", "Dockerfile.proxy"]) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    for (const m of text.matchAll(/FROM node:([^\s-]+)/g)) {
      out.push({ file: name, version: m[1] });
    }
  }
  return out;
}

const problems = [];
const nvmrc = readNvmrc();
const engines = readEngines();
const dockers = readDockerFiles();

if (!nvmrc) problems.push(".nvmrc is missing");
if (!engines) problems.push("package.json engines.node is missing");

// .nvmrc must be an exact version (major.minor.patch), not a floating major.
if (nvmrc && !/^\d+\.\d+\.\d+$/.test(nvmrc)) {
  problems.push(`.nvmrc must pin an exact version (got "${nvmrc}")`);
}

// Docker FROM node:<x> must not include -alpine variant here since we
// strip it via regex; just check the number matches .nvmrc.
if (nvmrc) {
  for (const d of dockers) {
    if (d.version !== nvmrc) {
      problems.push(
        `${d.file}: FROM node:${d.version} does not match .nvmrc (${nvmrc})`,
      );
    }
  }
}

// The engines floor should be <= nvmrc and in the same major.
if (nvmrc && engines) {
  const m = engines.match(/>=\s*(\d+\.\d+\.\d+)/);
  if (m) {
    const floor = m[1];
    const [nMaj, nMin, nPatch] = nvmrc.split(".").map(Number);
    const [fMaj, fMin, fPatch] = floor.split(".").map(Number);
    const cmp =
      nMaj - fMaj || nMin - fMin || nPatch - fPatch;
    if (cmp < 0) {
      problems.push(
        `.nvmrc (${nvmrc}) is below the engines floor (${floor})`,
      );
    }
  }
}

if (problems.length) {
  console.error("Runtime version drift detected:");
  for (const p of problems) console.error(" - " + p);
  process.exit(1);
}
console.log(`Runtime versions aligned at ${nvmrc}`);
