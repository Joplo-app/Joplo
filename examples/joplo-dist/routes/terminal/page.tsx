import { page, Slot } from '@joplo/kit';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@joplo/kit/ui';

/** 终端窗口：方案把命令输出堆叠到 lines 插槽，输入行所有方案共用。 */
export default page(
  { title: '终端' },
  <Card className="font-mono">
    <CardHeader>
      <CardTitle>~/work — zsh</CardTitle>
    </CardHeader>
    <CardContent className="flex flex-col gap-4 font-mono text-[14px]">
      <Slot name="lines" />
      <div className="flex items-center gap-2">
        <span>$</span>
        <div className="flex-1">
          <Input id="term_cmd" className="font-mono" placeholder="输入命令" />
        </div>
        <Button id="term_enter" variant="outline">⏎ 回车</Button>
      </div>
    </CardContent>
  </Card>,
);
