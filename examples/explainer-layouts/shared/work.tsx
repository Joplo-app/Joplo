import { $, asset, chapter, eq, hold, set, work } from '@joplo-app/kit';
import { Canvas, camera } from '@joplo-app/plugin-content';
import { PhotoPanel, QuoteCard, RatioBar, StatusBadge } from './components.tsx';
const image = asset('../assets/exhibit.svg');
const data = {
  name: '林岚 / Lan Lin', role: '虚构档案馆 · 展陈设计员', date: '虚构资料 · 2040-04',
  source: '虚构档案馆 · 开放研究与展示方法工作组的示范记录（无真实新闻或人物）',
  short: { original: 'A message carries a voice across time.', translation: '一条消息，让声音穿过时间。' },
  long: { original: 'We preserve the objects, but also the pauses between messages: the time spent waiting, listening, and deciding what to say next.', translation: '我们保存器物，也保存消息之间的停顿：那些等待、倾听，以及决定下一句话的时间。' },
};
export function explainer(portrait: boolean) {
  const w=portrait?720:1280,h=portrait?1280:720;
  return work({ title: portrait ? '档案馆 · 竖屏' : '档案馆 · 横屏', summary: '同一份中性虚构数据，保留品牌、主体、来源与字幕安全区',
    state: {ui:{quote:'short'}},
    stage: <Canvas style={{background:'#f5f3e9'}} w={w} h={h} view={[w,h]} safe={[100,40,120,40]} drift={false}>
      <div id="content" style={{position:'absolute',left:40,top:portrait?130:110,width:w-80,height:h-270,color:'#20383d',fontFamily:'sans-serif'}}>
        <div style={{display:'flex',flexDirection:portrait?'column':'row',gap:24}}>
          <div style={{width:portrait?'100%':420,flexShrink:0}}>
          <PhotoPanel id="photo" src={image} credit="原创矢量示意图 · 非实拍 · 可随仓库分发" year="虚构档案 2040 · 焦点可调" focus="50% 42%" imageHeight={portrait?150:210} style={{width:portrait?'100%':420,height:portrait?230:330,flexShrink:0}} />
          <RatioBar id="ratio" left={43} right={37} total={100} threshold={51} leftLabel="方案青" rightLabel="方案橙" style={{marginTop:16}} />
          </div>
          <div style={{flex:1}}>
            <QuoteCard id="short" when={eq($.ui.quote,'short')} motion="quote" enter="fade" {...data.short} name={data.name} role={data.role} date={data.date} source={data.source} />
            <QuoteCard id="long" when={eq($.ui.quote,'long')} motion="quote" enter="fade" {...data.long} name={data.name} role={data.role} date={data.date} source={data.source} />
          </div>
        </div>
      </div>
      <header screen style={{position:'absolute',left:40,top:28,fontSize:32,fontFamily:'sans-serif',color:'#20383d'}}>虚构档案馆 / 一条消息</header>
      <div screen style={{position:'absolute',left:40,right:40,bottom:58}}><StatusBadge id="source-status" style={{color:'#20383d'}} label="演示数据" explanation="状态由作者配置，并非事实认证" /></div>
      <footer screen style={{position:'absolute',left:40,bottom:20,fontSize:22,color:'#49605d'}}>字幕安全区 · 本示例不生成旁白 · 资料仅用于排版演示</footer>
    </Canvas>,
    scenarios: {
      short: chapter('短引语与照片').system('完整取景',camera({drift:false}),hold(3)),
      long: chapter('长引语与未定区间',{from:'short'}).system('展开引语',set($.ui.quote,'long'),hold(3)),
    },
  });
}
