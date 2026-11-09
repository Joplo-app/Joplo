import { $, not } from '@joplo-app/kit';
import { Canvas } from '@joplo-app/plugin-content';
import { Alert, Arrow, Avatar, Board, BrowserWindow, Button, Card, Group, Note, Placeholder, SimpleGrid, Stack, Text, TextInput, ThemeIcon, Title } from '@joplo-app/plugin-ui';

/**
 * 一块白板：上面一排是主流程（登录 → 已发送 → 邮箱 → 首页），过期页画在邮箱下面。
 * 每屏都是普通的 ui 画面，放在 BrowserWindow 外框里；用 when 随步骤出现。箭头和便签也一样，出现时自己“画”出来。镜头由 camera() 移动。
 */
export const WORLD = { w: 2740, h: 1400 };
const ui = $.ui;
const S = { w: 500, h: 380 };
const ROW1 = 220;
const at = (left: number, top: number) => ({ pos: 'absolute', left, top }) as const;

export function BoardLayer() {
  return (
    <Canvas w={WORLD.w} h={WORLD.h} drift={false}>
      <Board>
        <Title order={1} {...at(120, 60)}>免密登录 · 流程白板</Title>

        <BrowserWindow id="login" label="1. 登录" url="joplo.app/login" {...at(120, ROW1)} w={S.w} h={S.h}>
          <Stack p="lg" gap="md">
            <Title order={3}>登录 Joplo</Title>
            <TextInput id="email" label="工作邮箱" placeholder="you@company.com" />
            <Button id="submit" fullWidth>发送登录链接</Button>
            <Text size="sm" c="dimmed">不用设置密码</Text>
          </Stack>
        </BrowserWindow>

        <BrowserWindow id="sent" label="2. 已发送" url="joplo.app/login" {...at(780, ROW1)} w={S.w} h={S.h} when={ui.sent}>
          <Stack p="lg" gap="md" align="flex-start">
            <ThemeIcon size="xl" radius="xl" variant="light">✉</ThemeIcon>
            <Title id="resent_title" order={3} when={ui.resent}>新链接已发送</Title>
            <Title order={3} when={not(ui.resent)}>去邮箱看看</Title>
            <Text>我们给 lin@team.io 发了一个登录链接</Text>
            <Button id="open_mail" variant="default">打开邮箱</Button>
          </Stack>
        </BrowserWindow>

        <BrowserWindow id="inbox" label="3. 邮箱" url="收件箱" {...at(1440, ROW1)} w={S.w} h={S.h} when={ui.mail}>
          <Stack p="lg" gap="md">
            <Group gap="sm">
              <Avatar name="Joplo" />
              <Stack gap={0}>
                <Text fw={600}>Joplo 登录链接</Text>
                <Text size="sm" c="dimmed">发给 lin@team.io</Text>
              </Stack>
            </Group>
            <Card id="mail_body" withBorder>
              <Stack gap="sm">
                <Text>点下面的按钮登录，不用输入密码。</Text>
                <Button id="link">点此登录</Button>
                <Text id="expiry_hint" size="sm" c="dimmed">15 分钟内有效，只能用一次</Text>
              </Stack>
            </Card>
          </Stack>
        </BrowserWindow>

        <BrowserWindow id="home" label="4. 首页" url="joplo.app" {...at(2100, ROW1)} w={S.w} h={S.h} when={ui.home}>
          <Stack p="lg" gap="md">
            <Group gap="sm">
              <Avatar name="Lin" color="green" />
              <Title order={3}>早上好，Lin</Title>
            </Group>
            <Text size="sm" c="dimmed">最近的项目</Text>
            <SimpleGrid cols={2}>
              <Placeholder label="项目 A" h={110} />
              <Placeholder label="项目 B" h={110} />
            </SimpleGrid>
          </Stack>
        </BrowserWindow>

        <BrowserWindow id="expired" label="5. 链接过期" url="joplo.app/login/verify" {...at(1440, 860)} w={S.w} h={S.h} when={ui.expired}>
          <Stack p="lg" gap="md">
            <Alert color="red" title="链接已过期">这个链接已经用过，或者超过了 15 分钟。</Alert>
            <Button id="resend">重新发送</Button>
          </Stack>
        </BrowserWindow>

        <Arrow id="a_send" from="submit" to="sent" label="发送" when={ui.sent} />
        <Arrow id="a_mail" from="open_mail" to="inbox" label="去邮箱" dashed when={ui.mail} />
        <Arrow id="a_login" from="link" to="home" label="点链接" when={ui.home} />
        <Arrow id="a_expired" from="link" to="expired" label="15 分钟后才点" color="red" dashed bend={0} when={ui.expired} />
        <Arrow id="a_resend" from="resend" to="sent" label="重新发送" color="blue" bend={-0.35} when={ui.resent} />

        <Note id="n_privacy" {...at(150, 680)} color="pink" when={ui.privacy}>邮箱没注册？{'\n'}也显示“已发送”，不暴露谁有账号</Note>
        <Note id="n_device" {...at(2140, 680)} color="blue" rotate={2} when={ui.home}>在别的设备上点了链接？{'\n'}→ 在那台设备上登录</Note>
        <Note id="n_once" {...at(2020, 930)} w={260} when={ui.expired}>旧链接点过一次就失效{'\n'}重新发送会让旧的全部作废</Note>
      </Board>
    </Canvas>
  );
}
