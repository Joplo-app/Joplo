import { $, done, flow, option, set, uses } from '@joplo-app/kit';
import { Cmd } from '../../../shared/distribution/term.tsx';
import { run } from '../../../shared/distribution/steps.ts';
const recover = 'node --input-type=module -e "import(\'@joplo-app/plugin-alda/local\').then(m=>m.installSoundfont())"';
export default option({
  name: 'A · 本机渲染，音频随站点',
  idea: '按 D93 当前实现制作流程示意；终端文字是可读示例，精确测量以真实项目 check/build 为准',
  state: { ui: { checked: false, built: false, offline: false, ready: false, wrong: false, fixed: false } },
  on: { '/distribution/terminal': { lines: [
    <Cmd id="music_check" when={$.ui.checked} cmd="npx joplo check" out={'MUSIC_SCORE film: 24.000 s; piano=16, percussion=32\nmarkers %opening=0.000 s, %chapter=12.000 s\n0 error · 示例输出，按实际曲式核对'} />,
    <Cmd id="music_build" when={$.ui.built} cmd="npx joplo build" out={'MEDIA_ASSET: MP3 96kbps 字节数与时长\nMEDIA_BUDGET / SITE_BUDGET: 音频与整站预算\ncredits.txt + music-LICENSE.txt: FluidR3Mono GM · MIT\n源谱、SoundFont 和本机路径不进入站点'} />,
    <Cmd id="music_offline" when={$.ui.offline} cmd="npx joplo build" tone="error" out={'SoundFont cache missing or invalid; download failed (offline).\n联网预安装，或复制经校验的 soundfonts/<hash>/（含 LICENSE.md）。\n其他画面仍可构建；缺失的音乐不能在发布站补做。'} />,
    <Cmd id="music_ready" when={$.ui.ready} cmd={recover} out={'音色与许可 SHA-256 校验后保存在 JOPLO_HOME。\n再次构建复用缓存，不要求观众安装软件。'} />,
    <Cmd id="music_wrong" when={$.ui.wrong} cmd="npx joplo check" tone="error" out={'error MUSIC_MARKER_MISSING\nmusic.play 的 from 指向不存在的 %chpater\n这是检查结果示意；实际诊断包含作者文件与行号。'} />,
    <Cmd id="music_fixed" when={$.ui.fixed} cmd="npx joplo check" out={'from 改为 chapter（不带 %）\nMUSIC_SCORE: %chapter=12.000 s\n0 error；IR 写入 offsetMs=12000，不写 marker 字符串。'} />,
  ] } },
  scenarios: {
    marker: run(flow('核对曲式，再从章节起播', {start:'/distribution/terminal',cases:['marker'],mock:'当前实现的终端流程示意；不会执行 shell 或发布',expected:'同一个 marker 时间用于起播、跳步和深链'}).card('先算小节，再核对章节', {sub:'8 小节 × 4 拍 × 60 / 80 BPM = 24 秒；旁白下留出空间'}), 'npx joplo check', $.ui.checked, '核对声部小节数和 marker 的实际时间', uses('timing')).key('check-markers')
      .system('从章节进入', '从 chapter 起播，旁白下压低配乐', uses('rendered'))
      .type('term_cmd','npx joplo build','只把音频与署名打进站点',set($.ui.built,true),set($.inputs.term_cmd,''))
      .system('检查实播和视频', '实播与视频都验证；没听过就如实说明', done('完成本机验证，再决定是否发布')),
    offline: run(flow('离线缓存缺失后的恢复', {start:'/distribution/terminal',cases:['offline'],mock:'模拟断网与未安装音色；不会下载文件',expected:'拿到经校验的共享缓存后再离线构建'}), 'npx joplo build', $.ui.offline, '音色缺失时给出恢复命令', uses('recovery')).key('missing-cache')
      .type('term_cmd',recover,'联网机器先安装，离线机器复制完整缓存',set($.ui.ready,true),set($.inputs.term_cmd,''))
      .system('重新构建', '校验音色哈希，音色文件不进入站点', done('恢复配乐，不扩大到上传或发布')),
    missing: run(flow('修复拼错的章节 marker', {start:'/distribution/terminal',cases:['missing'],mock:'模拟 from 拼写错误；不会修改作者文件',expected:'修复后得到可跳入的数字音频快照'}), 'npx joplo check', $.ui.wrong, '定位未知 marker', uses('timing','recovery')).key('unknown-marker')
      .system('按检查结果修改 from', 'chapter 是 marker 名；声明用 %chapter，from 不带 %', set($.ui.fixed,true))
      .system('重新检查', done('错误清除后，再 build 并实际听一遍')),
  },
});
