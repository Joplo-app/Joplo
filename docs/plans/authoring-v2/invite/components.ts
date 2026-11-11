/**
 * 把产品组件登记给 Joplo：只声明“它是哪种控件、状态从哪个 prop 进、事件从哪个 prop 出”。
 * 登记后的组件在作品里写 JSX 时不会被调用，而是编译成 `app:<名字>` 节点（见提案 E2）。
 */
import { adopt } from '@joplo-app/kit';
import * as ds from './design-system/index.tsx';

export const Button = adopt(ds.Button, { as: 'button' });                           // onClick → click 动作
export const TextField = adopt(ds.TextField, { as: 'input', text: ['label', 'placeholder', 'hint'] }); // value/onChange → type 动作，绑定到 value 的路径
export const Select = adopt(ds.Select, { as: 'select', text: ['label', 'hint'] });  // value/onChange → select 动作
export const Dialog = adopt(ds.Dialog, { as: 'dialog', text: ['title'] });         // open 进；onClose → 点遮罩/Esc 的 close 动作
