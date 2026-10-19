/**
 * Dependency-free test harness for the merged `dsh-right-click-menu`.
 *
 * Run with `npm test`. There is no framework and no build step: `lib/client.js`
 * is exactly what the DSH client module system loads, so this file evaluates
 * that bundle the same way (`window.__ModuleLoader__.load({ id, factory })`)
 * with stubbed platform modules, then exercises the shipped code.
 *
 * Two layers of coverage:
 *
 * 1. Bundle face + `apply()` registrations: the factory id, the requires it
 *    makes, the exported `inject` list, the dictionary key parity, and the
 *    `shell.overlay` slot entry.
 * 2. Pure sections extracted from the bundle by their `//#region` markers (and
 *    by brace-matched function names), fed to the same fake DOM the DSH
 *    surfaces render. The extraction is deliberate: it tests the shipped file
 *    rather than a copy, so the harness cannot drift from the bundle.
 */
import { readFileSync } from "node:fs";

const SOURCE = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

// ---------------------------------------------------------------- fake DOM ---
class FakeElement {
  constructor(tagName, attrs = {}, children = []) {
    this.tagName = tagName.toUpperCase();
    this.attrs = attrs;
    this.children = children;
    for (const child of children) if (typeof child !== "string") child.parentElement = this;
  }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }
  get textContent() {
    return this.children.map((child) => (typeof child === "string" ? child : child.textContent)).join("");
  }
  get dataset() {
    const out = {};
    for (const [key, value] of Object.entries(this.attrs)) {
      if (!key.startsWith("data-")) continue;
      const camel = key.slice(5).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
      out[camel] = value;
    }
    return out;
  }
  closest(selector) {
    for (let element = this; element instanceof FakeElement; element = element.parentElement) {
      if (matches(element, selector)) return element;
    }
    return null;
  }
  querySelector(selector) {
    for (const child of this.children) {
      if (typeof child === "string") continue;
      if (matches(child, selector)) return child;
      const nested = child.querySelector(selector);
      if (nested !== null) return nested;
    }
    return null;
  }
}

/**
 * Minimal selector matcher for the shapes the bundle actually asks for:
 * a comma list of `tag?`, `[attr]`, `[attr='value']`, `[attr*='substring']`.
 */
function matches(element, selector) {
  return selector.split(",").some((part) => matchesOne(element, part.trim()));
}
function matchesOne(element, selector) {
  const tag = /^[a-z][a-z0-9-]*/i.exec(selector)?.[0];
  if (tag !== undefined && element.tagName !== tag.toUpperCase()) return false;
  const rest = tag === undefined ? selector : selector.slice(tag.length);
  const attributePattern = /\[\s*([A-Za-z0-9_-]+)\s*(?:(\*?)=\s*(["'])(.*?)\3\s*)?\]/g;
  let cursor = 0;
  let found = false;
  let match;
  while ((match = attributePattern.exec(rest)) !== null) {
    if (rest.slice(cursor, match.index).trim() !== "") return false;
    cursor = match.index + match[0].length;
    found = true;
    const [, name, operator, , value] = match;
    const actual = element.getAttribute(name);
    if (actual === null) return false;
    // `operator` is "" for `[attr='v']` and "*" for `[attr*='v']`;
    // undefined means a presence-only `[attr]`.
    if (operator === "*" && !actual.includes(value)) return false;
    if (operator === "" && actual !== value) return false;
  }
  return found ? rest.slice(cursor).trim() === "" : rest.trim() === "";
}

/** Build an element chain and return the deepest node. */
function chain(...elements) {
  for (let index = 0; index < elements.length - 1; index += 1) elements[index].parentElement = elements[index + 1];
  return elements[0];
}

// ------------------------------------------------------- module system stub ---
let registration;
const fakeWindow = {
  __ModuleLoader__: {
    load(row) {
      registration = row;
    }
  },
  getSelection: () => null
};
globalThis.window = fakeWindow;
globalThis.Element = FakeElement;
globalThis.Node = class FakeNode {};

const stubModules = {
  react: {
    useState: (initial) => [initial, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
    useSyncExternalStore: (_subscribe, get) => get(),
    Fragment: Symbol("Fragment")
  },
  "react/jsx-runtime": {
    jsx: (type, props, key) => ({ type, props, key }),
    jsxs: (type, props, key) => ({ type, props, key }),
    Fragment: Symbol("Fragment")
  },
  "@deepseek-ai/dsh-client-ui-primitives": new Proxy(
    {},
    {
      get: (_target, key) => (typeof key === "string" && /^Icon/.test(key) ? function Icon() {} : function Primitive() {})
    }
  )
};

new Function("window", SOURCE)(fakeWindow);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
  else console.log(`  ok  ${name}`);
};
const checkTrue = (name, actual) => check(name, actual === true, true);

// ------------------------------------------------------------------ [1] face ---
console.log("\n[1] bundle registration");
check("registered id", registration?.id, "dsh-right-click-menu");
check("factory is a function", typeof registration?.factory, "function");

const requested = [];
const exports_ = registration.factory((specifier) => {
  requested.push(specifier);
  if (!(specifier in stubModules)) throw new Error(`unexpected require("${specifier}")`);
  return stubModules[specifier];
});
check("required platform modules", requested.sort(), [
  "@deepseek-ai/dsh-client-ui-primitives",
  "react",
  "react/jsx-runtime"
]);
check("exports.apply", typeof exports_.apply, "function");
check("exports.inject", exports_.inject, ["slots", "locale"]);

// ------------------------------------------------------- [2] apply() wiring ---
console.log("\n[2] apply() registrations");
const seen = { effects: 0, localeNs: null, dicts: null, injects: 0, slotInject: [], entry: null, component: null };
const documentStub = {
  addEventListener: () => {},
  removeEventListener: () => {}
};
const stubCtx = {
  effect(callback) {
    seen.effects += 1;
    return callback();
  },
  inject(_dependencies, callback) {
    seen.injects += 1;
    callback({ remote: { session: {}, workspaceFiles: {}, fileReferences: {}, directoryPicker: {} } });
  },
  get: () => undefined,
  locale: {
    register(ns, dicts) {
      seen.localeNs = ns;
      seen.dicts = dicts;
      return () => {};
    },
    bind: () => (key) => key
  },
  slots: {
    inject(key, callback) {
      seen.slotInject.push(key);
      return callback();
    },
    register(entry, component) {
      seen.entry = entry;
      seen.component = component;
      return () => {};
    }
  }
};
// `apply` captured the page's `document`; the bundle reads the global.
globalThis.document = documentStub;
exports_.apply(stubCtx);
check("locale namespace", seen.localeNs, "right-click-menu");
check("dictionary locales", Object.keys(seen.dicts), ["zh", "en"]);
check("dictionary key sets match", Object.keys(seen.dicts.zh).sort(), Object.keys(seen.dicts.en).sort());
checkTrue("dictionaries are non-trivial", Object.keys(seen.dicts.zh).length >= 40);
check("slot injected into", seen.slotInject, ["shell.overlay"]);
check("slot entry name", seen.entry?.name, "shell.overlay");
check("slot entry id", seen.entry?.id, "right-click-menu");
check("slot entry locale", seen.entry?.locale, "right-click-menu");
check("component registered", typeof seen.component, "function");
checkTrue("scoped remote injections bound", seen.injects >= 4);
checkTrue("effects registered", seen.effects >= 2);

// ------------------------------------------------- [3] extracted pure code ---
const region = (name) => {
  const start = SOURCE.indexOf(`//#region ${name}`);
  const end = SOURCE.indexOf("//#endregion", start);
  if (start < 0 || end < 0) throw new Error(`region not found: ${name}`);
  return SOURCE.slice(start, end);
};
/** The source of one top-level `function name(...) { ... }`, brace-matched. */
const functionSource = (name) => {
  const start = SOURCE.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function not found: ${name}`);
  const open = SOURCE.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < SOURCE.length; index += 1) {
    if (SOURCE[index] === "{") depth += 1;
    else if (SOURCE[index] === "}") {
      depth -= 1;
      if (depth === 0) return SOURCE.slice(start, index + 1);
    }
  }
  throw new Error(`unbalanced function: ${name}`);
};

const pure = new Function(
  "Element",
  "window",
  "document",
  `${region("paths")}
${region("text candidates")}
${region("surfaces")}
${region("menu items")}
return {
  isAbsolutePath, isWindowsStylePath, separatorOf, withSeparator, joinPath,
  normalizePath, baseName, relativeTo, fileAddressFor,
  looksLikeFileName, classifyToken, classifyQuoted, tokenAround, quotedAround, candidateAtPoint,
  normalizePathCandidate, absoluteTitlePath, workspaceDirectory, projectRowPath,
  refChipCandidate, treeRootPath, withoutCredentials, buildItems
};`
)(FakeElement, fakeWindow, documentStub);

console.log("\n[3] path helpers");
check("POSIX absolute", pure.isAbsolutePath("/Users/a/x.md"), true);
check("Windows drive absolute", pure.isAbsolutePath("C:\\work\\a.md"), true);
check("UNC absolute", pure.isAbsolutePath("\\\\server\\share\\a.md"), true);
check("relative is not absolute", pure.isAbsolutePath("src/a.md"), false);
check("joinPath keeps the platform separator", pure.joinPath("E:\\Code\\Test", "src/a.ts"), "E:\\Code\\Test\\src\\a.ts");
check("joinPath POSIX", pure.joinPath("/Users/a/proj/", "src/a.ts"), "/Users/a/proj/src/a.ts");
check("relativeTo inside root", pure.relativeTo("/Users/a/proj", "/Users/a/proj/src/a.ts"), "src/a.ts");
check("relativeTo root itself", pure.relativeTo("/Users/a/proj", "/Users/a/proj"), "");
check("relativeTo outside root", pure.relativeTo("/Users/a/proj", "/Users/a/other/a.ts"), undefined);
check("baseName POSIX", pure.baseName("/Users/a/proj/a.md"), "a.md");
check("baseName Windows", pure.baseName("E:\\Code\\Test\\a.md"), "a.md");
check(
  "session file address for a workspace-relative path",
  pure.fileAddressFor("s-1", "/Users/a/proj", "src/a b.ts"),
  "dsh-resource://file/session/s-1/src/a%20b.ts"
);
check(
  "session file address strips the workspace root",
  pure.fileAddressFor("s-1", "/Users/a/proj", "/Users/a/proj/src/a.ts"),
  "dsh-resource://file/session/s-1/src/a.ts"
);

console.log("\n[4] surface helpers");
check(
  "chip tooltip: @ + quotes + path",
  pure.normalizePathCandidate('@"E:\\Code\\Test\\my docs\\a b.txt"'),
  "E:\\Code\\Test\\my docs\\a b.txt"
);
check("line anchor is stripped", pure.normalizePathCandidate("src/app.ts#L24-L30"), "src/app.ts");
check("plain single-line anchor is stripped", pure.normalizePathCandidate("src/app.ts#L7"), "src/app.ts");
check("absolute tooltip qualifies", pure.absoluteTitlePath(new FakeElement("button", { title: "E:\\Code\\Test\\out\\report.md" })), "E:\\Code\\Test\\out\\report.md");
check("prose tooltip does not qualify", pure.absoluteTitlePath(new FakeElement("button", { title: "Open settings" })), undefined);
check("relative tooltip does not qualify", pure.absoluteTitlePath(new FakeElement("button", { title: "src/a.ts" })), undefined);
check("missing tooltip does not qualify", pure.absoluteTitlePath(new FakeElement("button", {})), undefined);

const WORKSPACES = {
  list: {
    getSnapshot: () => ({
      items: [
        { workspaceId: "ws-test", path: "E:\\Code\\Test", title: "Test" },
        { workspaceId: "ws-posix", path: "/Users/a/proj", title: "proj" }
      ]
    })
  }
};
check("workspace directory by id", pure.workspaceDirectory(WORKSPACES, "ws-test"), "E:\\Code\\Test");
check("unknown workspace id", pure.workspaceDirectory(WORKSPACES, "ws-gone"), undefined);
check("empty (ungrouped) workspace id", pure.workspaceDirectory(WORKSPACES, ""), undefined);
check("no workspaces service", pure.workspaceDirectory(undefined, "ws-test"), undefined);
check(
  "project row resolves its workspace directory",
  pure.projectRowPath(new FakeElement("div", { "data-row-key": "workspace:ws-test" }), WORKSPACES),
  "E:\\Code\\Test"
);
check(
  "non-workspace row key is not a directory",
  pure.projectRowPath(new FakeElement("div", { "data-row-key": "session:abc" }), WORKSPACES),
  undefined
);
check(
  "file chip candidate",
  pure.refChipCandidate(new FakeElement("button", { "data-ref-chip": "file", title: '@"E:\\Code\\Test\\my docs\\a b.txt"' })),
  { path: "E:\\Code\\Test\\my docs\\a b.txt", directory: false }
);
check(
  "folder chip candidate",
  pure.refChipCandidate(new FakeElement("button", { "data-ref-chip": "folder", title: '@"E:\\Code\\Test\\docs"' })),
  { path: "E:\\Code\\Test\\docs", directory: true }
);
check(
  "session chip is not a file",
  pure.refChipCandidate(new FakeElement("span", { "data-ref-chip": "session", title: "@session-5f87" })),
  undefined
);
check(
  "chip without a tooltip is not a file",
  pure.refChipCandidate(new FakeElement("button", { "data-ref-chip": "file" })),
  undefined
);

const tree = new FakeElement("div", { "data-files-state": "tree", "data-files-root": "E:/Code/Test" }, []);
const treeHeaderLabel = new FakeElement("span", { "data-files-path": "", title: "E:/Code/Test" }, ["Test"]);
tree.children.push(treeHeaderLabel);
treeHeaderLabel.parentElement = tree;
check("tree root resolves from a header inside the tree", pure.treeRootPath(treeHeaderLabel), "E:/Code/Test");
check("a standalone row has no tree root", pure.treeRootPath(new FakeElement("li", { "data-files-entry": "file", "data-files-path": "E:/Code/Test/a.md" })), undefined);
check("URL credentials are stripped", pure.withoutCredentials("https://user:pass@example.com/a?b=1"), "https://example.com/a?b=1");
check("clean URLs pass through", pure.withoutCredentials("https://example.com/a"), "https://example.com/a");
check("non-URL strings pass through", pure.withoutCredentials("mailto:a@b.test"), "mailto:a@b.test");

console.log("\n[5] text token classification");
check("relative path token", pure.classifyToken("src/index.ts", false), { path: "src/index.ts", absolute: false });
check("absolute token", pure.classifyToken("E:\\Code\\Test\\a.md", false), { path: "E:\\Code\\Test\\a.md", absolute: true });
check("bare file name", pure.classifyToken("production.json", false), { path: "production.json", absolute: false });
check("bare word is not a file", pure.classifyToken("hello", false), undefined);
check("version number is not a file", pure.classifyToken("1.2", false), undefined);
check("code does not accept an arbitrary bare word", pure.classifyToken("README", true), undefined);
check("code accepts a slash path without an extension", pure.classifyToken("src/index", true), { path: "src/index", absolute: false });
check("quoted path with spaces is a path", pure.classifyQuoted("my docs/a b.txt"), { path: "my docs/a b.txt", absolute: false });
check("quoted absolute path with spaces", pure.classifyQuoted("E:\\Code\\Test\\my docs\\a b.txt"), {
  path: "E:\\Code\\Test\\my docs\\a b.txt",
  absolute: true
});
check("quoted prose is not a path", pure.classifyQuoted("hello world"), undefined);
check("line anchor is stripped from a token", pure.classifyToken("src/app.ts#L24-L30", false), { path: "src/app.ts", absolute: false });
check("tokenAround takes the contiguous token", pure.tokenAround("open src/index.ts now", 9), "src/index.ts");
check("quotedAround reads the quoted path", pure.quotedAround('see "my docs/a b.txt" ok', 7), "my docs/a b.txt");
{
  const codeBlockText = new FakeElement("span", {}, ["src/index.ts"]);
  const code = new FakeElement("code", {}, [codeBlockText]);
  const pre = new FakeElement("pre", {}, [code]);
  check(
    "a fenced code block keeps its own right-click",
    pure.candidateAtPoint({ target: codeBlockText, clientX: 1, clientY: 1 }),
    undefined
  );
}

console.log("\n[6] menu rows");
const menuP = new Proxy(
  {},
  {
    get: (_target, key) => {
      if (key === "jsx") return undefined;
      if (typeof key === "string" && /^Icon/.test(key)) return function Icon() {};
      if (key === "FileTypeIcon") return function FileTypeIcon() {};
      if (key === "classifyFileType") return () => "text";
      return function Primitive() {};
    }
  }
);
const jsxStub = (type, props) => ({ type, props });
const buildItems = (target, desktop, apps) => {
  const sandbox = new Function(
    "jsx",
    "jsxs",
    "P",
    "baseName",
    `${region("menu items")}
return buildItems;`
  )(jsxStub, jsxStub, menuP, pure.baseName);
  return sandbox({ seq: 1, target, desktop, apps }, (key) => key);
};
const ids = (items) => items.map((item) => (item.type === "separator" ? "<sep>" : item.id));

const fileTarget = {
  name: "a.md",
  kind: "file",
  absolutePath: "/Users/a/proj/a.md",
  relativePath: "a.md",
  sessionId: "s-1",
  cwd: "/Users/a/proj"
};
const fileItems = buildItems(fileTarget, true, [{ id: "vscode", name: "VS Code", default: true }]);
check(
  "file rows (desktop available, associations known)",
  ids(fileItems),
  [
    "header",
    "<sep>",
    "preview",
    "open-default",
    "open-with",
    "reveal",
    "<sep>",
    "copy-path",
    "copy-relative",
    "copy-name",
    "copy-contents",
    "<sep>",
    "save-as"
  ]
);
check("open-with lists the default app", fileItems.find((item) => item.id === "open-with").submenu, [
  { id: "app:vscode", label: "menu.defaultApp" }
]);
check("header names the file", fileItems[0].text, "menu.header.file · a.md");

const noDesktopItems = buildItems(fileTarget, false, []);
checkTrue("no-desktop notice replaces desktop rows", ids(noDesktopItems).includes("no-desktop"));
checkTrue("no-desktop notice is the last row", noDesktopItems[noDesktopItems.length - 1].id === "no-desktop");
checkTrue("copy/save rows survive without a desktop", ids(noDesktopItems).includes("save-as"));

const directoryTarget = {
  name: "docs",
  kind: "directory",
  absolutePath: "/Users/a/proj/docs",
  relativePath: "docs",
  sessionId: "s-1",
  cwd: "/Users/a/proj"
};
const directoryItems = buildItems(directoryTarget, true, []);
check("directory header", directoryItems[0].text, "menu.header.folder · docs");
checkTrue("file-only rows are absent for a directory", !ids(directoryItems).includes("copy-contents") && !ids(directoryItems).includes("save-as"));
checkTrue("directory offers the folder open row", ids(directoryItems).includes("open-default"));

const treeRowDirectory = { ...directoryTarget, rowButton: {} };
checkTrue(
  "a tree-row directory offers expand-in-tree",
  buildItems(treeRowDirectory, true, []).find((item) => item.id === "preview")?.label === "menu.expand"
);

const linkItems = buildItems(
  { kind: "link", name: "example.com", href: "https://example.com/a", scheme: "https:", text: "example", sidebarBrowser: true },
  false,
  []
);
check("http link rows", ids(linkItems), [
  "header",
  "<sep>",
  "open-link-sidebar",
  "open-link-external",
  "copy-link",
  "copy-link-text",
  "copy-markdown"
]);
check("sidebar row is enabled when the sidebar can host it", linkItems.find((item) => item.id === "open-link-sidebar").disabled, false);
check(
  "sidebar row is disabled when the sidebar cannot host it",
  buildItems(
    { kind: "link", name: "example.com", href: "https://example.com/a", scheme: "https:", text: "example", sidebarBrowser: false },
    false,
    []
  ).find((item) => item.id === "open-link-sidebar").disabled,
  true
);

const mailtoItems = buildItems(
  { kind: "link", name: "mailto", href: "mailto:a@b.test", scheme: "mailto:", text: "mail", sidebarBrowser: true },
  false,
  []
);
checkTrue("non-http link uses the single open-link row", mailtoItems.some((item) => item.id === "open-link"));
checkTrue("non-http link has no sidebar/external split", !mailtoItems.some((item) => item.id === "open-link-sidebar"));

const linkToFileItems = buildItems(
  {
    kind: "link",
    name: "report.md",
    href: "dsh-resource://file/session/s-1/report.md",
    scheme: "dsh-resource:",
    text: "report.md",
    sidebarBrowser: true,
    fileKind: "file",
    absolutePath: "/Users/a/proj/report.md",
    relativePath: "report.md",
    sessionId: "s-1",
    cwd: "/Users/a/proj"
  },
  true,
  []
);
check("a link that names a file is headed by the file name", linkToFileItems[0].text, "menu.header.link · report.md");
checkTrue("a link that names a file gets the file rows too", ids(linkToFileItems).includes("copy-contents"));
checkTrue("a link that names a file keeps its link rows", ids(linkToFileItems).includes("copy-markdown"));

// ------------------------------------------------- [7] live listener wiring ---
console.log("\n[7] contextmenu listener against the merged surfaces");

/** Load a fresh copy of the bundle and run `apply` against a stub client ctx. */
function loadPlugin() {
  const documentStub = {
    listener: null,
    addEventListener(_type, listener) {
      this.listener = listener;
    },
    removeEventListener() {}
  };
  globalThis.document = documentStub;
  const services = {
    sessions: { list: { getSnapshot: () => ({ byId: { "s-1": { cwd: "/Users/a/proj" } } }) } },
    workspaces: {
      list: {
        getSnapshot: () => ({ items: [{ workspaceId: "ws-test", path: "/Users/a/proj", title: "proj" }] })
      }
    }
  };
  let entry = null;
  const mod = registration.factory((specifier) => stubModules[specifier]);
  mod.apply({
    effect: (callback) => callback(),
    inject: (_dependencies, callback) =>
      callback({
        remote: {
          session: {
            canOpenWorkspacePath: async () => ({ ok: true, value: true }),
            workspacePathApplications: async () => ({ ok: true, value: [] }),
            openWorkspacePath: async () => ({ ok: true, value: true })
          },
          workspaceFiles: {},
          fileReferences: {},
          directoryPicker: {}
        }
      }),
    get: (name) => services[name],
    locale: { register: () => () => {}, bind: () => (key) => key },
    slots: {
      inject: (_key, callback) => callback(),
      register: (registered) => {
        entry = registered;
        return () => {};
      }
    }
  });
  return { documentStub, entry };
}

/** Answer this package's `/stat` route (and fail every other request). */
const previousFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const target = String(url);
  if (!target.endsWith("/dsh-right-click-menu/stat")) return { ok: false, status: 404 };
  const body = JSON.parse(options.body);
  return {
    ok: true,
    status: 200,
    json: async () => ({ path: body.path, exists: true, kind: body.path.endsWith("/docs") ? "directory" : "file", size: 1 })
  };
};

const fire = async (plugin, target) => {
  const event = {
    target,
    clientX: 10,
    clientY: 20,
    prevented: 0,
    stopped: 0,
    preventDefault() {
      this.prevented += 1;
    },
    stopPropagation() {
      this.stopped += 1;
    }
  };
  plugin.documentStub.listener(event);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { event, menu: plugin.entry.inject().open.get().menu };
};

const treeRow = () => {
  const label = new FakeElement("span", {}, ["a.ts"]);
  const button = new FakeElement("button", { class: "_row_x", type: "button" }, [label]);
  return new FakeElement(
    "li",
    { "data-files-entry": "file", "data-files-path": "/Users/a/proj/src/a.ts" },
    [button]
  );
};
{
  const plugin = loadPlugin();
  const row = treeRow();
  const { event, menu } = await fire(plugin, row.children[0].children[0]);
  check("tree row: right-click claimed", event.prevented, 1);
  check("tree row: file target", [menu?.target?.kind, menu?.target?.absolutePath], ["file", "/Users/a/proj/src/a.ts"]);
  check("tree row: menu row button captured", typeof menu?.target?.rowButton, "object");
}
{
  const plugin = loadPlugin();
  const row = new FakeElement("div", { "data-files-entry": "directory", "data-files-path": "/Users/a/proj/src" }, []);
  const { menu } = await fire(plugin, row);
  check("tree directory row: directory target", menu?.target?.kind, "directory");
}
{
  const plugin = loadPlugin();
  const tree = new FakeElement("div", { "data-files-state": "tree", "data-files-root": "E:/Code/Test" }, []);
  const header = new FakeElement("span", { "data-files-path": "", title: "E:/Code/Test" }, ["Test"]);
  tree.children.push(header);
  header.parentElement = tree;
  const { event, menu } = await fire(plugin, header);
  check("tree header: claimed", event.prevented, 1);
  check("tree header: root directory target", [menu?.target?.kind, menu?.target?.absolutePath], [
    "directory",
    "E:/Code/Test"
  ]);
}
{
  const plugin = loadPlugin();
  const row = new FakeElement("div", { "data-row-key": "workspace:ws-test", role: "treeitem" }, []);
  const title = new FakeElement("span", {}, ["proj"]);
  row.children.push(title);
  title.parentElement = row;
  const { event, menu } = await fire(plugin, title);
  check("workspace project row: claimed", event.prevented, 1);
  check("workspace project row: directory target", [menu?.target?.kind, menu?.target?.absolutePath], [
    "directory",
    "/Users/a/proj"
  ]);
}
{
  const plugin = loadPlugin();
  const review = new FakeElement(
    "button",
    { "data-review-file": "/Users/a/proj/src/a.ts", title: "…/src/a.ts" },
    []
  );
  const { event, menu } = await fire(plugin, review);
  check("changed-files review row: claimed", event.prevented, 1);
  check("changed-files review row: file target", menu?.target?.absolutePath, "/Users/a/proj/src/a.ts");
}
{
  const plugin = loadPlugin();
  const label = new FakeElement("span", { "data-path-label": "", title: "/Users/a/proj/src/a.ts" }, [
    new FakeElement("span", {}, ["src/a.ts"])
  ]);
  const { event, menu } = await fire(plugin, label.children[0]);
  check("path label span: claimed", event.prevented, 1);
  check("path label span: file target", menu?.target?.absolutePath, "/Users/a/proj/src/a.ts");
}
{
  const plugin = loadPlugin();
  const chip = new FakeElement("button", { "data-ref-chip": "file", title: '@"/Users/a/proj/src/a b.ts"' }, []);
  const { event, menu } = await fire(plugin, chip);
  check("file chip: claimed", event.prevented, 1);
  check("file chip: Host-confirmed file target", [menu?.target?.kind, menu?.target?.absolutePath], [
    "file",
    "/Users/a/proj/src/a b.ts"
  ]);
}
{
  const plugin = loadPlugin();
  const chip = new FakeElement("span", { "data-ref-chip": "session", title: "@session-5f87" }, []);
  const { event, menu } = await fire(plugin, chip);
  check("session chip: left to the native menu", event.prevented, 0);
  check("session chip: no menu", menu, null);
}
{
  const plugin = loadPlugin();
  const card = new FakeElement("button", { class: "_card_x", title: "/Users/a/proj/out/report.md" }, []);
  const sessionChip = new FakeElement("span", { "data-ref-chip": "session", title: "@session-5f87" }, []);
  card.children.push(sessionChip);
  sessionChip.parentElement = card;
  const { event, menu } = await fire(plugin, sessionChip);
  check("session chip inside a titled card: left to the native menu", event.prevented, 0);
  check("session chip inside a titled card: no menu", menu, null);
}
{
  const plugin = loadPlugin();
  const card = new FakeElement("button", { class: "_card_x", title: "/Users/a/proj/out/report.md" }, []);
  const { event, menu } = await fire(plugin, card);
  check("delivery card: claimed", event.prevented, 1);
  check("delivery card: file target", menu?.target?.absolutePath, "/Users/a/proj/out/report.md");
}
{
  const plugin = loadPlugin();
  const button = new FakeElement("button", { title: "Open settings" }, ["Settings"]);
  const { event, menu } = await fire(plugin, button);
  check("ordinary titled button: left to the native menu", event.prevented, 0);
  check("ordinary titled button: no menu", menu, null);
}
{
  const plugin = loadPlugin();
  const anchor = new FakeElement("a", { href: "https://example.com/a" }, [new FakeElement("span", {}, ["link"])]);
  const { event, menu } = await fire(plugin, anchor.children[0]);
  check("http link: claimed", event.prevented, 1);
  check("http link: link target", [menu?.target?.kind, menu?.target?.href], ["link", "https://example.com/a"]);
}

globalThis.fetch = previousFetch;

// ------------------------------------------------------------------- report ---
console.log("");
if (failures.length > 0) {
  console.error(`${failures.length} failure(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("all checks passed");
