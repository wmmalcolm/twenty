# syntax=docker/dockerfile:1
FROM node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203
WORKDIR /app
COPY package.json yarn.lock .yarnrc.yml tsconfig.base.json nx.json ./
COPY .yarn/releases .yarn/releases
COPY .yarn/patches .yarn/patches
COPY packages/twenty-server/package.json packages/twenty-server/package.json
COPY packages/twenty-server/patches packages/twenty-server/patches
COPY packages/twenty-shared/package.json packages/twenty-shared/package.json
COPY packages/twenty-emails/package.json packages/twenty-emails/package.json
COPY packages/twenty-client-sdk/package.json packages/twenty-client-sdk/package.json
ENV NX_DAEMON=false NX_ISOLATE_PLUGINS=false NODE_OPTIONS=--max-old-space-size=4096
# The optional mount supplies only this cloud build's CA trust, never baked into an image.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    YARN_HTTP_PROXY="$HTTP_PROXY" YARN_HTTPS_PROXY="$HTTPS_PROXY" YARN_ENABLE_IMMUTABLE_INSTALLS=true node .yarn/releases/yarn-4.13.0.cjs workspaces focus twenty twenty-server twenty-shared twenty-emails twenty-client-sdk
COPY --chown=node:node . .
RUN bash infra/lbt/desktop/build.sh && mkdir -p /data/storage && chown -R node:node /data
ENV NODE_ENV=development NODE_PORT=4320 SERVER_URL=http://127.0.0.1:4320 FRONTEND_URL=http://127.0.0.1:4330 \
    TELEMETRY_ENABLED=false ANALYTICS_ENABLED=false EMAIL_DRIVER=LOGGER IS_CONFIG_VARIABLES_IN_DB_ENABLED=false \
    IS_BILLING_ENABLED=false IS_EMAIL_VERIFICATION_REQUIRED=false SIGN_IN_PREFILLED=false LOG_LEVELS=error,warn \
    IS_ONBOARDING_AI_CHAT_ENABLED=false STORAGE_TYPE=local STORAGE_LOCAL_PATH=/data/storage \
    REDIS_URL=redis://127.0.0.1:56379 APP_VERSION=499a6474d2b2934659677d46a9c40fa881c5f94f
USER node
ENTRYPOINT ["node","infra/lbt/desktop/entry.cjs"]
