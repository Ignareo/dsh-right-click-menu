# Changelog

## 0.4.0 — merged edition

First release of the independent merged edition. Functional base:
`AL1ghtm3ter/dsh-right-click-menu@0.3.1`; surfaces and test approach:
`SJcun/dsh-right-click-menu@0.1.0`. Both MIT, attributed in `NOTICE.md`.

### Added

- Left-sidebar Workspace project-row right-click (`data-row-key="workspace:<id>"`),
  resolved through the client Workspace list.
- Right-sidebar file-tree root/header (`data-files-root`) right-click.
- `@file` / `@folder` reference chip right-click (`data-ref-chip`), including
  quoted paths with spaces.
- Rendered path-label spans (`data-path-label`) and changed-files review rows
  (`data-review-file`).
- Delivery-card / path-label buttons whose tooltip spells an absolute path.
- Zero-dependency test suites: 107 client checks (bundle shape, `apply`
  registrations, pure helpers, menu construction, and the real `contextmenu`
  listener driven across every surface) plus 34 host-half checks (routes, trust
  fence, method/media-type/body-ceiling validation, real temp-file round trips).
- `scripts/live-bundle.mjs` live check, aware of tarball installs (resolves the
  profile's installed copy for the artifact revision).
- `AGENTS.md`, `NOTICE.md`, `CHANGELOG.md`, and a GitHub Actions test workflow.
- `icon` manifest field.

### Changed

- Path candidates strip a leading `@`, wrapping quotes, and a `#L24-L30` line
  anchor before classification.
- Absolute paths that the local Host cannot see fall back to the Session's
  `workspaceFiles` Remote, so remote/SSH workspaces resolve.
- Links that name a file now head their menu with the file name instead of the
  URL host.
- External opens strip URL credentials (userinfo) before handing the URL to the
  system browser or the sidebar tab.

### Fixed

- Toast notices now advance the store sequence, so a second notice remounts and
  gets its own dismiss timer.
- Quoted paths containing spaces are classified again.
- Fenced code blocks (`<pre>`) keep their native right-click menu; arbitrary
  inline-code tokens are no longer treated as paths.
- Non-file chips (session/skill/command) are no longer claimed by an ancestor's
  file-looking tooltip.
- Prose tokens that do not resolve no longer raise a "not found" toast.
- `notify` no longer leaves stale notices stuck on screen.

### Security

- Removed the unused `POST /write-text` route (arbitrary file write primitive).
- `/raw` serves `application/octet-stream` with `x-content-type-options: nosniff`
  and a 64 MiB ceiling; it can no longer be rendered as same-origin HTML/SVG.
- `/read` reads at most 1 MiB instead of buffering the whole file.
- Request bodies are rejected from their declared `Content-Length` before
  reading; 500 responses no longer echo host error messages.
