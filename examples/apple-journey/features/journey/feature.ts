import { feature } from '@joplo-app/kit';
export default feature({
  name: '一颗苹果的旅程',
  goal: '跟随同一颗苹果，分清果实、故事与符号；暂停后亲手探索每一个时代。',
  pick: 'film',
  cases: {
    origin: { title: '01 从哪一片山林出发？', expected: '能旋转野苹果、查看主要祖先与天山的关系。' },
    eden: { title: '02 禁果真的是苹果吗？', expected: '点开金果，看到原文未指定水果；双关不是确定结论。' },
    newton: { title: '03 为什么总往下落？', expected: '将果实拖向地面，看到落下与提问；区分回忆录与砸头传说。' },
    snow: { title: '04 为什么想咬一口？', expected: '进入可选支线，看见童话中红白两半的诱惑与欺骗。' },
    modern: { title: '05 一颗果实怎样变成符号？', expected: '拖动年代，辨认1976、1977与现代，了解图灵传说并非设计本意。' },
    ending: { title: '06 这一次，落到你手里', expected: '苹果缩入手机，观众能回到任意时代。' },
  },
});
