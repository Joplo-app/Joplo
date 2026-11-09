import { page, Slot } from '@joplo-app/kit';
import { Terminal } from '@joplo-app/plugin-ui';

/** 终端窗口：方案把命令和输出堆叠到 lines 插槽，输入行所有方案共用。 */
export default page(
  { layout: 'distribution', title: '终端' },
  <Terminal title="~/work — zsh" mah={640}>
    <Slot name="lines" />
    <Terminal.Input id="term_cmd" placeholder="输入命令" />
  </Terminal>,
);
