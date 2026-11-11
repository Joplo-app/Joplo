import { $, done, mock, push, response, set, toast, uses } from '@joplo-app/kit';

/**
 * 系统响应只写一次。元素的事件里写 api.sendInvite，表示“这里发了一个请求”：
 * - 剧本里：这一步之后编译器自动接一个系统步骤，结果按切片的 api 选项依次取（缺省第一个）。
 * - 观众接管时：按看板里选的结果（缺省第一个）在本地层生效，不推进时间线。
 */
export const api = {
  sendInvite: mock('发送邀请', {
    ok: response('邀请请求成功（模拟）', '发送成功：弹窗关闭，邀请进入待接受',
      set($.ui.sending, false), set($.ui.error, ''), set($.ui.inviteOpen, false),
      push($.data.pending, { email: 'li.lei@example.com', role: '编辑者', status: '待接受' }),
      toast.success('已向 li.lei@example.com 发送邀请'),
      done('邀请已发出，等待对方接受')),
    timeout: response('邀请请求失败（模拟网络超时）', '发送失败：弹窗不关，保留已填内容',
      set($.ui.sending, false), set($.ui.error, '网络超时。已保留你填写的内容，可以重试。'), uses('keep_input')),
  }),

  sendBatch: mock('批量发送邀请', {
    partial: response('批量请求返回（模拟）', '2 个成功、1 个失败，逐个显示结果',
      set($.ui.partial, true),
      push($.data.results, { email: 'a@company.com', result: '已发送' }),
      push($.data.results, { email: 'b@company.com', result: '已发送' }),
      push($.data.results, { email: 'bad@', result: '失败：邮箱格式无效' }),
      toast('2 个邀请已发送，1 个失败'),
      done('部分完成：失败项可以单独重试')),
  }),
};

export const members = [
  { name: '王芳', email: 'wang.fang@example.com', role: '管理员' },
  { name: '陈晨', email: 'chen.chen@example.com', role: '编辑者' },
  { name: '刘洋', email: 'liu.yang@example.com', role: '查看者' },
];
export const pending = [{ email: 'zhao.lei@example.com', role: '查看者', status: '待接受' }];
