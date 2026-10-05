# Weaver production deployment

## Stack

`docker-compose.prod.yml` runs three services:

- `web`: read-only Nginx frontend on port 8080;
- `proxy`: non-root Node proxy with `/health` and `/ready` checks;
- `worker`: non-root autonomous meme snapshot collector.

Redis is intentionally external. Configure a managed TLS Redis URL through the deployment secret manager; production refuses non-TLS or missing Redis configuration.

## Deploy

```bash
cp .env.example .env
# Replace every example value, especially REDIS_URL, ALLOWED_ORIGINS,
# TRUST_PROXY_HOPS, and ALERT_WEBHOOK_URL.
chmod 600 .env
docker compose --env-file .env -f docker-compose.prod.yml config
docker compose --env-file .env -f docker-compose.prod.yml build --pull
docker compose --env-file .env -f docker-compose.prod.yml up -d

docker compose --env-file .env -f docker-compose.prod.yml ps
curl -fsS http://127.0.0.1:${WEB_PORT:-8080}/health
```

Put a TLS-terminating edge proxy or load balancer in front of the bound web port. Set `ALLOWED_ORIGINS` to the public HTTPS origin and set `TRUST_PROXY_HOPS` to the exact number of trusted reverse-proxy hops.

## Operational checks

```bash
docker compose --env-file .env -f docker-compose.prod.yml logs --tail=100 proxy worker
docker compose --env-file .env -f docker-compose.prod.yml exec proxy wget -qO- http://127.0.0.1:3001/ready
```

The snapshot worker remains an alerting and historical-data service. It does not place trades, custody assets, or automatically execute orders. Keep opportunity notifications in paper-alert mode until the calibration dataset has enough out-of-sample observations.
