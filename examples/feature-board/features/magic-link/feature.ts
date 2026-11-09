import { feature } from '@joplo-app/kit';

export default feature({
  name: '免密登录：邮箱里的一次性链接',
  goal: '老用户不用记密码：输入邮箱，点邮件里的链接就登录；链接过期时一键重新发送',
  roles: ['偶尔登录、记不住密码的老用户'],
  pick: 'a',
  cases: {
    happy: { title: '收邮件、点链接就登录', dimension: 'main', priority: 'high', expected: '输入邮箱 → 收到邮件 → 点链接，直接进入首页' },
    expired: { title: '链接过期了', dimension: 'lifecycle', priority: 'high', expected: '看到“链接已过期”，一键重新发送，拿到新链接' },
  },
});
