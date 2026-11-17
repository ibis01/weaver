# Provenance — pepe-usd-daily-365d.frozen-2026-10-20.json

- **sha256**: `ae47b4e74167259b75a6d6e589e30fc608d19e6bc30ae72c168c35dea5c0100c`
- **Source**: byte-exact extraction from git blob at commit `91e002e`
  (2026-10-20 22:21:03 +0100, "gate-0c: amended v1.1 P4 NIC execution —
  amendment chain, run artifacts, independent verification"),
  path `data/prices/pepe-usd-daily-365d.json`.
- **Why frozen**: the Gate 0c NIC v1.1 artifact
  (`docs/experiments/gate-0c-nic-2026-10-21-v1.1.json`) anchors this price
  series by sha256, and the verifier's legacy-table RNG is seeded with
  `sha256('gate0c:nic:' + address + ':' + priceSha + ':' + v2blob)` — so any
  mutation of the live price file changes every legacy draw. The live file
  `data/prices/pepe-usd-daily-365d.json` is refreshed on a rolling 365-day
  window by the Gate 0d price-history pipeline (introduced 2026-11-08 in
  commit `a2bf2bd`; first rotation visible from that commit onward). Pinning
  the verifier to this frozen copy decouples Phase 0c verification from that
  pipeline permanently.
- **Independence**: this file is a verification input only. The Gate 0d
  prospective scorer continues to read the live refreshed series under
  `data/prices/` and is unaffected.
- **Recorded**: 2026-11-17, Phase 0 verifier input-pinning repair
  (fix/phase0-verifier-input-pinning-2026-11-17).
- **Original live file**: unchanged in role; both files now coexist. Do NOT
  overwrite or "re-sync" this frozen copy from the live file — it would break
  the artifact anchor chain.
