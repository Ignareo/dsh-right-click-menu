# NOTICE — third-party attribution

`dsh-right-click-menu` (this repository) is an independent, merged edition. It is **not**
affiliated with, endorsed by, or a fork of either upstream project below.

## Upstream projects

| Project | Source | License | What this repository takes from it |
|---|---|---|---|
| `dsh-right-click-menu@0.3.1` | https://github.com/AL1ghtm3ter/dsh-right-click-menu | MIT, Copyright (c) 2026 AL1ghtm3ter | Functional base: the browser-half architecture, host half (stat/read/raw/save-as routes), file/link menu matrix, primitives `Menu`/`Toast` usage, i18n key set, `locale/*.json` card metadata |
| `dsh-right-click-menu@0.1.0` | https://github.com/SJcun/dsh-right-click-menu | MIT, Copyright (c) 2026 3n | Detection surfaces for left-sidebar workspace project rows, file-tree root, `@` reference chips; path normalization (`@`, quotes, `#L` line anchors); the shipped-bundle test harness approach and the `check:live` artifact-revision reproduction |

Both upstreams are distributed under the MIT License. Their copyright notices are
retained in `LICENSE`.

## Changes made in this repository

- Merged the two surface sets and added detection for `[data-path-label]` and
  `[data-review-file]`.
- Added the test suites (`test/detection.test.mjs`, `test/host.test.mjs`, 141 checks)
  and the live-bundle check.
- Removed the unused `/write-text` host route; hardened `/raw` (opaque bytes +
  `nosniff`, 64 MiB ceiling) and `/read` (1 MiB bounded read); stripped URL
  credentials before external navigation.
- Fixed defects found in both upstreams (toast re-keying, quoted paths with
  spaces, code-block right-click hijacking, absolute-path Remote fallback,
  link headers, credential handling).

See `CHANGELOG.md` and `COMPARISON.md` for details.

## DeepSeek Harness

This package plugs into DeepSeek Harness (DSH) through its public plugin
interfaces. No DSH source code is copied into this repository. DSH itself is
distributed under its own licenses; DSH packages this plugin interoperates with
are mixed MIT / BSD-3-Clause, but none of their code is vendored here.

## Trademarks

"DeepSeek", "DeepSeek Harness", and "DSH" belong to their respective owners. The
names are used only to describe compatibility.
