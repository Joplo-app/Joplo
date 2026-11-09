import { feature, rule } from '@joplo-app/kit';

export default feature({
  name: '一键离家',
  goal: '出门时点一下，灯、空调、电视自动关闭，门自动上锁；门窗没关好时告诉你是哪一扇，并能直接在家里的 3D 画面上关上',
  roles: ['住户'],
  cases: {
    happy: { title: '门窗都关好，一键离家', priority: 'high', expected: '灯、空调、电视依次关闭，入户门上锁，提示已离家' },
    window_open: { title: '有窗户没关', dimension: 'consistency', priority: 'high', expected: '不直接离家：指出是哪扇窗并在 3D 画面里定位，关好后再离家' },
    manual: { title: '在 3D 画面里直接开关设备', dimension: 'main', expected: '点 3D 里的设备或 App 开关都能控制，两边状态一致' },
    offline: { title: '有设备离线', dimension: 'async' },
  },
  rules: {
    check_first: rule('离家前先检查门窗，有没关好的就不执行离家', { origin: 'ai_assumption', status: 'pending', cases: ['window_open'], elements: ['btn_away', 'alert_window'] }),
    in_sync: rule('App 开关与 3D 画面显示同一份设备状态', { origin: 'ai_assumption', status: 'pending', cases: ['manual'], elements: ['sw_lamp', 'lamp'] }),
  },
  pick: 'a-one-tap',
});
