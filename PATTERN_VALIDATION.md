# Weaver wallet-pattern validation

## Stage 1: verify the PEPE gold-standard wallets

The verifier is deliberately Ethereum-specific and fails closed when block lookup, pagination, transaction status, sender identity, or transfer data is incomplete.

```bash
node scripts/pattern-check-v2.js --output gold-pattern-check-v2.json
```

A wallet enters `verifiedWallets` only when at least one transaction is classified as `CONFIRMED_DEX_BUY`.

A confirmed buy requires:

- successful transaction status;
- wallet is the transaction sender;
- target-token inflow;
- quote-asset outflow;
- known fungible-token router;
- provider-decoded `Swap` event when available.

Other classifications are `LIKELY_DEX_BUY`, `TRANSFER_ONLY`, `AIRDROP_OR_DISTRIBUTION`, and `UNCLASSIFIED`. Incomplete pages never qualify a wallet.

## Stage 2: cross-token test and negative controls

Prepare a token manifest. Each non-PEPE token needs its own pre-registered window:

```json
[
  {
    "symbol": "LINK",
    "address": "0x514910771af9ca656af840dff83e8264ecf986ca",
    "windowStart": "2026-01-01",
    "windowEnd": "2026-01-08",
    "pumpDay": "2026-01-08"
  }
]
```

Prepare an independently selected control-wallet file, one address per line, or a JSON list. Controls must not overlap the verified wallets.

```bash
node scripts/pattern-check-stage2.js \
  --verified-output gold-pattern-check-v2.json \
  --tokens stage2-tokens.json \
  --control-wallets control-wallets.txt \
  --output gold-pattern-check-stage2.json
```

Stage 2 reports confirmed-buy and probable-buy rates for the verified-wallet group versus the control group. It is descriptive validation only; it does not calculate statistical significance or authorize trading.

## Test and operational safeguards

```bash
npm run test:pattern
node --check scripts/pattern-check-v2.js
node --check scripts/pattern-check-stage2.js
```

Do not commit generated JSON results containing wallet histories unless they are intentionally part of the audit record. Run against a rate-limited provider and preserve the exact manifest, code version, API endpoint, and run timestamp with every result.
