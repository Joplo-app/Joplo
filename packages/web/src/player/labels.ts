/** 看板与发布站共用的中文标签与芯片样式。 */
export const OUTCOME_LABEL: Record<'success' | 'failure' | 'cancelled', string> = { success: '成功', failure: '失败', cancelled: '已取消' };

export const MOCK_CLS: Record<'success' | 'failure' | 'denied' | 'other', string> = {
  success: 'border-[#2b8a3e] text-[#2b8a3e] bg-[#effaf1]',
  failure: 'border-[#c92a2a] text-[#c92a2a] bg-[#fff0f0]',
  denied: 'border-[#5a5a5a] text-[#3a3a3a] bg-[#f4f4f4]',
  other: 'border-[#5a5a5a] text-[#3a3a3a] bg-[#f4f4f4]',
};

export const ACTION_LABEL: Record<string, string> = { click: '点击', type: '输入', select: '选择', toggle: '切换', back: '返回', event: '系统事件' };
