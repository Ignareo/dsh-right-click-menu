/**
 * Dependency-free test harness for the host half (`lib/index.js`).
 *
 * Run with `npm test` (the package script runs this file after the client
 * harness). The host half is plain ESM that Cordis loads at application start,
 * so this file mounts it against a stub composition — a `webServer` that records
 * routes and a `connection` fence that can be told to reject — then calls each
 * route with small request/response fakes and a real temporary directory.
 *
 * It asserts both the happy path and the fences: trust rejection, method,
 * media type, body ceiling, and absolute-path validation.
 */
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync, ftruncateSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply } from "../lib/index.js";

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
  else console.log(`  ok  ${name}`);
};
const checkTrue = (name, actual) => check(name, actual === true, true);

const ROOT = mkdtempSync(join(tmpdir(), "rcm-host-"));
const FILE = join(ROOT, "note.txt");
const SAVED = join(ROOT, "saved", "copy.txt");
writeFileSync(FILE, "hello host\n", "utf8");
const BIG = join(ROOT, "big.txt");
writeFileSync(BIG, "x".repeat(1024 * 1024 + 16), "utf8");
const HUGE = join(ROOT, "huge.bin");
const hugeHandle = openSync(HUGE, "w");
ftruncateSync(hugeHandle, 65 * 1024 * 1024);
closeSync(hugeHandle);

// ---------------------------------------------------------- stub composition ---
const routes = new Map();
let rejection = undefined;
const scope = {
  connection: {
    requestRejection: () => rejection
  },
  webServer: {
    register(route) {
      routes.set(route.path, route);
      return () => {};
    }
  },
  effect(callback) {
    return callback();
  }
};
const injected = [];
const ctx = {
  inject(dependencies, callback) {
    injected.push(dependencies);
    callback(scope);
  }
};
apply(ctx);

const respond = (route, request) => {
  const state = { status: undefined, headers: {}, body: undefined };
  const res = {
    statusCode: 200,
    setHeader(name, value) {
      state.headers[name.toLowerCase()] = value;
    },
    end(value) {
      state.status = state.status ?? res.statusCode;
      state.body = value;
    }
  };
  return (async () => {
    await route.handler(request, res);
    // `end` is what commits the status; a handler that only sets statusCode
    // still reports through the response object.
    return { status: res.statusCode, ...state };
  })();
};

const makeRequest = (method, url, body, headers = {}) => {
  const chunks = body === undefined ? [] : [Buffer.from(body)];
  return {
    method,
    url,
    headers,
    resume() {},
    [Symbol.asyncIterator]: async function* iterator() {
      for (const chunk of chunks) yield chunk;
    }
  };
};

const call = (path, method, { url = path, body, headers = {} } = {}) => {
  const route = routes.get(path);
  if (route === undefined) throw new Error(`no route registered for ${path}`);
  return respond(route, makeRequest(method, url, body, headers));
};
const jsonRequest = (payload) => ({
  body: JSON.stringify(payload),
  headers: { "content-type": "application/json; charset=utf-8" }
});
const readJson = (response) => JSON.parse(String(response.body));

// ------------------------------------------------------------------ surface ---
console.log("\n[1] mount surface");
check("scoped injection asks for webServer and connection", injected[0], ["webServer", "connection"]);
check("route count", routes.size, 5);
check(
  "routes",
  [...routes.keys()].sort(),
  [
    "/dsh-right-click-menu/ping",
    "/dsh-right-click-menu/raw",
    "/dsh-right-click-menu/read",
    "/dsh-right-click-menu/save-as",
    "/dsh-right-click-menu/stat"
  ]
);
checkTrue("the unused arbitrary-write route is not mounted", !routes.has("/dsh-right-click-menu/write-text"));

// -------------------------------------------------------------- trust fence ---
console.log("\n[2] trust fence");
rejection = 401;
const rejected = await call("/dsh-right-click-menu/ping", "GET");
check("fence status", rejected.status, 401);
check("fence body", rejected.body, undefined);
rejection = undefined;

// -------------------------------------------------------------------- /ping ---
console.log("\n[3] GET /ping");
const ping = await call("/dsh-right-click-menu/ping", "GET");
check("ping status", ping.status, 200);
check("ping payload", readJson(ping), { ok: true, service: "right-click-menu", version: 1 });
check("ping rejects POST", (await call("/dsh-right-click-menu/ping", "POST")).status, 405);

// -------------------------------------------------------------------- /stat ---
console.log("\n[4] POST /stat");
const stat = await call("/dsh-right-click-menu/stat", "POST", jsonRequest({ path: FILE }));
check("stat status", stat.status, 200);
check("stat reports a file", [readJson(stat).exists, readJson(stat).kind], [true, "file"]);
check(
  "stat reports a missing path",
  readJson(await call("/dsh-right-click-menu/stat", "POST", jsonRequest({ path: join(ROOT, "gone.txt") }))).exists,
  false
);
check("stat rejects a relative path", (await call("/dsh-right-click-menu/stat", "POST", jsonRequest({ path: "note.txt" }))).status, 400);
check("stat rejects GET", (await call("/dsh-right-click-menu/stat", "GET")).status, 405);
check(
  "stat rejects a non-JSON body",
  (await call("/dsh-right-click-menu/stat", "POST", { body: '{"path":"/tmp/x"}', headers: { "content-type": "text/plain" } })).status,
  415
);
check(
  "stat rejects a missing field",
  (await call("/dsh-right-click-menu/stat", "POST", jsonRequest({}))).status,
  400
);
check(
  "stat rejects a body over the ceiling",
  (
    await call("/dsh-right-click-menu/stat", "POST", {
      body: JSON.stringify({ path: "/tmp/x", pad: "x".repeat(65 * 1024) }),
      headers: { "content-type": "application/json" }
    })
  ).status,
  413
);

// -------------------------------------------------------------------- /read ---
console.log("\n[5] POST /read");
const read = await call("/dsh-right-click-menu/read", "POST", jsonRequest({ path: FILE }));
check("read status", read.status, 200);
check("read text", readJson(read).text, "hello host\n");
check("read binary flag", readJson(read).binary, false);
check("read missing file", (await call("/dsh-right-click-menu/read", "POST", jsonRequest({ path: join(ROOT, "gone.txt") }))).status, 404);
check("read a directory", (await call("/dsh-right-click-menu/read", "POST", jsonRequest({ path: ROOT }))).status, 400);
const bigRead = readJson(await call("/dsh-right-click-menu/read", "POST", jsonRequest({ path: BIG })));
check("read truncates at the 1 MiB ceiling", [bigRead.truncated, bigRead.text.length], [true, 1024 * 1024]);

// --------------------------------------------------------------------- /raw ---
console.log("\n[6] GET /raw");
const raw = await call("/dsh-right-click-menu/raw", "GET", { url: `/dsh-right-click-menu/raw?path=${encodeURIComponent(FILE)}` });
check("raw status", raw.status, 200);
check("raw bytes", String(raw.body), "hello host\n");
check("raw is opaque bytes", raw.headers["content-type"], "application/octet-stream");
check("raw forbids sniffing", raw.headers["x-content-type-options"], "nosniff");
check(
  "raw refuses a file over its buffer ceiling",
  (await call("/dsh-right-click-menu/raw", "GET", { url: `/dsh-right-click-menu/raw?path=${encodeURIComponent(HUGE)}` })).status,
  413
);
check(
  "raw rejects a relative path",
  (await call("/dsh-right-click-menu/raw", "GET", { url: "/dsh-right-click-menu/raw?path=note.txt" })).status,
  400
);
check(
  "raw rejects a missing file",
  (await call("/dsh-right-click-menu/raw", "GET", { url: "/dsh-right-click-menu/raw?path=%2Ftmp%2Fno-such-file-xyz" })).status,
  404
);

// ----------------------------------------------------------------- /save-as ---
console.log("\n[7] POST /save-as");
const copy = await call("/dsh-right-click-menu/save-as", "POST", jsonRequest({ from: FILE, to: SAVED }));
check("save-as status", copy.status, 200);
check("save-as copied bytes", readFileSync(SAVED, "utf8"), "hello host\n");
check(
  "save-as rejects a missing source",
  (await call("/dsh-right-click-menu/save-as", "POST", jsonRequest({ from: join(ROOT, "gone.txt"), to: SAVED }))).status,
  404
);
check(
  "save-as rejects a relative destination",
  (await call("/dsh-right-click-menu/save-as", "POST", jsonRequest({ from: FILE, to: "copy.txt" }))).status,
  400
);

rmSync(ROOT, { recursive: true, force: true });

console.log("");
if (failures.length > 0) {
  console.error(`${failures.length} failure(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("all checks passed");
