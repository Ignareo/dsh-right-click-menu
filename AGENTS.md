# Agent notes

This repository is a single DSH plugin package that is also a profile bundle.
There is no build step: the files in the repository are the files DSH loads.

It is an independent merged edition of two MIT upstream plugins. Read
`NOTICE.md` before changing attribution, and `COMPARISON.md` for the design
rationale.

## Install and verify

```
plugin_manager  action: install_bundle  target: github:Ignareo/dsh-right-click-menu
```

Shell equivalent (DSH quit first):

```sh
dsh plugin --profile <profile> add github:Ignareo/dsh-right-click-menu
```

Check the result's `application` field, not the logs: `applied` means live,
`restart-required` means the Host half waits for the next application start.

- **Host half** — verify with a route-backed row (复制文件内容 / 另存为…). An
  anonymous probe of `/dsh-right-click-menu/ping` is answered by the connection
  fence before routing (`401` on a per-route-fenced deployment, `403` when the
  whole server is gated). An unknown path under the prefix answers `404`, which
  is how you tell "route mounted" from "not mounted".
- **Browser half** — `check:live` reproduces the artifact revision and compares
  the served bytes. For tarball installs it resolves the profile's installed copy
  automatically; for `link:` installs the working copy is the served file.
- **Both halves** — exercise the UI: right-click a file-tree row, a file path in
  a chat message, a workspace project row, and a hyperlink.

```sh
npm test              # 141 dependency-free checks (client 107 + host 34)
npm run check:live    # against $DSH_WEB_URL, or pass a base URL as argv[2]
```

## Invariants

- `package.json` `name` == the `cordis.patch.yml` row `name` == the `id` in
  `lib/client.js`'s `window.__ModuleLoader__.load({ id })`. Change one and the
  browser half loads without registering itself.
- `dsh.bundle.patch` and `exports["./client"]` are both required: the first makes
  the package installable, the second gives it a browser half.
- The browser half requires only platform seed modules (`react`,
  `react/jsx-runtime`, `@deepseek-ai/dsh-client-ui-primitives`) and reaches DSH
  through `ctx`. Do not add an import of another `@deepseek-ai/*` package.
- Every nested Remote namespace is bound once, per namespace, through a scoped
  injection (`ctx.inject(["remote", "remote.workspaceFiles"], …)`). Property
  access such as `ctx.remote.workspaceFiles` throws without it.
- The Host half imports Node built-ins only, and every route asks
  `connection.requestRejection` first, then validates method, media type, a
  64 KiB body ceiling, and absolute-path fields. Keep it that way.
- Detection markers (`data-files-*`, `data-row-key`, `data-ref-chip`,
  `data-path-label`, `data-review-file`) are **not** published DSH APIs. When
  DSH changes them, extend the fake DOM fixtures in
  `test/detection.test.mjs` and the matcher, then re-run the suite.
- A right-click is only claimed when a target resolves. Anything else must keep
  the page's native menu; surfaces that own their own context menu are listed in
  `ownsContextMenu`.

## Where things live

| File | Role |
|---|---|
| `lib/client.js` | browser half: `apply`, contextmenu listener, menu rows, actions |
| `lib/index.js` | host half: `/dsh-right-click-menu` routes |
| `test/detection.test.mjs` | loads the real bundle, extracts `//#region` helpers, drives the listener |
| `test/host.test.mjs` | mounts the host half against a stub composition and a temp dir |
| `scripts/live-bundle.mjs` | artifact-revision live check |
| `COMPARISON.md` | upstream comparison and merge decisions |

## Editing rules

- Keep both halves dependency-free; no npm dependencies, no build tooling.
- Add a test for behavior changes. Menu rows are asserted through `buildItems`;
  new surfaces need a fake-DOM case in section `[7]` of the client suite.
- Do not bump the version without updating `CHANGELOG.md`.
- Do not commit `node_modules`, `*.tgz`, or machine-specific absolute paths.
