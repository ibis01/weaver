#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const v2 = require("./pattern-check-v2.js");

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") throw new Error(`missing input file: ${file}. Copy the example manifest, edit it, then rerun.`);
    throw new Error(`cannot read JSON input ${file}: ${error.message}`);
  }
}
function readWallets(file) {
  let value;
  try { value = file.endsWith(".json") ? readJson(file) : fs.readFileSync(file, "utf8").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")); }
  catch (error) { if (error.code === "ENOENT") throw new Error(`missing control-wallet file: ${file}. Copy examples/control-wallets.example.txt and curate an independent control group.`); throw error; }
  if (!Array.isArray(value)) throw new Error("control wallets must be a JSON array or newline-delimited file");
  return value.map(String);
}
function validateTokens(tokens) {
  const errors = [];
  if (!Array.isArray(tokens) || tokens.length === 0) return ["tokens must be a non-empty array"];
  for (const [index, token] of tokens.entries()) {
    for (const field of ["symbol", "address", "windowStart", "windowEnd", "pumpDay"]) if (!token || typeof token[field] !== "string" || !token[field].trim()) errors.push(`tokens[${index}].${field} is required`);
    if (!/^0x[0-9a-fA-F]{40}$/.test(String(token?.address || ""))) errors.push(`tokens[${index}].address must be a 20-byte Ethereum address`);
    if (String(token?.address || "").toLowerCase() === v2.PEPE.toLowerCase()) errors.push(`tokens[${index}] must exclude PEPE`);
  }
  return errors;
}
function counts(result) {
  return (result.graded || []).reduce((out, item) => { out[item.classification] = (out[item.classification] || 0) + 1; return out; }, {});
}
function summarize(records) {
  const complete = records.filter((record) => record.status === "COMPLETE");
  const confirmed = complete.filter((record) => record.confirmedBuy);
  const probable = complete.filter((record) => record.probableBuy);
  const rate = (items) => complete.length ? items.length / complete.length : null;
  return { walletTokenPairs: records.length, completePairs: complete.length, incompletePairs: records.length - complete.length, exactBlockPairs: complete.filter((r) => r.blockRangeExact).length, confirmedBuyPairs: confirmed.length, probableBuyPairs: probable.length, confirmedRate: rate(confirmed), probableRate: rate(probable) };
}
async function scanGroup(wallets, group, tokens, options = {}) {
  const records = [];
  for (const wallet of wallets) for (const token of tokens) {
    const result = await v2.reVerifyWallet(wallet, token.address, token.windowStart, token.windowEnd, options);
    const classCounts = result.status === "COMPLETE" ? counts(result) : {};
    records.push({ group, wallet, symbol: token.symbol, token: token.address, pumpDay: token.pumpDay, status: result.status, blockRangeExact: Boolean(result.blockRangeExact), classifications: classCounts, confirmedBuy: result.status === "COMPLETE" && (classCounts.CONFIRMED_DEX_BUY || 0) > 0, probableBuy: result.status === "COMPLETE" && ((classCounts.CONFIRMED_DEX_BUY || 0) + (classCounts.LIKELY_DEX_BUY || 0) > 0), details: result });
  }
  return records;
}
function compareGroups(records) {
  const byGroup = { gold: summarize(records.filter((r) => r.group === "gold")), control: summarize(records.filter((r) => r.group === "control")) };
  return { byGroup, confirmedRateDeltaGoldMinusControl: byGroup.gold.confirmedRate === null || byGroup.control.confirmedRate === null ? null : byGroup.gold.confirmedRate - byGroup.control.confirmedRate };
}
async function main() {
  const args = process.argv.slice(2); const get = (flag, fallback = null) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : fallback; };
  const verifiedOutput = get("--verified-output"); const tokensPath = get("--tokens"); const controlsPath = get("--control-wallets"); const outputPath = get("--output", path.join(process.cwd(), "gold-pattern-check-stage2.json"));
  if (!verifiedOutput || !tokensPath || !controlsPath) throw new Error("usage: node scripts/pattern-check-stage2.js --verified-output FILE --tokens FILE --control-wallets FILE [--output FILE]");
  const verified = readJson(verifiedOutput); const tokens = readJson(tokensPath); const gold = verified.verifiedWallets || []; const controls = readWallets(controlsPath); const errors = validateTokens(tokens);
  if (!gold.length) errors.push("verified output contains no CONFIRMED_DEX_BUY wallets");
  if (!controls.length) errors.push("control wallet set is empty");
  if (controls.some((wallet) => !/^0x[0-9a-fA-F]{40}$/.test(wallet))) errors.push("all control wallets must be 20-byte Ethereum addresses");
  const goldSet = new Set(gold.map((wallet) => wallet.toLowerCase())); if (controls.some((wallet) => goldSet.has(wallet.toLowerCase()))) errors.push("gold and control wallet sets overlap");
  if (errors.length) throw new Error(`invalid Stage 2 inputs:\n- ${errors.join("\n- ")}`);
  const records = [...await scanGroup(gold, "gold", tokens), ...await scanGroup(controls, "control", tokens)];
  const output = { version: "gold-pattern-check-stage2-v1", ranAt: new Date().toISOString(), method: "confirmed DEX-buy rate across non-PEPE token windows", positiveWallets: gold, controlWallets: controls, tokens, comparison: compareGroups(records), records, interpretation: "Descriptive validation only. No predictive claim is made without sufficient sample size, complete data, and pre-registered controls." };
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`); console.log(JSON.stringify(output, null, 2));
}
module.exports = { validateTokens, counts, summarize, scanGroup, compareGroups };
if (require.main === module) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
