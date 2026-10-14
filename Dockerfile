FROM node:26-slim AS build

# Non-root throughout: pnpm goes in the node user's home, not a global prefix.
# (Node 25+ no longer ships corepack.)
USER node
ENV PATH=/home/node/pnpm/node_modules/.bin:$PATH
RUN npm install --prefix /home/node/pnpm pnpm@12.8.1
WORKDIR /home/node/repo
COPY --chown=node:node . .
RUN pnpm install --frozen-lockfile \
 && pnpm nx run @djbender/macro-check:prune --configuration=production \
 && cd apps/macro-check/dist \
 && pnpm install --prod --frozen-lockfile


FROM node:26-slim

USER node
WORKDIR /home/node/app
COPY --from=build --chown=node:node /home/node/repo/apps/macro-check/dist ./
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5000
EXPOSE 5000
CMD ["node", "main.js"]
