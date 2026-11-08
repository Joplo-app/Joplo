import { feature, question, rule } from '@joplo-app/kit';

export default feature({
  order: 8,
  name: 'Agent 用法：npx joplo skill',
  goal: '编码 Agent 在任何 Joplo 项目里都能按需拿到正确的写法，只读需要的那一段，内容始终与项目安装的版本一致',
  roles: ['用户', '编码 Agent（Claude Code、Codex 等）'],
  cases: {
    discover: { title: 'Agent 第一次在 Joplo 项目里工作，找到正确用法', dimension: 'main', priority: 'high', expected: '用 Joplo 的 TSX 写法开工，而不是自己写 React' },
    auto_discover: { title: '用户没有提醒用法时，Agent 也能自己发现', dimension: 'main', priority: 'high' },
    on_demand: { title: '只读需要的主题，不一次读入全部用法', dimension: 'consistency', priority: 'high', expected: '一次任务通常读 1～2 个主题，每个主题少于 150 行' },
    typo: { title: '主题名拼错', dimension: 'input', expected: '提示最接近的主题，退出码 2' },
    existing_file: { title: '项目里已有被用户修改过的 skill 文件', dimension: 'conflict', priority: 'high', expected: '不覆盖，说明怎样查看差异或强制更新' },
    version_drift: { title: '升级 joplo 之后，用法内容是否过期', dimension: 'consistency', priority: 'high' },
    other_agents: { title: 'Codex 等不读 .claude/skills 的 Agent', dimension: 'main' },
  },
  rules: {
    short_topics: rule('每个主题少于 150 行；主题之间互相引用，不重复内容', { cases: ['on_demand'] }),
    same_version: rule('用法内容由项目安装的 CLI 输出，与编译器支持的组件和 API 一致', { cases: ['version_drift'] }),
    typo_hint: rule('未知主题时列出最接近的主题名，退出码 2', { cases: ['typo'] }),
    guide_merged: rule('现有的 joplo guide 拆成 skill 主题，joplo guide 保留为 joplo skill authoring 的别名', { cases: ['discover'] }),
  },
  questions: {
    topics: question('主题按“任务”拆（authoring / components / cases / check / selection / publish）合适吗？', { severity: 'major', refs: ['on_demand'] }),
    agents_md: question('install 是否默认往 AGENTS.md 追加一段，还是要加 --agents-md 才写？', { severity: 'major', refs: ['other_agents'] }),
  },
  pick: 'b-pointer',
});
