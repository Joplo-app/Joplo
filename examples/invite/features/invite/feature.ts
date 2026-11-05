import { feature, question, rule } from '@joplo-app/kit';

export default feature({
  name: '团队成员邀请',
  goal: '空间管理员邀请成员加入空间，并指定其协作权限',
  roles: ['空间管理员', '普通成员', '受邀者'],
  constraints: {
    admin_only: '非管理员不能邀请',
    revocable: '邀请应可撤销',
    role_cap: '受邀者不能获得高于设定的权限',
  },
  cases: {
    happy: { title: '正常发出邀请并被接受', priority: 'high', expected: '管理员发出邀请，受邀者接受后成为成员' },
    no_permission: { title: '非管理员尝试邀请', dimension: 'permission', priority: 'high', expected: '不能发起邀请，并看到原因' },
    invalid_input: { title: '邮箱为空或格式无效', dimension: 'input', priority: 'high', expected: '阻止提交并就地提示' },
    revoked: { title: '邀请被撤销后再次打开链接', dimension: 'lifecycle', priority: 'high' },
    expired: { title: '邀请过期后访问', dimension: 'lifecycle' },
    already_member: { title: '被邀请人已经是成员', dimension: 'conflict' },
    duplicate_submit: { title: '连续点击发送', dimension: 'conflict', expected: '只创建一次邀请' },
    request_failed: { title: '发送请求失败', dimension: 'async', priority: 'high', expected: '明确失败，保留输入，可以重试' },
  },
  rules: {
    admin_only: rule('只有空间管理员可以发起邀请', { origin: 'user', status: 'confirmed', cases: ['no_permission'], elements: ['btn_invite', 'btn_batch'] }),
    role_cap: rule('受邀者获得的权限不能高于邀请时设定的权限', { origin: 'user', status: 'confirmed', cases: ['happy'] }),
    revocable: rule('已发出的邀请可以撤销', { origin: 'user', status: 'confirmed', cases: ['revoked'] }),
  },
  questions: {
    already_member: question('被邀请人已经是成员时，应该报错还是静默跳过？', { refs: ['already_member'] }),
  },
  pick: 'a-modal',
});
