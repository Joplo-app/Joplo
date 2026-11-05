<p align="center"><img src="https://raw.githubusercontent.com/TokenRollAI/Joplo/main/assets/brand/joplo-logo.svg" alt="Joplo" width="300"></p>

# joplo

先把功能做成低保真、可点击、可演示的原型，再让编码 Agent 去写代码。

```sh
npx joplo@latest init my-demo
cd my-demo && npm install
npx joplo dev            # 本地看板：http://127.0.0.1:4790/
npx joplo skill install  # 让 Claude Code / Codex 按需读取 Joplo 的用法
```

- 用 TSX 描述页面、方案、情况、规则和演示步骤；看板里按情况比较方案，⌥+单击元素拿到 `文件:行`。
- 层级、导演镜头、架构图（`Diagram` + `trace()`）、终端和手机外框、自定义主题。
- `npx joplo build` 生成可直接部署的静态演示站。

文档与示例：<https://github.com/TokenRollAI/Joplo>。许可证：Apache-2.0。
