import { $, page } from '@joplo-app/kit';
import { Badge, Code, Paper, Stack, Text, Title } from '@joplo-app/plugin-ui';
/** Current implemented workflow, not a simulated provider response or an approved board generator. */
export default page({title:'模型资产',layout:false}, <Stack p="xl" gap="lg">
  <Badge>当前实现 · D90 / P1-E</Badge>
  <Title order={1}>生成一次，把模型留在项目里</Title>
  <Text size="lg">先找 CC0 模型或公有领域素材，再用自己的风格生成补缺。</Text>
  <Paper id="model_status" withBorder p="lg"><Stack gap="sm"><Title order={3}>{$.ui.modelTitle}</Title><Text>{$.ui.modelDetail}</Text><Code>{$.ui.modelCommand}</Code></Stack></Paper>
  <Paper id="model_key" withBorder p="lg"><Text>Voice → 管理密钥 → Tripo：只保存到本机。保存密钥本身不授权生成。</Text></Paper>
  <Text c="dimmed">这是已经实现的 CLI 流程说明；当前看板只提供密钥设置。这里不请求供应商、不花费 credits。</Text>
</Stack>);
