import { asset, chapter, hold, narrate, work } from '@joplo-app/kit';
import { Stack, Text, Title } from '@joplo-app/plugin-ui';
import { Video, playClip } from '@joplo-app/plugin-av';

export default work({
  title: 'C · 解码后再采样',
  summary: '当前实现的可运行验证：逐帧导出等解码并复制像素；实播与实时录制保持原生播放。竖带从左到右表示帧编号的低位到高位。',
  pace: { systemLead: .05 },
  stage: <Stack gap="lg" p="xl">
    <Title>时间到了，画面也要到</Title>
    <Text>两段同源视频同时播放；暂停后编号停住，跳回首章恢复起点。</Text>
    <Video id="sample-a" src={asset('../../../assets/sampling-numbers.mp4')} w={512} h={128}/>
    <Video id="sample-b" src={asset('../../../assets/sampling-numbers.mp4')} start={.2} w={512} h={128}/>
    <Text>film / frames：每个采样等待当前帧。video：实时录制，另行观看验收。</Text>
  </Stack>,
  scenarios: {
    decode: chapter('双视频逐帧采样')
      .system('同一个引擎时钟', playClip('sample-a',{from:0,to:.8}),playClip('sample-b',{from:.2,to:1}),hold(.5),narrate(false)),
    relay: chapter('接续与跳转')
      .system('接续不另起时钟',playClip('sample-a',{from:.8,to:1.6}),playClip('sample-b',{from:1,to:1.8}),hold(.5),narrate(false)),
  },
});
