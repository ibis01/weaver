# Weaver wallet-pattern validation

## Stage 1: verify the PEPE gold-standard wallets

The verifier is deliberately Ethereum-specific and fails closed when block lookup, pagination, transaction status, sender identity, or transfer data is incomplete.

```bash
node scripts/pattern-check-v2.js --output gold-pattern-check-v2.json
```

The default dates are only placeholders for the original study. Always confirm that the selected wallet inflows and the token price event actually fall inside the requested window. Override them when the documented event uses different dates:

```bash
node scripts/pattern-check-v2.js \
  --window-start 2026-08-15 \
  --pump-day 2026-08-22 \
  --output gold-pattern-check-v2.json
```

An empty window is a **data-quality finding**, not evidence that the wallets were not buyers. Inspect the source event date and rerun with the verified window.

The verifier sends the required JSON and user-agent headers and retries transient `403`, `429`, and `5xx` responses. If the provider requires authentication, set the key only in the shell or secret manager; never commit it:

```bash
export BLOCKSCOUT_API_KEY="..."
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

Copy the templates first, then replace every placeholder with independently documented data:

```bash
cp examples/stage2-tokens.example.json stage2-tokens.json
cp examples/control-wallets.example.txt control-wallets.txt
```

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

Do not run Stage 2 with the example placeholders. The validator rejects placeholder and malformed addresses, PEPE, empty controls, and overlap between positive and control wallets.

## Test and operational safeguards

```bash
npm run test:pattern
node --check scripts/pattern-check-v2.js
node --check scripts/pattern-check-stage2.js
```

Do not commit generated JSON results containing wallet histories unless they are intentionally part of the audit record. Run against a rate-limited provider and preserve the exact manifest, code version, API endpoint, and run timestamp with every result.
