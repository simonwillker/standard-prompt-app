# standard-prompt-app

标准Prompt模板APP：根据需求填写固定项目，生成结构统一的标准Prompt，使 AI 每次输出结构更一致的结果（不保证 AI 回答质量或措辞完全相同）。

- 仕様书：[docs/spec.md](docs/spec.md)（v0.6 草案，已修订评审问题；平台验证待完成）
- 交付形态：Claude 插件 + ChatGPT 插件（共用核心规则与模板）
- 状态：核心渲染器、CLI、已发布模板注册表、MCP 服务器、Claude 插件和 ChatGPT（Codex）插件已实现；安装与开发说明见 [docs/development.md](docs/development.md)
