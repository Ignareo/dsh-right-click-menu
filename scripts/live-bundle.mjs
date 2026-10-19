/**
 * Live check: is the running DSH Host actually serving this plugin's bundle?
 *
 * Reproduces `artifactRevision` from `@deepseek-ai/dsh-client-modules`
 * (`framedHash("plugin-artifact", [mtimeMs, ctimeMs, size])`), builds the combo
 * route `/plugins/??<id>/client.js&rev=<rev>`, and asserts the response starts
 * with this package's bytes on disk. Any difference means the page is running
 * stale code.
 *
 * The revision is derived from the file the Host actually serves — normally the
 * copy installed under the profile's `node_modules`, which is **not** the
 * working copy when the plugin was installed from a tarball. So the script
 * looks for an installed copy of this package in the profile and uses it when
 * its bytes match the working copy; otherwise it falls back to the package in
 * this checkout (the `link:` install shape, where both are the same file).
 *
 * Usage:
 *   node scripts/live-bundle.mjs [baseUrl]
 *
 * `baseUrl` defaults to `$DSH_WEB_URL`, then to http://127.0.0.1:19387. The
 * plugin id and client path come from this package's own package.json, so the
 * script stays correct if the package is renamed or moved. The bundle route
 * needs no authentication on a loopback Web carrier.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const clientExport = manifest.exports?.["./client"];
const clientPath = typeof clientExport === "string" ? clientExport : clientExport?.default;
if (typeof clientPath !== "string") {
  console.error('package.json has no string exports["./client"]');
  process.exit(1);
}
const ID = manifest.name;
const LOCAL_BUNDLE = fileURLToPath(new URL(clientPath, new URL("../", import.meta.url)));
const BASE = (process.argv[2] ?? process.env.DSH_WEB_URL ?? "http://127.0.0.1:19387").replace(/\/+$/, "");

/** sha1 over a domain tag and length-framed fields; 12 hex chars. */
function framedHash(domain, parts) {
  const hash = createHash("sha1").update(domain).update("\0");
  for (const part of parts) hash.update(`${String(Buffer.byteLength(part))}:`).update(part);
  return hash.digest("hex").slice(0, 12);
}

/** The installed copy of this package, when the profile has one. */
function installedBundles() {
  const relative = clientPath.replace(/^\.\//, "");
  const roots = [];
  if (process.env.DSH_PROFILE_DIR) roots.push(process.env.DSH_PROFILE_DIR);
  const profiles = `${homedir()}/.dsh/profiles`;
  if (process.env.DSH_PROFILE) roots.push(`${profiles}/${process.env.DSH_PROFILE}`);
  for (const name of ["desktop", "web", "tui", "headless"]) roots.push(`${profiles}/${name}`);
  return roots
    .map((root) => `${root}/node_modules/${ID}/${relative}`)
    .filter((path) => existsSync(path));
}

const localBytes = readFileSync(LOCAL_BUNDLE, "utf8");
// The Host's revision is a stat fact of the file it loads. Prefer an installed
// copy whose content is byte-identical to this checkout.
const candidates = installedBundles()
  .map((path) => ({ path, stat: statSync(path), bytes: readFileSync(path, "utf8") }))
  .filter((candidate) => candidate.bytes === localBytes)
  .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
const served = candidates[0] ?? { path: LOCAL_BUNDLE, stat: statSync(LOCAL_BUNDLE) };
const rev = framedHash("plugin-artifact", [
  String(served.stat.mtimeMs),
  String(served.stat.ctimeMs),
  String(served.stat.size)
]);

console.log(`package  : ${manifest.name}@${manifest.version}  (${PACKAGE_DIR})`);
console.log(`bundle   : ${served.path}`);
if (served.path !== LOCAL_BUNDLE) console.log(`checkout : ${LOCAL_BUNDLE} (same bytes)`);
console.log(`size     : ${served.stat.size}`);
console.log(`rev      : ${rev}`);

const url = `${BASE}/plugins/??${ID}/client.js&rev=${rev}`;
console.log(`GET      : ${url}`);

let response;
try {
  response = await fetch(url);
} catch (error) {
  console.error(`request failed: ${error.message}`);
  console.error("Is the DSH Web GUI running at that address? Pass one as the first argument.");
  process.exit(1);
}
console.log(`status   : ${response.status} ${response.statusText}`);
if (!response.ok) {
  console.error("the Host does not serve this revision — the plugin may not be enabled in the profile");
  console.error("(is the profile the one this checkout is installed in? pass the GUI base URL as the first argument)");
  process.exit(1);
}

const body = await response.text();
console.log(`served   : ${Buffer.byteLength(body)} bytes`);
console.log(`local    : ${Buffer.byteLength(localBytes)} bytes`);
// A combo response appends the composition terminator and a source-map trailer.
const trailer = body.slice(localBytes.length);
console.log(`trailer  : ${JSON.stringify(trailer)}`);
if (!body.startsWith(localBytes)) {
  console.error("served bytes differ from the file on disk — the page is running stale code");
  process.exit(2);
}
console.log("ok — the running Host serves this exact bundle");
