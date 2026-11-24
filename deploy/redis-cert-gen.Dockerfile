# One-shot init container: generates the Redis TLS certificate material
# consumed by the redis, proxy and backup services in
# docker-compose.prod.yml. See deploy/redis-cert-gen.sh.
#
# server/config.js enforces rediss:// (TLS) for REDIS_URL in production;
# this container makes that possible for a self-contained Compose stack.
FROM alpine:3.20

RUN apk add --no-cache openssl

COPY deploy/redis-cert-gen.sh /usr/local/bin/redis-cert-gen.sh
ENTRYPOINT ["/usr/local/bin/redis-cert-gen.sh"]
