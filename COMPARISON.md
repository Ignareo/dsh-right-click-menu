# 两个 dsh-right-click-menu 的对比与合并结论

本仓库：<https://github.com/Ignareo/dsh-right-click-menu>（独立的合并版，与两个上游无隶属关系）。

结论先说：**两个都不是"另一个的残次复制"**，它们代表两种不同取舍。

- **`AL1ghtm3ter/dsh-right-click-menu`（v0.3.1）功能更强**：文件预览、系统默认应用打开、打开方式子菜单、在资源管理器中定位、复制路径/相对路径/文件名/文件内容、另存为、链接在侧边栏/外部浏览器打开、复制为 Markdown、44 个 i18n 键、插件图标与卡片本地化。代价是它带一个宿主半（6 条 HTTP 路由），客户端 1358 行，**没有任何测试**，聊天里的路径识别依赖"指针下文字扫描 + 宿主确认"，脆弱面更多。
- **`SJcun/dsh-right-click-menu`（v0.1.0）更克制、更工程化**：宿主半是空 `apply`，插件完全不碰文件系统；文件定位走产品自己的 `session.openWorkspacePath`，外链走 `window.open`；客户端 531 行，支持右键左侧栏"工作区项目行"这一 AL 没有的表面；有 375 行零依赖测试（从交付源码里抽取纯函数喂假 DOM）和 `check:live` 活体校验。代价是菜单只有两行（打开/复制），没有预览、打开方式、复制内容、另存为。

## 逐项对比

| 维度 | SJcun | AL1ghtm3ter |
|---|---|---|
| 版本 / 最近提交 | 0.1.0 / 2026-10-12 | 0.3.1 / 2026-10-06 |
| 宿主半 | 空 `apply`，**不碰 FS** | 6 条路由：`/ping` `/raw` `/stat` `/read` `/save-as` `/write-text` |
| 客户端行数 | 531 | 1358 |
| 识别的右键对象 | HTTP(S) 链接、Markdown 文件链接、`@file`/`@folder` chip、交付卡片、文件树行/目录/根、**左侧栏工作区项目行** | 文件树行、聊天里的路径文本（先向宿主核实存在）、文件提及按钮、超链接、指向文件的链接 |
| 菜单能力 | 打开（外链/资源管理器）+ 复制（链接/路径/文件夹路径） | 预览、默认应用打开、打开方式▸、资源管理器定位、复制路径/相对路径/文件名/文件内容、另存为、侧边栏打开链接、外部浏览器打开、复制链接/文字/Markdown |
| 目录识别 | 有（项目行、`@folder` chip、文件树目录/根） | 部分（文件树目录；**没有左侧栏项目行**；树头需要靠行的 root 推导） |
| 本地化 | 8 键，zh + en 内联 | 44 键，zh + en 内联，另有 `locale/*.json` 给插件卡片 |
| 测试 | 375 行，零依赖，覆盖检测 + 菜单行 + 路径解析 | 无 |
| 活体校验 | `scripts/live-bundle.mjs`（复算 artifactRevision 并比对线上字节） | 无；只有手工验证步骤 |
| 依赖声明 | 声明 `@deepseek-ai/*` peerDependencies，版本不符拒载 | 无 peer 声明；宿主半只用 Node 内置模块 |
| 安全面 | 小：没有自定义路由，路径由宿主校验 | 大：路由接受任意绝对路径（受 connection 信任围栏保护）；其中 `/write-text` 客户端根本没用到，却允许任意 UTF-8 写入 |
| 主要脆弱点 | DOM 标记（`data-files-path`、`data-row-key` 等） | 上述 DOM 标记 + 指针下文字扫描/`@file` 搜索；无测试兜底 |

## 哪个"更好"

- **只想补上"右键文件/链接能打开、能复制"**：选 SJ。行为最贴产品原生（复用 `openWorkspacePath` / `window.open`），代码最少，有测试，出问题能定位。
- **想要 Codex 式完整文件菜单**：选 AL。功能明显更全，明确定位就是"文件右键菜单"，聊天里的路径也真能右键。
- **两者都装不了**：包名相同（`dsh-right-click-menu`），Loader 行 id 也相同（`right-click-menu`），同一 profile 只能选一个。

## 合并版做了什么（`dsh-right-click-menu` 0.4.0）

以 **AL 为功能基座**（功能多，架构本身写得不错），把 SJ 的长处并进来，并修掉分析中发现的短板：

1. **补上 SJ 独有的表面**：左侧栏工作区项目行（`data-row-key="workspace:<id>"` → 从客户端 Workspace 列表解析目录）、文件树根/头部（`data-files-root`）、`@file`/`@folder` chip（`data-ref-chip`，含 `@"带 空格 的路径"`）、交付卡片/路径标签按钮（绝对路径 tooltip），文档里的路径标签 span（`data-path-label`，它没有 button 语义，两个上游都漏了），以及改动文件审阅行（`data-review-file`，它自己的 title 可能是缩写显示路径，必须读属性）。
2. **路径规范化**：chip/链接/提及的 `@` 前缀、包裹引号、`#L24-L30` 行锚点统一剥离；文本 token 也剥离行锚点，`src/app.ts#L24` 现在能正确识别。
3. **测试工程化**：新增 141 项零依赖检查——客户端 107 项（bundle 形态、`apply` 注册、纯函数、菜单行、以及**驱动真实 `contextmenu` 监听器**逐表面断言）+ 宿主半 34 项（路由表、信任围栏、方法/媒体类型/64 KiB 上限/绝对路径校验、stat/read/raw/save-as 真实临时文件往返、截断与上限）。
4. **安全收敛**：删掉客户端从未使用、却允许任意绝对路径写入的 `/write-text` 路由；`/raw` 改为 `application/octet-stream` + `nosniff`（避免被当作同源 HTML/SVG 打开），并加 64 MiB 缓冲上限；`/read` 只读取 1 MiB 而不是先整文件读入内存。
5. **防误伤**：绝对路径 tooltip 才触发卡片菜单（"Open settings" 这类散文不会）；`data-ref-chip` 只接受 `file`/`folder`（session/skill chip 保持原生行为，且不再被外层标题"借走"）；围栏代码块（`<pre>`）不再做文字扫描；普通 prose 里的裸词命中不到时不再弹提示。
6. **外链凭据**：`https://user:pass@host/` 这类链接在交给系统浏览器或侧栏标签前剥掉 userinfo。
7. **修掉分析中确认的 bug**：提示条 `notify` 未推进序号导致第二条提示不自动消失；带空格的引号路径（`"my docs/a b.txt"`）被拒绝；绝对路径 `/stat` 返回不存在时不再直接放弃（回退到 Session 的 `workspaceFiles` Remote，远程/SSH 工作区可用）；指向文件的链接表头显示成 `Link · dsh-resource` 而非文件名。
8. **保留工程化工具**：`npm test`、`npm run check:live`（SJ 的活体 bundle 校验，适配本包）。

兼容性：两上游都声明针对 DSH `0.2.0-rc.2`；本机运行的是 `0.2.1-rc.2`。已核对本机运行中的前端产物包含合并版用到的全部平台模块与图标导出（`FileTypeIcon`、`classifyFileType`、`writeClipboard`、`Menu`、`Toast` 及 8 个图标），但 DOM 标记仍属未公开契约，升级 DSH 后应跑 `npm test` 与手工右键验证。

许可证：两上游均为 MIT。合并版保留双方署名（见 `LICENSE`）。
