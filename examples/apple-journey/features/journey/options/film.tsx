import { $, asset, option, flow, page, set, patch, hold, narrate, free, eq, fork, done, shot } from '@joplo-app/kit';
import { Scene3D } from '@joplo-app/plugin-3d';
import { Canvas, camera } from '@joplo-app/plugin-content';
import { Image, Button } from '@joplo-app/plugin-ui';
import { music } from '@joplo-app/plugin-alda';
import { apples } from '../../../models';
import { facts } from '../../../facts';

const art = {
  forest: asset('../../../assets/images/forest.jpg'), eden: asset('../../../assets/images/eden.jpg'),
  newton: asset('../../../assets/images/newton.jpg'), snow: asset('../../../assets/images/snowdrop.jpg'),
};
const eras = [
  { key:'wild', number:'01', en:'ORIGIN', title:['在成为','符号之前。'], place:'中亚 · 天山', sub:'Malus sieversii', year:'远古', source: facts.origin.source, art:'山林氛围：Shishkin · 1880s · 公有领域，非天山实景' },
  { key:'eden', number:'02', en:'MYTH', title:['谁说，','那是苹果？'], place:'伊甸园 · 文化想象', sub:'一颗未被命名的果实', year:'神话', source: facts.eden.source, art:'Cranach 工作室 · 约1528 · 公有领域' },
  { key:'newton', number:'03', en:'GRAVITY', title:['落下的，','是一个问题。'], place:'英格兰 · 1666的故事', sub:'它为什么不往旁边去？', year:'1666', source: facts.newton.source, art:'牛顿肖像：Kneller 1689原作的摹本 · 公有领域' },
  { key:'snow', number:'04', en:'TEMPTATION', title:['最熟悉的，','也最诱人。'], place:'格林童话 · 白雪公主', sub:'一半雪白，一半深红', year:'童话', source: facts.snow.source, art:'Arthur Rackham · 1909 / 1920 · 公有领域' },
  { key:'modern', number:'05', en:'IDENTITY', title:['一个缺口。','万千联想。'], place:'从果实到品牌', sub:'原创意象 · 非品牌标志', year:'1976', source: facts.brand.source, art:'原创 Tripo 咬痕果实 · 不复制商标' },
  { key:'future', number:'06', en:'IN YOUR HANDS', title:['这一次，','落到你手里。'], place:'同一颗苹果，新的故事', sub:'从山林，到你眼前的屏幕', year:'今天', source: facts.ending.source, art:'原创陶瓷果实与无品牌手机框架' },
] as const;
const originalPose = { heroX:300, heroY:60, heroW:800, sceneH:610, azimuth:25, elevation:22, focus:null };
const enter = (era:string) => [patch($.ui, { ...originalPose, era, detail:false, dropped:false, branch:false, phone:false, year:'1976', timelineX:455, modernColor:'#d8c6a0', modernText:'1976 · Ronald Wayne 画了树下的牛顿。' }), camera(), shot()];
const yearState = {
  '1976': { year:'1976', timelineX:455, modernColor:'#d8c6a0', modernText:'1976 · Ronald Wayne 画了树下的牛顿。' },
  '1977': { year:'1977', timelineX:665, modernColor:'#faf0e1', modernText:'1977 · Rob Janoff 设计了彩虹苹果。' },
  today: { year:'今天', timelineX:875, modernColor:'#b9d7ee', modernText:'今天 · 颜色改变，果实仍然容易辨认。' },
};
const fallState = patch($.ui,{heroY:220,heroX:420,heroW:560,sceneH:450,dropped:true});
const fall = [fallState,camera()];
const revealOrigin = [set($.ui.detail,true)];
const tree = <div className="journey" style={{height:"100%",width:"100%"}}><Canvas w={1280} h={800}>
  <div style={{position:'absolute',inset:0,background:'#0b1110'}}>
    <Image when={eq($.ui.era,'wild')} src={art.forest} w={1280} h={800} fit="cover" position="center 55%" style={{opacity:.58}} />
    <Image when={eq($.ui.era,'eden')} src={art.eden} w={1280} h={800} fit="cover" position="center 55%" style={{opacity:.54}} />
    <Image when={eq($.ui.era,'newton')} src={art.newton} w={1280} h={800} fit="cover" position="center 23%" style={{opacity:.36}} />
    <Image when={eq($.ui.era,'snow')} src={art.snow} w={1280} h={800} fit="cover" position="center 43%" style={{opacity:.47}} />
    <div when={eq($.ui.era,'modern')} style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at 60% 45%,#5e4c49 0%,#26232e 40%,#0c1117 80%)'}} />
    <div when={eq($.ui.era,'future')} style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at 58% 45%,#263f58,#0a111c 70%)'}} />
  </div>
  <div style={{position:'absolute',inset:0,background:'linear-gradient(90deg,rgba(5,13,11,.94),transparent 80%),linear-gradient(0deg,#0a1213,transparent 70%)'}} />
  {eras.map(era => <div screen when={eq($.ui.era,era.key)}>
    <div className="chapter" style={{position:'absolute',left:62,top:46}}>{era.number} / 06 · {era.en}</div>
    <div className="headline" style={{position:'absolute',left:62,top:190}}>{era.title.map(line=><div>{line}</div>)}</div>
    <div className="kicker" style={{position:'absolute',left:64,top:385}}><div>{era.place}</div><div style={{fontSize:21,opacity:.8}}>{era.sub}</div></div>
    <div className="year" style={{position:'absolute',right:70,top:82}}>{era.key==='modern'?$.ui.year:era.year}</div>
    <div className="caption-source" style={{position:'absolute',left:62,top:735}}><div>{era.source}</div><div>{era.art}</div></div>
  </div>)}
  <div when={eq($.ui.era,'eden')} style={{position:'absolute',left:455,top:180,width:480,height:400,borderRadius:'50%',background:'radial-gradient(ellipse,#e9b94d50,transparent 65%)'}} />
  <div when={eq($.ui.era,'snow')} style={{position:'absolute',left:520,top:170,width:450,height:450,borderRadius:'50%',background:'radial-gradient(ellipse,#6f1c2e60,transparent 68%)'}} />
  <div when={eq($.ui.year,'1977')} style={{position:'absolute',left:480,top:155,width:445,height:410,borderRadius:'50%',background:'conic-gradient(from 30deg,#e89b6050,#ed556d40,#ad78d950,#5e9de950,#70ad6a50,#e8ba6c50)',filter:'blur(35px)'}} />
  <div id="ground" when={eq($.ui.era,'newton')} style={{position:'absolute',left:500,top:630,width:410,height:16,borderBottom:'2px solid #dac89e88',color:'#c2c4af',fontSize:20,textAlign:'center',paddingTop:12}}>↓ 拖到地面</div>
  <div when={eq($.ui.phone,true)} motion="phone" style={{position:'absolute',left:540,top:170,width:320,height:470,border:'3px solid #8b9bad',borderRadius:48,background:'linear-gradient(145deg,#152334,#080d16)',boxShadow:'0 35px 70px #0008'}}>
    <div style={{width:80,height:8,borderRadius:8,background:'#77818c',margin:'20px auto'}} />
    <div style={{position:'absolute',bottom:45,width:'100%',textAlign:'center',fontSize:26,color:'#e2d9bb'}}>你的下一段故事</div>
    <div style={{position:'absolute',bottom:15,left:110,width:100,height:4,borderRadius:4,background:'#a3afba'}} />
  </div>
  <div id="hero" motion="apple-stage" motionMs={1200} style={{position:'absolute',left:$.ui.heroX,top:$.ui.heroY,width:$.ui.heroW,height:$.ui.sceneH}}>
    <Scene3D id="apple_scene" height={$.ui.sceneH} focus={$.ui.focus} azimuth={$.ui.azimuth} elevation={$.ui.elevation} label="苹果：拖动空白处或用方向键旋转">
      {eras.map(era => <Scene3D.Model id={`${era.key}_apple`} src={apples[era.key]} when={eq($.ui.era,era.key)} at={[0,0,0]} size={[3,3,3]} outline={false} showLabel={false} label={`${era.place}的苹果`} color={era.key==='modern'?$.ui.modernColor:undefined} />)}
    </Scene3D>
  </div>
  <div when={eq($.ui.era,'wild')}>
    <Button variant="subtle" id="origin_info" className="action" style={{position:'absolute',left:532,top:657}}>旋转观察 · 查看来处</Button>
    <div when={eq($.ui.detail,true)} className="fact" style={{position:'absolute',right:52,top:433,width:360}}>主要祖先来自天山一带。<div style={{fontSize:18,color:'#bdc8b4',marginTop:8}}>现代栽培苹果也融合了其他野生种的遗传贡献。</div></div>
  </div>
  <div when={eq($.ui.era,'eden')}>
    <Button variant="subtle" id="eden_info" className="action" style={{position:'absolute',left:535,top:657}}>点开金果，看看原文</Button>
    <div when={eq($.ui.detail,true)} className="fact" style={{position:'absolute',right:52,top:430,width:365}}>原文只说“果实”。<div style={{fontSize:19,marginTop:8}}>malum：苹果 / 恶。双关是流行解释，学者对其历史依据仍有质疑。</div></div>
  </div>
  <div when={eq($.ui.era,'newton')}>
    <Button variant="subtle" id="drop" className="action" style={{position:'absolute',left:535,top:681}}>拖下苹果 · 或点此放手</Button>
    <div when={eq($.ui.dropped,true)} className="fact" style={{position:'absolute',right:48,top:330,width:330}}>不是被砸中，<div>而是开始追问。</div><div style={{fontSize:17,marginTop:12}}>1752年回忆录记下晚年谈话。这里是落向地面的示意，不是物理仿真。</div></div>
  </div>
  <div when={eq($.ui.era,'snow')}>
    <Button variant="subtle" id="bite" className="action" style={{position:'absolute',left:540,top:657}}>咬一口 · 进入童话支线</Button>
    <div when={eq($.ui.branch,true)} className="fact" style={{position:'absolute',right:46,top:416,width:365}}>她吃的是红的一半。<div style={{fontSize:19,marginTop:10}}>王后先吃无毒的白半边。熟悉的食物，让诱惑看起来可信。</div><div style={{fontSize:16,marginTop:10,color:'#b8b5a6'}}>本片阅读；现实果皮颜色不表示毒性。</div></div>
  </div>
  <div when={eq($.ui.era,'modern')}>
    <div style={{position:'absolute',left:445,top:555,width:550,textAlign:'center',fontSize:23,color:'#f0dcc4'}}>{$.ui.modernText}</div>
    <div style={{position:'absolute',left:472,top:630,width:420,height:2,background:'#aaafbc66'}} />
    {(['1976','1977','today'] as const).map((year,i)=><Button variant="subtle" id={`year_${year}`} className="action" style={{position:'absolute',left:420+i*210,top:652,width:120}}>{year==='today'?'今天':year}</Button>)}
    <Button variant="subtle" id="time_handle" className="action" style={{position:'absolute',left:$.ui.timelineX,top:603,width:48,minWidth:48,padding:0,borderRadius:'50%',background:'#ddbd7d',color:'#1b2022'}} aria-label="拖动年代游标">↔</Button>
    <Button variant="subtle" id="myth_info" className="action" style={{position:'absolute',left:62,top:506,fontSize:19}}>缺口与图灵有关吗？</Button>
    <div when={eq($.ui.detail,true)} className="fact" style={{position:'absolute',right:45,top:355,width:350}}>设计师说：为了辨识。<div style={{fontSize:19,marginTop:10}}>Janoff 否认“致敬图灵”的说法；缺口帮助人们看出这是苹果。</div></div>
  </div>
  <div when={eq($.ui.era,'future')}>
    <Button variant="subtle" id="catch" className="action" style={{position:'absolute',left:540,top:667}}>接住苹果 · 打开屏幕</Button>
    <div style={{position:'absolute',left:62,top:498,width:310,fontSize:23,color:'#c8d1d4',lineHeight:1.7}}>故事留在物件里。<div>意义，由我们放进去。</div></div>
  </div>
</Canvas></div>;

export default option({
  name:'画作中的一颗苹果', idea:'一颗3D果实保持视觉中心，以画作、音色与动作穿过六个时代。',
  routes:{'/':page({title:'一颗苹果的旅程',layout:false,viewport:'desktop'},tree)},
  state:{ui:{...originalPose,era:'wild',detail:false,dropped:false,branch:false,phone:false,...yearState['1976']}},
  free:{
    originHover:free.hover('wild_apple',400,...revealOrigin), originClick:free.click('wild_apple',...revealOrigin), originInfo:free.click('origin_info',...revealOrigin),
    edenFruit:free.click('eden_apple',set($.ui.detail,true)), edenInfo:free.click('eden_info',set($.ui.detail,true)),
    fall:free.drag('newton_apple','ground',fallState), drop:free.click('drop',fallState),
    first:free.drag('time_handle','year_1976',patch($.ui,yearState['1976'])), second:free.drag('time_handle','year_1977',patch($.ui,yearState['1977'])), third:free.drag('time_handle','year_today',patch($.ui,yearState.today)),
    yearFirst:free.click('year_1976',patch($.ui,yearState['1976'])), yearSecond:free.click('year_1977',patch($.ui,yearState['1977'])), yearThird:free.click('year_today',patch($.ui,yearState.today)),
    handle:free.click('time_handle',patch($.ui,yearState['1977'])), myth:free.click('myth_info',set($.ui.detail,true)), modern:free.click('modern_apple',set($.ui.detail,true)),
    catch:free.click('catch',patch($.ui,{phone:true,heroX:550,heroY:225,heroW:300,sceneH:300})), future:free.click('future_apple',patch($.ui,{phone:true,heroX:550,heroY:225,heroW:300,sceneH:300})),
  },
  scenarios:{
    origin:flow('01 山林 · 在成为符号之前',{start:'/',cases:['origin'],description:'一颗果实，怎样穿过我们的故事？'})
      .system('野果', '先有一颗果实',music.play('forest',{volume:.48,fadeMs:700,loop:true}),narrate('在成为故事和标志之前，苹果先是一颗长在山林里的果实。'),hold(6))
      .act('scene3d:rotate','apple_scene',{azimuth:90,elevation:32},'转过它青涩的一面',set($.ui.azimuth,90),set($.ui.elevation,32),narrate('转过来看。中亚天山一带的野苹果，是栽培苹果的主要祖先。'),hold(7))
      .hover('wild_apple',600,'追溯它的来处',...revealOrigin,narrate('但不是唯一祖先。现代苹果也留下了其他野生种的遗传痕迹。'),hold(6))
      .system('远行','果实走进了人的故事',set($.ui.detail,false),set($.ui.azimuth,25),camera('hero',{pad:24,zoom:1.08,ms:1200}),music.stop({fadeMs:900}),narrate('后来，人们开始把自己的疑问，放进这颗果实。'),hold(5)),
    eden:flow('02 伊甸园 · 未被命名的果实',{from:'origin',cases:['eden'],description:'我们看到的是原文，还是后来的想象？'})
      .system('金果','果实披上了金色',...enter('eden'),music.play('eden',{volume:.44,fadeMs:900,loop:true}),narrate('来到伊甸园。画家手中的禁果，常常成了一颗苹果。'),hold(6))
      .click('eden_apple','点开这个熟悉的答案',set($.ui.detail,true),narrate('可创世记并没有说它是什么水果。熟悉的画面，并不等于原文。'),hold(7))
      .system('双关','一个流行解释，并非定论',narrate('拉丁文里，苹果和恶有双关。但把它说成一次确定的翻译错误，证据还不够。'),hold(8))
      .system('问题','让想象回到想象的位置',set($.ui.detail,false),camera('hero',{pad:24,zoom:1.08,ms:1200}),music.stop({fadeMs:800}),narrate('这颗果实，装下了人们对诱惑的想象。另一颗，则带来一个问题。'),hold(6)),
    newton:flow('03 牛顿 · 为什么总往下落',{from:'eden',cases:['newton'],description:'亲手放下它，然后问一句为什么。'})
      .system('果园','一六六六年的故事',...enter('newton'),music.play('newton',{volume:.42,fadeMs:600,loop:true}),narrate('把时间拨到牛顿年轻时。苹果落下，这个普通动作让人重新发问。'),hold(6))
      .drag('newton_apple','ground','松手，它落向地面',...fall,narrate('为什么总向下，而不是向旁边？这才是故事里值得留下的疑问。'),hold(7))
      .system('回忆','回忆录里，没有砸头',narrate('斯图克利在一七五二年的回忆录里，记录了牛顿晚年谈起落苹果。没有砸头的桥段。'),hold(9))
      .system('抬起','一次提问，不是瞬间完成的定律',patch($.ui,{...originalPose,dropped:false}),music.stop({fadeMs:900}),narrate('科学并没有在那一瞬间完成。落下的果实，只是一个问题的入口。'),hold(6)),
    snow:flow('04 童话 · 你想咬哪一半',{from:'newton',cases:['snow'],description:'红白两半，藏着一个关于信任的机关。'})
      .system('童话','另一种危险，藏进了果皮',...enter('snow'),music.play('snow',{volume:.47,fadeMs:700,loop:true}),narrate('格林童话里，苹果又变了。白的一半无毒，红的一半藏着危险。'),hold(7))
      .act('scene3d:rotate','apple_scene',{azimuth:-70,elevation:24},'绕到它的另一面',set($.ui.azimuth,-70),set($.ui.elevation,24),narrate('王后先吃白的那半边。白雪公主看到这一幕，才伸手接过红的。'),hold(7))
      .system('诱惑','暂停，选择是否咬一口',narrate('熟悉的东西，也可能让人放下戒心。你可以暂停，咬一口进入支线。'),fork('咬一口：为什么是苹果？','biteBranch'),hold(6))
      .system('符号','一个缺口，留下许多联想',set($.ui.azimuth,25),music.stop({fadeMs:900}),narrate('接下来，果实离开童话。一个缺口，又让人编出了许多故事。'),hold(6)),
    modern:flow('05 品牌 · 缺口与联想',{from:'snow',cases:['modern'],description:'拖动年代，分清设计师的想法与传说。'})
      .system('品牌','先是一幅树下的牛顿',...enter('modern'),music.play('modern',{volume:.46,fadeMs:800,loop:true}),narrate('苹果公司一九七六年的标志，画的是树下的牛顿。这里用原创果实讲述它的变化。'),hold(8))
      .drag('time_handle','year_1977','拖到一九七七年',patch($.ui,yearState['1977']),narrate('第二年，罗布·贾诺夫设计了彩虹苹果。图形变简单了，联想却变多了。'),hold(7))
      .click('myth_info','缺口不是图灵纪念',set($.ui.detail,true),narrate('致敬图灵的说法很动人，但设计师否认了它。他说，缺口帮助人看出这是苹果。'),hold(8))
      .drag('time_handle','year_today','从彩色，到单色',set($.ui.detail,false),patch($.ui,yearState.today),narrate('颜色可以改变。这个普通果实，已经成为人们一眼就认得的符号。'),hold(7))
      .system('屏幕','果实的下一站，是屏幕',music.stop({fadeMs:1100}),hold(4)),
    ending:flow('06 今天 · 落到你手里',{from:'modern',cases:['ending'],description:'旅程没有终点，只是来到了你的手中。'})
      .system('今天','这一次，落到你手里',...enter('future'),music.play('ending',{volume:.48,fadeMs:900,loop:true}),narrate('从真实的山林，到神话、科学、童话和品牌。这些故事，来到同一块屏幕上。'),hold(8))
      .click('catch','接住它，打开下一段故事',patch($.ui,{phone:true,heroX:550,heroY:225,heroW:300,sceneH:300}),narrate('苹果没有替我们讲故事。是我们，一次次把意义放进它。'),hold(6))
      .system('回望','你想回到哪一个时代？',music.stop({fadeMs:1500}),fork('山林','origin'),fork('禁果','eden'),fork('牛顿','newton'),fork('童话','snow'),fork('品牌','modern'),hold(5)),
    biteBranch:flow('支线 · 为什么偏偏是苹果',{from:'snow',autoplay:false,description:'你选择咬一口：走近故事里的信任机关。'})
      .click('bite','咬一口，走进童话',...enter('snow'),set($.ui.branch,true),music.play('snow',{volume:.4,fadeMs:500,loop:true}),narrate('在这个故事里，危险借用了食物的熟悉模样。王后的示范，让欺骗显得可信。'),hold(8))
      .click('snow_apple','红与白，是童话的机关',set($.ui.azimuth,100),narrate('这是对故事的阅读，不是关于真实苹果的判断。果皮颜色，并不能告诉你是否有毒。'),hold(8))
      .system('回主线','带着这个问题，回到主线',set($.ui.branch,false),music.stop({fadeMs:900}),fork('继续：果实变成符号','modern'),fork('回到童话','snow'),done('看见诱惑背后的信任'),hold(4)),
  },
});
