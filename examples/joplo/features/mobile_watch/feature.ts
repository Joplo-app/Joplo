import { feature, role, rule } from '@joplo-app/kit';

export default feature({
  order: 13,
  name: '手机上像看视频一样看分享',
  goal: '观众在手机上打开分享链接，能像看一个分章节的视频那样从头看到尾：竖屏不变形，横过来铺满屏幕，一章播完自动接下一章',
  roles: {
    chen: role('小陈', { desc: '在地铁上用手机打开同事发来的分享链接' }),
  },
  cases: {
    now: { title: '现在：竖屏打开分享', dimension: 'main', priority: 'high', expected: '（现状）画面被按手机宽度重新排版，挤成竖条；图层标签挤在一起，字幕被盖住，控制条溢出' },
    watch: { title: '从头看到尾，横过来看', dimension: 'main', priority: 'high', expected: '竖屏是 16:10 的画面加章节列表；一章播完自动进入下一章；点「横屏」或把手机横过来就铺满屏幕，点画面才出控件' },
    ios_locked: { title: 'iPhone 锁着竖屏点「横屏」', dimension: 'permission', priority: 'high', expected: '网页不能全屏也不能锁方向，就把画面转 90° 铺满屏幕，提示把手机横过来；手机真的横过来后取消旋转' },
    optional_branch: { title: '可选支线不打断连续观看', dimension: 'lifecycle', expected: '连续播放只经过主线；支线可从选择入口打开，结束后停下' },
    end: { title: '最后一章播完', dimension: 'lifecycle', expected: '停在结束画面：重看、复制链接；不再自动跳到别处' },
  },
  rules: {
    optional_autoplay: rule('作者可以将支线标为 autoplay:false；发布站连续播放跳过它，手动和 fork 仍可访问，支线结束不自动跳走', { origin: 'code_observed', status: 'pending', cases: ['optional_branch'] }),
    video_aspect: rule('手机上舞台按作者的设计尺寸（电脑页面 16:10）整体等比缩放，像视频一样留黑边，不按手机宽度重新排版', { origin: 'user', status: 'confirmed', cases: ['now', 'watch'], elements: ['p_video', 'n_video'] }),
    autoplay_next: rule('自动播放时，一个场景播完先在画面上显示「下一章」和 3 秒倒计时（可立即播放或取消），再接着播下一个场景（按功能里的场景顺序），直到最后一个；手动一步步看时不自动跳', { origin: 'user', status: 'confirmed', cases: ['watch', 'end'], elements: ['p_chapters'] }),
    landscape_fill: rule('横屏时只保留画面和字幕，铺满屏幕；控件浮在画面上，点一下画面出现，约 3 秒没操作就隐藏', { origin: 'user', status: 'confirmed', cases: ['watch'], elements: ['l_stage', 'l_controls'] }),
    android_lock: rule('支持的浏览器（安卓 Chrome 等）点「横屏」时请求全屏并锁定横向；不支持时退回下面的伪横屏', { origin: 'user', status: 'confirmed', cases: ['watch', 'ios_locked'], elements: ['p_land'] }),
    ios_rotate: rule('iPhone 的 Safari 不能让网页元素全屏、也不能锁方向：点「横屏」时画面铺满可视区域，手机还竖着就把画面转 90°；手机横过来后不再旋转', { origin: 'user', status: 'confirmed', cases: ['ios_locked'], elements: ['r_stage', 'r_hint'] }),
    swipe_steps: rule('横屏时左右滑动切到上一步 / 下一步，点画面只显示或隐藏控件，不会误点画面里的按钮', { origin: 'user', status: 'confirmed', cases: ['watch'], elements: ['l_stage'] }),
    mobile_chrome: rule('手机竖屏不显示图层标签和「跟随导演」：始终跟着导演看；字幕完整换行，不被朗读标签盖住；控制条一行放得下', { origin: 'user', status: 'confirmed', cases: ['now', 'watch'], elements: ['p_caption', 'p_controls'] }),
    captions_bottom: rule('横屏时字幕在底部：黑边放得下就落在黑边里，放不下就叠在画面底部（像视频字幕）', { origin: 'user', status: 'confirmed', cases: ['watch'], elements: ['l_caption'] }),
    desktop_next_too: rule('电脑上的分享站同样自动接下一章，和手机一致', { origin: 'user', status: 'confirmed', cases: ['watch'] }),
  },
  pick: 'a-video',
});
