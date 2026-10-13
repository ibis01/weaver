const fs = require('fs');
const v2 = require('../pattern-check-v2.js');
const cand = require('../../data/wallet-pool-gold-standard-v2-candidates.json');

const PEPE = v2.PEPE;
const WINDOW_START = '2026-08-12';
const PUMP_DAY = '2026-08-19';

// Known block numbers from the earlier successful find-pepe-buyers run.
// No getblocknobytime calls needed; the cache pre-populates.
const KNOWN_BLOCKS = {
  '2026-08-12': { block: 25735200, exact: true },
  '2026-08-19': { block: 25785424, exact: true },
};

// Exclude known routers/aggregators that received PEPE from the pair
// and forwarded it. These aren't individual buyers.
const ROUTER_ADDRESSES = new Set(Object.keys(v2.ROUTERS).map(a => a.toLowerCase()));

async function main() {
  const results = [];
  for (const c of cand.candidates) {
    const addr = c.address.toLowerCase();
    if (ROUTER_ADDRESSES.has(addr)) {
      process.stderr.write('skip router ' + addr.slice(0, 10) + '\n');
      results.push({ address: c.address, status: 'SKIPPED_ROUTER', confirmed: false, probable: false });
      continue;
    }
    process.stderr.write('verifying ' + addr.slice(0, 10) + '...\n');

    const blockCache = new Map();
    blockCache.set(WINDOW_START, KNOWN_BLOCKS[WINDOW_START]);
    blockCache.set(PUMP_DAY, KNOWN_BLOCKS[PUMP_DAY]);

    const r = await v2.reVerifyWallet(c.address, PEPE, WINDOW_START, PUMP_DAY, { blockCache });
    const counts = {};
    if (r.status === 'COMPLETE') {
      for (const g of r.graded) {
        counts[g.classification] = (counts[g.classification] || 0) + 1;
      }
    }
    const rec = {
      address: c.address,
      status: r.status,
      classifications: counts,
      confirmed: (counts.CONFIRMED_DEX_BUY || 0) > 0,
      probable: (counts.CONFIRMED_DEX_BUY || 0) + (counts.LIKELY_DEX_BUY || 0) > 0,
    };
    results.push(rec);
    process.stderr.write('  ' + JSON.stringify(rec) + '\n');
  }
  const confirmed = results.filter(r => r.confirmed);
  const probable = results.filter(r => r.probable);
  console.log(JSON.stringify({
    version: 'gold-standard-v2-verification',
    ranAt: new Date().toISOString(),
    totalCandidates: results.length,
    confirmedCount: confirmed.length,
    probableCount: probable.length,
    confirmedWallets: confirmed.map(r => r.address),
    results,
  }, null, 2));
}
main().catch(e => { console.error(e.stack || e); process.exit(1); });
