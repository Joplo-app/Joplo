/** 核实日期 2026-11-08。旁白只取以下已核实的窄结论；美术是叙事重构。 */
export const facts = {
  origin: {
    claim: '中亚天山一带的 Malus sieversii 是栽培苹果的主要野生祖先；现代苹果也有其他野生种的遗传贡献。',
    source: 'Horticulture Research · 2018 / 2025',
    urls: ['https://pmc.ncbi.nlm.nih.gov/articles/PMC6186759/', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11718403/'],
    limit: '不用“所有苹果唯一祖先”，不把演示绿果当作该物种的唯一颜色或形态。',
  },
  eden: {
    claim: '《创世记》没有说明禁果种类。malum 的苹果／恶双关是一种流行解释，不能称为确定的翻译错误。',
    source: 'Rutgers · Azzan Yadin-Israel · 2023',
    urls: ['https://www.rutgers.edu/news/how-forbidden-fruit-became-apple', 'https://doi.org/10.7208/chicago/9780226822129.003.0003'],
    limit: '研究者质疑拉丁双关假说的史料基础，并提出古法语词义变化解释；不在短片里把任何单因假说说成定论。',
  },
  newton: {
    claim: 'Stukeley 的1752年回忆录记下1726年牛顿谈落苹果引发引力思考；没有“砸头立即发现定律”的叙述。',
    source: 'William Stukeley · MS/142 · 1752',
    urls: ['https://www.newtonproject.ox.ac.uk/view/texts/diplomatic/OTHE00001', 'https://catalogues.royalsociety.org/CalmView/Record.aspx?id=MS%2F142&src=CalmView.Catalog'],
    limit: '1666是故事的传统时间背景；回忆录是晚年转述，交互只是方向示意，不是重力仿真或可测量实验。',
  },
  snow: {
    claim: '格林童话中，苹果白的一半无毒、红的一半有毒；王后吃白的一半，诱使白雪公主吃红的一半。',
    source: 'Grimm · Snowdrop · Rackham 1909',
    urls: ['https://www.gutenberg.org/files/37381/37381-h/37381-h.htm'],
    limit: '“熟悉的食物成为诱惑”是本片阅读，不声称是作者唯一意图。现实苹果颜色不表示是否有毒。',
  },
  brand: {
    claim: '1976标志由Ronald Wayne设计，描绘树下牛顿；1977 Rob Janoff设计彩虹苹果。缺口用于辨识苹果，致敬图灵的解释不符设计师口述。',
    source: 'Rob Janoff · 设计师口述与档案',
    urls: ['https://www.robjanoff.com/applelogo', 'https://www.robjanoff.com/apple.html', 'https://creativebits.org/interview/interview_rob_janoff_designer_apple_logo-2/', 'https://reverttosaved.com/2011/02/23/an-interview-with-rob-janoff-designer-of-the-apple-logo/'],
    limit: '画面仅用原创咬痕果实与色光作意象，不重绘商标；不将图灵去世方式或童话偏好作为事实叙述。',
  },
  ending: {
    claim: '苹果从真实果实变成文化符号，是本片串联这些独立故事的叙事观点。',
    source: '本片叙事 · 非历史因果链',
    urls: [],
    limit: '不声称各段历史彼此有直接因果关系；手机为原创无品牌框架。',
  },
} as const;
