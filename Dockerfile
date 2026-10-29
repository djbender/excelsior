FROM node:26-slim AS build

# Non-root throughout: pnpm goes in the node user's home, not a global prefix.
# (Node 25+ no longer ships corepack.)
USER node
ENV PATH=/home/node/pnpm/node_modules/.bin:$PATH
RUN npm install --prefix /home/node/pnpm pnpm@12.8.1
WORKDIR /home/node/repo
# Lockfile-only layer: store download cached until deps change.
COPY --chown=node:node pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY --chown=node:node . .
# Drop dev node_modules in the same RUN so the per-push layer stays small.
# --prefer-offline, not --offline: the supply-chain policy check needs registry
# metadata, which fetch doesn't cache. Tarballs still come from the store.
RUN pnpm install --prefer-offline --frozen-lockfile --ignore-scripts \
 && pnpm nx run @djbender/macro-check:prune --configuration=production \
 && cd apps/macro-check/dist \
 && pnpm install --prefer-offline --prod --frozen-lockfile \
 && cd /home/node/repo \
 && rm -rf node_modules apps/*/node_modules libs/*/node_modules .nx


FROM node:26-slim

USER node
WORKDIR /home/node/app
COPY --from=build --chown=node:node /home/node/repo/apps/macro-check/dist ./
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5000 TRUST_PROXY=1
EXPOSE 5000
CMD ["node", "main.js"]
