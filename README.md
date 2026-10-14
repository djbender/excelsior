# Excelsior: spreadsheet macro checker

A single-use internal tool. Upload one or more spreadsheets and get back
**ACCEPTED** (no macros) or **REJECTED** (macros found, or the file could not be
verified), with the reasons.

The rule is to reject files that actually _contain_ macros, not files whose
format merely _can_ hold them. A clean `.xlsm`, `.xlsb` or `.xls` is accepted.

## Quick start

Requires Node and pnpm.

```sh
pnpm install
pnpm serve
```

Then open <http://localhost:3000> and drop files on the page.

The server binds to `localhost` by default, has no auth of its own, and keeps
uploads in memory. Nothing is written to disk or persisted, and file contents
are never logged. Set `PORT` to change the port and `HOST` to change the
interface; if you expose it beyond localhost, put authentication in front.

## Deployment (Dokku)

The root `Dockerfile` builds a production image that runs as a non-root user on
`HOST=0.0.0.0`, `PORT=5000`. The app has no auth, so nginx basic auth plus TLS
protect it. Run these once on the Dokku host, then deploy by pushing:

```sh
dokku apps:create macro-check
dokku nginx:set macro-check client-max-body-size 55m
dokku resource:limit --memory 384m macro-check
dokku http-auth:enable macro-check <user> <pass>
dokku letsencrypt:enable macro-check
git push dokku main
```

- `client-max-body-size` sits just above the 50 MiB batch cap (nginx defaults to
  1m, which would reject real uploads).
- Uploads are held in memory. A maximum batch peaks around 150–200 MB, and only
  `[Content_Types].xml` (at most 1 MB) is ever unpacked from a zip, so memory
  scales with upload size, not with what a zip would inflate to. The 384m cap is
  a ceiling for runaways, not a reservation.
- Responses carry a CSP (the page's inline script and style are allowed by
  hash), HSTS, and the other helmet defaults.

## Layout

| Path                   | What it is                                                   |
| ---------------------- | ------------------------------------------------------------ |
| `libs/macro-detection` | Framework-free TypeScript library: `inspectSpreadsheet(buf)` |
| `apps/macro-check`     | NestJS app: the static page plus the upload endpoints        |

## HTTP API

| Endpoint                  | Body                                | Response                                    |
| ------------------------- | ----------------------------------- | ------------------------------------------- |
| `GET /`                   |                                     | The upload page                             |
| `POST /api/inspect`       | multipart, one file in field `file` | `{ verdict, reasons }`                      |
| `POST /api/inspect-batch` | multipart, files in field `files`   | `{ results: [{ name, verdict, reasons }] }` |

- A single file may be up to 25 MiB; a batch may total up to 50 MiB. Larger
  uploads get `413`.
- A missing file, or an unexpected extra file on `/api/inspect`, gets `400`.

## Library

```ts
import { inspectSpreadsheet } from '@org/macro-detection';

const result = await inspectSpreadsheet(bytes); // Uint8Array
// { verdict: 'accepted' | 'rejected', reasons: [{ code, detail }] }
```

It never throws: any failure becomes a rejected result. It has no Node-only
APIs, does no I/O, and depends on nothing else in this repo (only `jszip`).

| Reason code         | Meaning                                                     |
| ------------------- | ----------------------------------------------------------- |
| `VBA_PROJECT`       | A VBA project is present                                    |
| `XLM_MACRO_SHEET`   | An Excel 4.0 (XLM) macro sheet is present                   |
| `ENCRYPTED`         | Password-protected, so the contents can't be checked        |
| `UNPARSEABLE`       | Damaged or malformed, so it can't be verified               |
| `NOT_A_SPREADSHEET` | Not an Excel workbook (for example a `.docx` or a PDF)      |
| `LIMIT_EXCEEDED`    | Over a safety limit (25 MB input, 10,000 ZIP entries, etc.) |

### How detection works

- **OOXML** (`.xlsx`, `.xlsm`, `.xlsb`, `.xlam`, `.xltm`): a ZIP. Parts are
  judged by their content type from `[Content_Types].xml` (Override, then
  Default), never by folder or file name. Entries are read with caps on size and
  count, and the central directory is walked directly (ZIP64-aware) so a ZIP
  whose headers disagree is reported as unparseable.
- **OLE2** (legacy `.xls`, encrypted packages): a small in-repo, read-only,
  bounded compound-file reader plus a BIFF record scanner. It looks for VBA
  storages, the `OBPROJ` record, VB module sheets, Excel 4.0 macro sheets and
  the `FilePass` (encryption) record.

### Known limitation

The content-types parser is a regex. It handles attribute order and quote
style, but not namespace-prefixed (`ns0:`) or UTF-16 manifests. Such files are
rejected (a false rejection, not a false acceptance). A manifest mixing
prefixes could in theory hide a macro part; this is untested.

## Development

| Command          | Does                                                         |
| ---------------- | ------------------------------------------------------------ |
| `pnpm serve`     | Dev server with file watching (no Nx TUI)                    |
| `pnpm all`       | Format check, typecheck, lint, test and build: the full gate |
| `pnpm format`    | Format with Prettier                                         |
| `pnpm typecheck` | Typecheck every project                                      |
| `pnpm lint`      | Lint every project                                           |
| `pnpm test`      | Run the Vitest suites                                        |
| `pnpm build`     | Build every project                                          |

Tests are Vitest. The app's integration tests use supertest against the real
`AppModule`.

### Fixtures

`libs/macro-detection/src/test-support/fixtures/` holds real files made by
Microsoft Excel and Word, not hand-faked ones. `README.md` in that folder
records where each came from, and `libs/macro-detection/scripts/` has the
AppleScript that regenerates them (macOS with Excel and Word installed).
Hostile inputs (ZIP64, zip bombs, corrupt CFB/BIFF) are built in code by the
helpers in `src/test-support/` and are never expanded.
