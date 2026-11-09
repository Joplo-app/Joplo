import { camera } from '@joplo-app/plugin-content';
import { $, done, explain, flow, layer, mark, narrate, option, patch } from '@joplo-app/kit';
import { BoardLayer } from '../../../shared/board.tsx';

const ui = (v: Record<string, boolean>) => patch($.ui, v);

const happy = flow('收邮件、点链接就登录', { cases: ['happy'], start: '/', description: '输入邮箱，点邮件里的链接，直接进首页' })
  .type('email', 'lin@team.io', '输入工作邮箱', narrate('老用户不用记密码，只要输入工作邮箱。'))
  .click('submit', '发送登录链接', ui({ sent: true }), camera('login', 'sent'), narrate('点一下，系统就把一次性的登录链接发到邮箱。'))
  .system('不暴露账号', '没注册也提示“已发送”', ui({ privacy: true }), camera('login', 'sent', 'n_privacy'), explain('邮箱有没有注册，页面都一样'), narrate('就算邮箱没注册，也一样显示已发送，别人就试不出谁有账号。'))
  .click('open_mail', '去邮箱', ui({ mail: true }), camera('sent', 'inbox'), narrate('打开邮箱，登录邮件已经到了。'))
  .click('link', '点邮件里的链接', ui({ home: true }), camera('inbox', 'home'), narrate('点一下链接，直接进首页，全程不用输入密码。'))
  .system('总览', '一封邮件，两次点击', camera('login', 'sent', 'inbox', 'home', 'n_privacy', 'n_device', { pad: 80 }), done('登录成功'));

const expired = flow('链接过期了', { cases: ['expired'], start: '/', description: '过了 15 分钟才点链接，一键重新发送' })
  .type('email', 'lin@team.io', '输入工作邮箱')
  .click('submit', '发送登录链接', ui({ sent: true }), camera('login', 'sent'))
  .click('open_mail', '去邮箱', ui({ mail: true }), camera('sent', 'inbox'))
  .system('15 分钟后', '过了 15 分钟才点', ui({ late: true }), camera('inbox'), mark('expiry_hint', { kind: 'underline' }), narrate('但链接只在十五分钟内有效。'))
  .click('link', '点了旧链接', ui({ expired: true }), camera('inbox', 'expired'), explain('过期或用过的链接都会失效'), narrate('过期以后再点，会看到链接已过期。'))
  .click('resend', '一键重新发送', ui({ resent: true }), camera('expired', 'sent'), mark('resent_title', { kind: 'circle' }), narrate('不用重新输入邮箱，点一下就发来新的链接。'))
  .system('总览', '拿到新链接，回到第 2 步', camera('login', 'sent', 'inbox', 'expired', 'n_once', { pad: 80 }), done('拿到新链接'));

export default option({
  name: '流程白板',
  idea: '整个流程画在一块白板上：每屏是普通的 ui 画面，箭头连成流程，便签写边界情况，镜头跟着步骤走',
  layers: { board: layer('白板', <BoardLayer />, { icon: 'flow' }) },
  state: {
    ui: {
      __plugins: { content: { camera: { targets: ['login'], pad: 120 } } },
      sent: false, privacy: false, mail: false, home: false, late: false, expired: false, resent: false,
    },
  },
  scenarios: { happy, expired },
});
