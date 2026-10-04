# 开发说明

按 v0.6 规格实现：共用渲染器 `packages/core`、CLI、已发布模板注册表、golden 测试、stdio MCP 服务器，以及 Claude / ChatGPT（Codex）两个插件。

## 目录

| 路径 | 内容 |
|---|---|
| `packages/core` | 导入、Schema 与语义校验、序列化、渲染、注册表（唯一生成逻辑） |
| `packages/cli` | `spt` 命令：list / validate / render |
| `packages/mcp` | stdio MCP 服务器：`list_templates`、`get_template`、`validate_template`、`render_prompt` |
| `templates/` | 工作区模板（可编辑，未发布） |
| `registry/` | 已发布版本的不可变快照：`index.json` + `<id>/<version>.yaml` |
| `adapters/claude` | Claude Code 插件（`.claude-plugin/plugin.json`、`.mcp.json`、Skill、构建好的服务器） |
| `adapters/chatgpt` | Codex 插件（`.codex-plugin/plugin.json`、`.mcp.json`、Skill、构建好的服务器） |
| `.claude-plugin/marketplace.json` | Claude Code 插件市场 |
| `.agents/plugins/marketplace.json` | Codex 插件市场 |
| `tests/fixtures/golden`、`tests/snapshots` | golden 测试的输入与期望输出 |

## 常用命令

```text
npm ci
npm run check                 # 类型检查
npm test                      # 单元、registry、golden、MCP 合约测试
npm run list                  # 列出已发布模板
npm run validate -- templates/meeting-minutes.yaml
npm run render -- meeting-minutes --version 1.0.0 --vars-file examples/meeting-input.json
npm run render -- --template templates/meeting-minutes.yaml --vars-file examples/meeting-input.json
npm run mcp                   # 从源码启动 MCP 服务器（stdio）
```

## 发布模板版本

1. 修改 `templates/<id>.yaml` 时递增 `template.version`（规则见规格 6.1）。
2. `npm run publish-template -- templates/<id>.yaml`：校验后写入 `registry/<id>/<version>.yaml`，并在 `registry/index.json` 记录内容 SHA-256。已发布的 id/version 拒绝覆盖。
3. `npm run build` 把注册表复制进两个插件，然后提交并走 PR 评审。

不可变性检查（CI 的 `registry` 任务）：`npm run check-registry -- origin/main` 确认每个快照的哈希正确、工作区模板若与已发布版本同号则内容一致、以及基准分支上已发布的版本没有被修改或删除。发布记录绑定的 Git commit 就是把该快照合入 main 的 commit。

## golden 测试

`tests/fixtures/golden/<case>.json` 是一次 `render_prompt` 请求（`template_ref`，或用 `template_file` 指向 `tests/fixtures/templates/` 下的未发布模板）。期望输出：

- `tests/snapshots/<case>.prompt.txt`：逐字节的 Prompt；
- `tests/snapshots/<case>.result.json`：其余返回值（`prompt_sha256`、`renderer_version`、模板哈希、errors / warnings）。

有意修改渲染结果时运行 `npm run golden:update`，并在 PR 中说明差异。`.gitattributes` 固定 LF，保证 Windows 检出后结果相同。

## 构建插件

`npm run build` 用 esbuild 把 MCP 服务器打包成单文件 `standard-prompt-mcp.mjs`（用户不需要 `npm install`），连同 `registry/` 复制到 `adapters/claude/server/` 和 `adapters/chatgpt/server/`。构建产物要提交；CI 用 `npm run build -- --check` 确认没有过期。

服务器查找注册表的顺序：环境变量 `SPT_REGISTRY_DIR` → 服务器文件旁的 `registry/` → 仓库根目录的 `registry/`。

## 安装插件

前提：Node.js 20 以上。

**Claude Code**

```text
claude plugin marketplace add simonwillker/standard-prompt-app
claude plugin install standard-prompt@standard-prompt-app
```

**Codex（CLI 或 ChatGPT 桌面版中的 Codex）**

```text
codex plugin marketplace add simonwillker/standard-prompt-app
codex plugin add standard-prompt@standard-prompt-app
```

私有仓库需要本机 Git 有读取权限；也可以先克隆仓库，再用本地路径代替 `simonwillker/standard-prompt-app`。

## 宿主验证

`npm run host-e2e`（设置 `CLAUDE_BIN` / `CODEX_BIN`）在临时配置目录中从本仓库的插件市场安装两个插件，启动宿主，用脚本化的假模型调用 `render_prompt`，确认两个宿主收到的 `prompt_sha256` 与 golden 一致。CI 的 `hosts` 任务在 Windows / macOS / Linux 上运行它（Claude Code 2.1.289、Codex CLI 0.160.0）。不使用真实模型或账号，所以不验证模型是否会按 Skill 选择工具。

## 与规格的差异

- 规格 7.3 / 7.4 写的 ChatGPT 插件格式是根目录 `plugin.json` + `mcp.json`。实际 Codex CLI 0.160.0 读取的是 `.codex-plugin/plugin.json` 和 `.mcp.json`，本实现按实际格式。
- Codex 不展开 `.mcp.json` 参数中的 `${PLUGIN_ROOT}`；`cwd: "."` 会解析为插件根目录，所以使用相对路径 `./server/standard-prompt-mcp.mjs`。

## 尚未覆盖

- Claude 桌面版 / Cowork 是否加载插件内的本地 MCP 服务器（规格 7.4 第 2 项）。
- 用真实模型确认 Skill 的对话流程（收集变量、原样展示 Prompt）。
