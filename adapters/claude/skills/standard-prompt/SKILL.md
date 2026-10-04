---
name: standard-prompt
description: 用标准 Prompt 模板生成逐字可复现的 Prompt，或新建、校验、导入模板。用户提到“标准 Prompt”“Prompt 模板”“会议纪要/邮件回复/需求提取模板”、要求按固定格式生成 Prompt，或要创建/校验模板 YAML 时使用。Use for standardized prompt templates.
---

# 标准 Prompt 模板

Prompt 只能由 `standard-prompt` MCP 服务器的渲染器生成。你只负责收集变量值、调用工具和展示结果，不要自己拼装或改写 Prompt。

## 工具

| 工具 | 用途 |
|---|---|
| `list_templates` | 列出已发布模板（可传 `query` 关键字） |
| `get_template` | 按 `id` + 精确 `version` 读取模板定义和变量列表 |
| `validate_template` | 校验 `{format: "yaml" \| "json", content}`，返回 errors / warnings |
| `render_prompt` | `template_ref: {id, version}` 或 `template_source: {format, content}` 二选一，加上 `variables` |

## 用已有模板生成 Prompt

1. 调用 `list_templates`（用户给了关键字就传 `query`），让用户选模板。同一 id 有多个版本时默认用最新版本，并说明版本号。
2. 调用 `get_template` 取得变量列表。按 `variables` 的顺序向用户收集值：
   - 显示 `label` 和 `description`；`required: false` 或有 `default` 的变量可以跳过，跳过时不要传这个 key。
   - `select` 只能从 `options` 里精确选择；`number` 传 JSON 数字并遵守 `minimum` / `maximum`；`boolean` 传 `true` / `false`；`date` 传 `YYYY-MM-DD` 字符串。
   - `text` / `textarea` 的内容原样传入，不要概括、翻译或改写用户提供的正文。
3. 调用 `render_prompt`，传 `template_ref: {id, version}` 和 `variables`。
4. 成功（`ok: true`）时：
   - 把返回的 `prompt` **原样**放进代码块展示，不得增删任何字符。代码围栏要比 prompt 中最长的连续反引号多至少 1 个（例如 prompt 含 ```` ``` ```` 时用 ````` ```` `````）。
   - 在代码块下面写一行：模板 `id@version`、`prompt_sha256`。有 `warnings` 时逐条列出。
5. 失败（`ok: false`）时：不要输出任何 Prompt。逐条说明 `code`、`path` 和 `message`，告诉用户需要补充或修改什么，修正后重新调用。

常见错误码：`VARIABLE_REQUIRED`（必填项未填）、`VARIABLE_INVALID`（类型、选项或范围不对，或传了未定义的变量）、`NO_INPUT_DATA`（没有任何输入正文）、`INPUT_BOUNDARY_COLLISION`（输入里含有本次生成的边界标签，请用户修改输入）、`TEMPLATE_NOT_FOUND`（id 或版本不存在，先用 `list_templates` 确认）。

## 新建或导入模板

1. 按顺序向用户收集：角色、任务、输入说明、变量（每个变量的 key、label、type、placement、required，以及需要的 default / options / minimum / maximum）、输出格式（markdown / text 的 `template`，或 json 的 `schema`）、示例（可选）、约束（可选）、信息不足处理（`mark_unknown` + `value`，或 `ask`）。
2. 生成符合 `schema_version: 1` 的 YAML。长文本、会议记录、邮件正文等必须用 `placement: input`；`placement: inline` 只用于 select / number / boolean / date 等短控制参数，并在文本中用 `{{key}}` 引用。
3. 调用 `validate_template`。有 errors 时按 `path` 修正后重新校验，直到 `valid: true`；warnings 要告诉用户。
4. 需要试生成时，用 `render_prompt` 的 `template_source: {format: "yaml", content}` 渲染，展示规则同上。直接传入的模板不会被保存或发布。
5. 把最终 YAML 放在代码块中交给用户。当前工作区可写且用户同意时，可以写入项目的 `templates/<id>.yaml`；发布新版本（写入 `registry/`）由模板管理者通过 Git 评审完成，不要自行发布。

## 其他规则

- MCP 工具不可用时，只能给出草稿，并在开头明确标注“非正式 Prompt，未经渲染器生成”。
- 不要把会议记录、邮件正文、代码等运行时输入写入模板文件或提交到 Git，除非用户明确要求。
