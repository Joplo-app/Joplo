# CLAUDE.md

本仓库的协作约定以 [AGENTS.md](AGENTS.md) 为准，Claude Code 同样遵守，这里不重复全文。

需要特别记住的一条：

- **做任何 Example，都把好的实践与新范式沉淀进 Joplo 技能。** 示例中发现的新画面手法、组织方式、叙事结构、踩过的坑，以及为此修复的 Joplo 问题，在同一个 PR 里写进 `packages/core/src/guide.ts` 的对应主题（必要时同步 `SKILL_TOPICS` 简介），运行 `pnpm skills:build`；写成可复用的做法，不写示例专属内容。交付时向用户说明沉淀了哪些条目。详见 AGENTS.md「做示例时，好的实践与新范式也要沉淀进技能」。
