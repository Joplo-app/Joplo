import { feature } from '@joplo-app/kit';

export default feature({
  name: '接口失败自动重试',
  goal: '偶发的 5xx 不再让页面白屏：请求失败先被看见，再按指数退避重试，4xx 不重试',
  roles: ['维护前端的工程师'],
  pick: 'a',
  cases: {
    happy: { title: '修好偶发的 503', dimension: 'main', priority: 'high', expected: '测试从 1 个失败变成 3 个通过' },
  },
});
