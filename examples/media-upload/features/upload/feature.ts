import { feature } from '@joplo-app/kit';

export default feature({
  name: '上传产品演示视频',
  goal: '大文件上传时能看到进度，完成后马上知道成功了',
  roles: ['做产品发布的运营'],
  pick: 'a',
  cases: {
    happy: { title: '上传成功', dimension: 'main', priority: 'high', expected: '看到进度走完，并出现成功的提示' },
  },
});
