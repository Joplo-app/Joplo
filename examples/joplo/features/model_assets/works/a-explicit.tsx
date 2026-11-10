import { $, done, flow, work, set, spotlight, uses } from '@joplo-app/kit';
const show=(title:string,detail:string,command:string)=>[set($.ui.modelTitle,title),set($.ui.modelDetail,detail),set($.ui.modelCommand,command)];
export default work({
  title:'A · 明确生成，产物随 Git',
  summary:'生成是一项显式操作；构建和播放只使用已有产物',
  state:{ui:{modelTitle:'先看费用',modelDetail:'缺少产物时显示预计 credits；不因已配置密钥而自动生成。',modelCommand:'joplo resources --dry-run'}},
  scenarios:{
    generate:flow('从缺少模型到明确生成',{start:'/models',cases:['generate'],expected:'费用先展示，生成只发生在明确确认之后'})
      .system('先看估计',spotlight('model_status'),uses('spend'))
      .system('保存密钥只配置本机',spotlight('model_key'))
      .system('终端逐项确认',...show('确认之后才创建任务','非交互环境默认不花钱；只有已经获得授权才加 --allow-spend。','joplo resources'))
      .system('提交可复用产物',...show('模型与元数据进入 Git','产物为 assets/models/<hash>.glb 与同名 JSON；不要提交密钥。','git add assets/models/'),done('队友能复用同一模型')),
    offline:flow('离线构建与查看',{start:'/models',cases:['offline'],expected:'没有密钥、没有网络，仍能读取模型'})
      .system('读取已有 GLB',...show('先读项目文件','check/build/render 不重新请求生成；描述或参数不变就复用同一产物。','joplo build'),uses('offline'))
      .system('用离线站点验证',...show('打开 file:// 站点','检查模型、贴图、锚点和聚焦；截图等待加载完成。','dist/index.html'),done('构建与观众播放无需作者的 Key')),
    recover:flow('断网后续查任务',{start:'/models',cases:['recover'],expected:'已记录的任务继续轮询；结果不明时先查历史'})
      .system('保留任务记录',...show('已保存 task_id','网络恢复后续查同一任务，不再次创建。','joplo resources'),uses('recovery'))
      .system('未知结果需要人工核对',...show('creating / unknown 不盲重试','从供应商任务历史恢复 task_id，再续查。不要删除日志来绕过保护。','assets/models/<hash>.json'),done('本地超时不等于供应商退款')),
  },
});
