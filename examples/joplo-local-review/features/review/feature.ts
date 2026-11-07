import { feature, question, rule } from '@joplo-app/kit';

export default feature({
  name: '本地评审与 Agent 反馈',
  goal: '评审者直接在演示里反馈和确认，让等待中的 Agent 收到带页面上下文的结果',
  roles: ['本地评审者', '编码 Agent'],
  cases: {
    feedback: { title: '写反馈，然后确认方案', dimension: 'main', priority: 'high', expected: '反馈浮层不挤压演示页面；提交后立即输出到终端；在浮层确认方案后，监听命令以 0 退出' },
    direct_confirm: { title: '无需反馈，直接结束评审', dimension: 'main', priority: 'high', expected: '点击反馈图标打开浮层，不填写反馈也能确认方案，终端收到确认后退出' },
    pages: { title: '切换页面，反馈仍有准确位置', dimension: 'consistency', priority: 'high', expected: '切页不丢草稿；反馈绑定打开面板时的页面、场景和步骤；终端逐条收到不同页面的反馈' },
    isolation: { title: '多个本地实例同时等待', dimension: 'conflict', priority: 'high', expected: '未指定会话时拒绝猜测；显式绑定后，B 的反馈与确认不会进入或结束 A 的监听' },
    reconnect: { title: 'Agent 断线后重新接入', dimension: 'interrupt', priority: 'high', expected: '本地保存反馈与确认，重连从游标补收，收到确认后正常退出' },
  },
  rules: {
    right_feedback: rule('右侧反馈图标打开浮层，覆盖在演示上方，不挤压或折叠演示页面；浮层内既可提交反馈，也可直接确认方案、结束本次评审', { origin: 'user', status: 'confirmed', cases: ['feedback', 'direct_confirm'] }),
    stream_exit: rule('反馈逐条输出，确认方案后监听命令退出', { origin: 'user', status: 'confirmed', cases: ['feedback', 'reconnect'] }),
    session: rule('拟议：会话 ID 绑定实例 ID、项目真实路径、功能、方案和版本；端口只用于连接，不作为会话身份；有歧义时报错要求指定会话', { cases: ['isolation'] }),
    context: rule('拟议：打开反馈面板时锁定页面、场景和步骤；切页保留草稿与定位，提交后下一条可绑定新页面', { cases: ['pages'] }),
    durability: rule('拟议：先持久化事件再显示已保存；事件按会话递增编号，监听可用 --after 补收，消费者按会话和编号去重', { cases: ['reconnect'] }),
    approval: rule('拟议：确认只结束当前方案版本的评审，不代表反馈已实现；有草稿时先提交，确认后本轮反馈只读', { cases: ['feedback'] }),
  },
  questions: {
    revision: question('Agent 修改源码后，是否自动开启新一轮评审？本版暂按会话绑定固定版本，旧确认不沿用到新版。', { severity: 'major', refs: ['feedback'] }),
  },
});
