# dsh-right-click-menu

给 DSH（DeepSeek Harness）网页界面补上右键菜单：**文件、对话里的文件路径、工作区项目、超链接**都能右键出对应的操作。

这是**独立的合并版**：功能基座来自 [AL1ghtm3ter/dsh-right-click-menu](https://github.com/AL1ghtm3ter/dsh-right-click-menu)，
工作区行/文件树根/测试工程化等来自 [SJcun/dsh-right-click-menu](https://github.com/SJcun/dsh-right-click-menu)，
两个上游都是 MIT。逐项对比与取舍见 [COMPARISON.md](COMPARISON.md)。本仓库与两个上游没有隶属关系。

## 它解决什么问题

DSH 桌面壳的原生右键菜单只处理"可编辑输入框"和"选中文本"。所以在文件树、聊天里的路径、`@file` 引用、链接上点右键，
原本什么都不会弹。这个插件在页面里接管这些位置，同时把其它右键原样留给原生菜单。

## 能做什么

| 在哪右键 | 会发生什么 |
|---|---|
| 右侧栏「文件」树的行 | 文件操作菜单；文件夹多「在文件树中展开」 |
| 文件树的头部 / 空白处 | 对该目录的文件操作 |
| 聊天里出现的文件路径（正文、行内代码都行） | **先确认文件真实存在**，再弹文件菜单 |
| 聊天里的文件提及、`@file` / `@folder` 引用 | 文件菜单 |
| 文档里的路径标签、改动文件审阅行 | 文件菜单 |
| 左侧栏「工作区」项目名 | 对该工作区目录的文件操作 |
| 任意超链接 | 链接菜单；链接指向文件时再补上文件菜单 |

**文件菜单包含**

- 在 DSH 中预览 / 在文件树中展开
- 在默认应用中打开、**打开方式 ▸**（列出宿主查到的关联程序）
- 在资源管理器中定位
- 复制路径 / 相对路径 / 文件名 / 文件内容
- 另存为…

**链接菜单包含**

- 在侧边栏中打开（HTTP/HTTPS）
- 在外部浏览器中打开
- 打开链接（`mailto:` 等其它 scheme）
- 复制链接地址 / 链接文字 / 复制为 Markdown 链接

其余右键不被接管：输入框、选中文本、消息操作、代码块、JSON 复制按钮都保持原生行为。
长得像路径但宿主查不到的内容会提示「工作区里没有找到 …」，不会静默吞掉右键。

菜单与提示跟随 DSH 界面语言（中文 / 英文），切换语言后立即生效。

## 安装

> 包名和 Loader 行 id 都与两个上游相同。**先卸载已安装的上游版本**，再装这个。

### 方式一：网页界面（推荐）

侧栏 **Plugins → Add plugin**，粘贴：

```
github:Ignareo/dsh-right-click-menu
```

或者用 Release 里的打包文件：

```
https://github.com/Ignareo/dsh-right-click-menu/releases/latest/download/dsh-right-click-menu.tgz
```

### 方式二：命令行

先把 DSH 完全退出：

```sh
dsh plugin --profile desktop add github:Ignareo/dsh-right-click-menu
```

装好后，`dsh-right-click-menu` 会自动写进 profile 的 `dsh.profile.bundles`。

### 生效方式

- **浏览器半**：刷新页面（Ctrl/Cmd+R）即可。
- **宿主半**（复制文件内容、另存为等）需要**重启 DSH** 一次，因为 Node 的 ESM 缓存会留住旧模块。

装完可以跑一次活体校验确认（见下方"验证"）。

### 卸载

```sh
dsh plugin --profile desktop remove dsh-right-click-menu
```

或手工从 profile 的 `package.json` 里移除 `dependencies` 和 `dsh.profile.bundles` 中的这一项，然后重启。

## 使用小贴士

- 聊天里写 `src/index.ts`、`D:\projects\app\main.py`、`"my docs/a b.txt"` 都能右键；裸文件名会走编辑器的 `@file` 搜索。
- 代码块（`<pre>`）里的右键保留原生行为；行内代码里的路径仍可右键。
- 「另存为…」优先用浏览器保存对话框（可改名）；没有时退回"选目录 + 宿主拷贝"。

## 已知限制

- 路径识别依赖 DSH 尚未公开为 API 的 DOM 标记，DSH 升级后可能需要跟着调整；升级后先跑 `npm test`。
- 聊天里的裸文件名如果 `@file` 搜索不到，就不弹菜单。
- 图片形式的 Markdown 文件链接没有路径 tooltip，仅当标签本身是路径时可识别。
- 工作区相对的 Markdown 链接按当前会话的工作区解析。

## 验证

```sh
npm test              # 141 项零依赖检查（客户端 107 + 宿主半 34）
npm run check:live    # 需要 DSH 正在运行；默认读 $DSH_WEB_URL
```

`check:live` 也可以显式传地址：

```sh
node scripts/live-bundle.mjs http://127.0.0.1:<端口>
```

手工验证清单：

1. 右侧栏「文件」树右键一行 → 文件菜单；文件夹有「在文件树中展开」。
2. 左侧栏工作区项目名右键 → 目录菜单。
3. 聊天里右键 `src/index.ts` → 存在时弹菜单，不存在时提示「工作区里没有找到 …」。
4. 任意链接右键 → 侧栏打开 / 外部浏览器 / 复制为 Markdown。
5. 输入框或选中文字右键 → 仍是原生菜单。

---

## 开发者文档

### 包结构

```
package.json             name = Loader 行名 = lib/client.js 里的注册 id
cordis.patch.yml         该 bundle 唯一的组成层，插入宿主插件那一行
lib/index.js             宿主半：/dsh-right-click-menu 下 5 条带信任围栏的路由
lib/client.js            浏览器半：手写的 __ModuleLoader__ 包（无构建步骤）
test/detection.test.mjs  客户端：bundle 形态 + 纯函数 + 真实 contextmenu 监听器
test/host.test.mjs       宿主半：路由、围栏、真实临时文件往返
scripts/live-bundle.mjs  对运行中 Host 的活体 bundle 校验
locale/{en,zh}.json      插件卡片文案
```

**无构建步骤**：`lib/client.js` 就是 DSH 直接加载的文件，宿主半是普通 ESM。
浏览器半只 require 平台的种子模块（`react`、`react/jsx-runtime`、`@deepseek-ai/dsh-client-ui-primitives`），
其余能力全部通过 Cordis 注入拿。

### 宿主半路由

| 路由 | 用途 |
|---|---|
| `GET /ping` | 存活探测 |
| `GET /raw?path=` | 原始字节（给浏览器侧"另存为"用；`application/octet-stream` + `nosniff`，上限 64 MiB） |
| `POST /stat` | `{ path }` → `{ exists, kind, size, mtimeMs }` |
| `POST /read` | `{ path }` → `{ text, binary, truncated, size }`，只读前 1 MiB |
| `POST /save-as` | `{ from, to }` 拷贝字节 |

每条路由都先过 `connection.requestRejection`（Host/Origin + 浏览器认证围栏），再校验方法、媒体类型、
64 KiB 请求体上限和绝对路径。宿主半只 import Node 内置模块，不依赖应用自身的 `@deepseek-ai/*` 依赖图。
插件不在 composition 里时这些能力会退化，客户端有 Remote 兜底。

### 事件与右键表面

`document` 上捕获阶段的 `contextmenu` 监听器按固定优先级解析指针下的元素：

1. 明确拥有自己右键菜单的区域（`role=menu`、JSON 复制按钮、文件树刷新按钮）→ 放行；
2. 文件树行 `[data-files-path][data-files-entry]`（路径为绝对或相对 root）；
3. 左侧栏工作区项目行 `[data-row-key="workspace:<id>"]` → `ctx.get("workspaces")` 列表解析目录；
4. 文件树根 `[data-files-state="tree"][data-files-root]`；
5. 路径标签 `[data-path-label]`（`title` 是路径）、改动文件审阅行 `[data-review-file]`（属性是绝对路径）；
6. `@` 引用 chip `[data-ref-chip]`：只接受 `file` / `folder`，其它 chip 直接放行；
7. 链接 `a[href]`；
8. 文件提及按钮与绝对路径 tooltip 的按钮/卡片；
9. 指针下的文字 token（跳过 `<pre>` 代码块；带行锚点 `#L24-L30` 会被剥离）。

路径只有在宿主确认存在后才会弹菜单。绝对路径先走 `/stat`，宿主看不到时回退到 Session 的
`workspaceFiles` Remote（远程/SSH 工作区）。

### 测试与活体校验

```sh
npm test
node scripts/live-bundle.mjs [baseUrl]
```

- `test/detection.test.mjs` 用桩模块加载真实 bundle，并驱动真实 `contextmenu` 监听器逐表面断言；
  纯函数通过 bundle 自己的 `//#region` 抽取，测试不会和实现分叉。
- `test/host.test.mjs` 挂载宿主半，用临时文件覆盖 stat/read/raw/save-as 与全部围栏分支。
- `scripts/live-bundle.mjs` 复算 `artifactRevision` 并比对 Host 实际返回的字节。tarball 安装时
  Host 服务的是 profile `node_modules` 里的副本，脚本会自动定位它（revision 取自已安装副本的 mtime/size）。

### 安全说明

宿主半的四个数据路由接受任意绝对路径，只由 `connection` 的信任围栏（Host/Origin + 浏览器认证）保护；
如需更严格的 workspace 限制，可在 `lib/index.js` 的 `post('/stat'|'/read'|'/save-as')` 处加根目录校验。
`/raw` 固定 `application/octet-stream` + `nosniff`，避免被当作同源 HTML/SVG 打开；`/read` 只读前 1 MiB。

### 兼容性

针对 DSH 0.2.x（Web surface）构建并验证。DOM 标记不是公开 API，DSH 升级后请先跑 `npm test` 并手工验证。

## 署名与许可

MIT。功能基座来自 AL1ghtm3ter，工作区行/树根检测、测试与活体校验思路来自 3n（SJcun），
合并、加固与修正在本仓库完成。见 [LICENSE](LICENSE) 与 [NOTICE.md](NOTICE.md)。
