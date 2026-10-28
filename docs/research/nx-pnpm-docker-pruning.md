# Nx + pnpm Docker builds: prune, then install in `dist`

How `Dockerfile` builds a slim runtime image from this pnpm/Nx monorepo, why it
installs dependencies twice, and how its layers are arranged for CI caching.

## The pattern

```
root install (all deps) → nx prune → pnpm install --prod inside dist → runtime stage copies dist only
```

1. **Root install.** `pnpm install` at the workspace root installs everything,
   dev deps included (nx, webpack, swc, vitest…). It exists only so the build can run.
2. **`nx run @djbender/macro-check:prune`.** A `nx:noop` target that depends on:
   - `@nx/js:prune-lockfile`: writes a minimal `package.json`, a pruned
     `pnpm-lock.yaml`, a settings-only `pnpm-workspace.yaml`, and any
     `patches`/`local_path_modules` into `apps/macro-check/dist/`.
   - `@nx/js:copy-workspace-modules`: copies `workspace:*` libraries
     (`@djbender/macro-detection`) into `dist/workspace_modules/` and rewrites
     their references to `file:` paths.
     Both depend on `build`, so `dist/main.js` exists by then.
3. **`pnpm install --prod` inside `dist`.** Because `dist` now has its own
   package manifest and lockfile, it installs as a standalone project and gets
   its own prod-only `node_modules`.
4. **Runtime stage** copies `apps/macro-check/dist` and nothing else.

### Why a second install?

The root `node_modules` can't be shipped. It contains every dev dependency, and
its entries are symlinks into the root `node_modules/.pnpm` virtual store, so
copying a subset of it breaks resolution. The prune step produces a
self-contained project, and the second install gives it a correct, minimal
`node_modules`.

## Layer caching for CI

CI builds with `docker/build-push-action` and `cache-to: type=gha,mode=max`.
Baseline before the caching changes (run 40778158384): **~70s docker job**,
**36s** of it exporting cache, **14s** install + prune.

The cost was layer ordering. `COPY . .` came before `pnpm install`, so every
push produced a new layer containing the full dev `node_modules`, and `mode=max`
uploaded it to the GHA cache every time.

Current layout:

```dockerfile
COPY --chown=node:node pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch                       # store download; cached until the lockfile changes
COPY --chown=node:node . .
RUN pnpm install --prefer-offline --frozen-lockfile --ignore-scripts \
 && pnpm nx run @djbender/macro-check:prune --configuration=production \
 && cd apps/macro-check/dist \
 && pnpm install --prefer-offline --prod --frozen-lockfile \
 && cd /home/node/repo \
 && rm -rf node_modules apps/*/node_modules libs/*/node_modules .nx
```

- **`pnpm fetch`** needs only the lockfile. Its layer (the package store)
  changes only when dependencies change, so source edits reuse it.
- **`--prefer-offline`, not `--offline`.** pnpm's supply-chain policy check
  needs registry metadata, which `fetch` doesn't cache. `--offline` fails with
  `ERR_PNPM_NO_OFFLINE_META`. `--prefer-offline` fetches the small metadata
  and takes tarballs from the store.
- **`--ignore-scripts`** on the root install. `allowBuilds` in
  `pnpm-workspace.yaml` already disables build scripts for the native deps, and
  the root `package.json` has no lifecycle scripts, so the build doesn't need any.
- **`rm -rf` in the same `RUN`.** Dev `node_modules` never land in a layer, so the
  layer that changes on every push is mostly `dist`, and the cache export stays small.

## Alternative: `pnpm deploy`

```sh
pnpm --filter @djbender/macro-check --prod deploy /out
```

pnpm's built-in for the same job: copies a workspace package into a directory
and installs its prod deps (workspace deps included) there. Since pnpm 12.2 it
no longer requires `injectWorkspacePackages`.

Not adopted here:

- It copies the files `pnpm pack` would include (`files`, `.npmignore`,
  `.gitignore`), not the Nx build output. `package.json` would need
  `files`/`main` pointed at `dist/main.js`.
- It makes the `prune`, `prune-lockfile` and `copy-workspace-modules` targets
  dead code.
- It doesn't make the build any faster. The time goes to cache export, not
  the install.

## Sources

- [Nx: Prepare Applications for Deployment via CI](https://nx.dev/docs/guides/ci-deployment)
- [Nx: Pruning Projects for Deployment](https://nx.dev/docs/technologies/node/guides/deploying-node-projects)
- [Nx: @nx/js Executors](https://nx.dev/docs/technologies/typescript/executors)
- [Nx: @nx/js Migrations](https://nx.dev/docs/technologies/typescript/migrations) (pnpm outputs for `prune-lockfile`, Nx 23.2+)
- [pnpm deploy](https://pnpm.io/cli/deploy)
- [pnpm: Working with Docker](https://pnpm.io/docker)
- [pnpm fetch](https://pnpm.io/cli/fetch)
