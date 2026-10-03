# 首批程序代码：核心与 CLI

本分支按 v0.6 规格实现首个开发阶段：安全模板导入、Schema 与语义校验、确定性序列化、Prompt 渲染、三种内置模板和命令行入口。

**验证状态：尚未执行。** 提交时本地命令和备用 Node 运行环境均无法启动。测试代码已提供，但不能把它视为测试通过或可发布的 MVP。依赖安装完成后，先运行：

```text
npm install
npm run check
npm test
npm run list
npm run validate -- templates/meeting-minutes.yaml
npm run render -- --template templates/meeting-minutes.yaml --vars-file examples/meeting-input.json
```

模板 .yaml 使用 JSON 兼容 YAML 1.2 语法，便于首批模板静态检查。代码中的 schema.ts 是 schema/template.schema.json 的生成副本，测试要求两者一致。

当前 CLI 仅支持直接传入模板文件。MCP 服务、发布模板版本注册表、插件打包、平台安装验证、CI 矩阵和独立打包产物尚未实现。完成这些工作及全部验收前，不合并为可发布 App。

待补充：
- MCP 四个工具与精确版本读取，错误码及返回值契约。
- 两个平台最小插件安装及本地 MCP 调用验证。
- 所有 Error/Warning 的逐项用例、golden 文件、跨系统测试。
- 锁定依赖、生成 Schema 副本的构建步骤、单文件 CLI/MCP 包。
