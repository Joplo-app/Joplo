import { page, Slot } from '@joplo/kit';
import { Card, CardContent, CardHeader, CardTitle, Conversation, PromptInput, PromptInputSubmit, PromptInputTextarea } from '@joplo/kit/ui';

/** Claude Code 会话：方案把消息和工具调用堆叠到 conversation 插槽。 */
export default page(
  { title: 'Claude Code 会话' },
  <Card>
    <CardHeader>
      <CardTitle>Claude Code · ~/work/my-demo</CardTitle>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      <Conversation>
        <Slot name="conversation" />
      </Conversation>
      <PromptInput>
        <PromptInputTextarea id="agent_prompt" placeholder="和 Claude 说点什么…" />
        <PromptInputSubmit id="agent_send" />
      </PromptInput>
    </CardContent>
  </Card>,
);
