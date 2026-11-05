# v1 归档示例（只读）

这里是 M0 阶段的 JSON 格式项目（`project.joplo.json` + patch）。M0 之后，创作格式改为 TSX（见 [ADR-0002](../../docs/adr/0002-hugo-like-authoring.md)），当前 CLI 不再读取这些文件。保留它们，是为了记录当时的设计过程。

- `invite/`：团队邀请示例的 v1 版本。新版本见 `examples/invite/`。
- `joplo-self/`：“用 Joplo 设计 Joplo”的自迭代项目。它比较了看板布局的三个方案：A 折叠、B 模式决定信息量、C 标注；用户最终选定 **B**，见 `DECISIONS.md` D32。`patches/` 是当时提交的 patch，可以用 `generate.py` 重新生成。
