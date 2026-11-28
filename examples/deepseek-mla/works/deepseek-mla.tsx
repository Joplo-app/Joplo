import {
  $,
  chapter,
  done,
  hold,
  layer,
  narrate,
  patch,
  work,
} from '@joplo-app/kit';
import { camera } from '@joplo-app/plugin-content';
import { PALETTE as P, SOURCES } from '../shared/data.ts';
import { MlaWorld, type MlaUiState } from '../shared/world.tsx';

const setUi = (next: Partial<MlaUiState>) => patch($.ui, next);

// ---------- 01 128 头显存墙与 GQA 的两难 ----------
const wall = chapter('为什么长文本推理总先爆显存？', {
  description: 'MHA 撑爆显存，GQA 砍头伤精度——两难怎么破',
  expected: '看懂标准多头注意力 32,768 维 KV 显存瓶颈，以及 GQA 多头共享带来的同质化妥协',
})
  .system(
    'MHA 显存墙',
    '每读入 1 个词，128 个头各自存下独立 K 和 V',
    setUi({
      wallMode: 'mha',
      vramPillarH: '94%',
      vramPillarColor: P.danger,
      vramPillarLabel: '32,768 维 · 爆表',
      headsPillarH: '96%',
      headsPillarColor: P.emerald,
      headsPillarLabel: '128 头全独立',
      hudSource: SOURCES.v2,
    }),
    camera('zone_wall', { pad: 72, drift: { zoom: 1.04, x: 18, ms: 16000 } }),
    narrate('读一份十二万字财报时，最先撑爆显卡的往往不是算力，而是历史词留下的键值缓存。标准多头注意力里，每个词每过一层都要存下三万两千多维。'),
  )
  .system(
    'GQA 砍头妥协',
    '强行让多头共用同一份键值：显存降了，视角却雷同',
    setUi({
      wallMode: 'gqa',
      vramPillarH: '26%',
      vramPillarColor: P.amber,
      vramPillarLabel: '2,048 维 · 折中',
      headsPillarH: '34%',
      headsPillarColor: P.amber,
      headsPillarLabel: '多头被迫同质',
    }),
    camera('zone_wall', { pad: 72, drift: { zoom: 1.03, x: -16, ms: 16000 } }),
    narrate('主流做法是分组共享：逼十几个注意力头共用同一份键值。显存虽然降下来了，但多头各自捕捉细节的独立视角也被硬生生砍掉了。'),
  )
  .system(
    '核心追问',
    '能不能显存只存极小一团，读出时却保住 128 种视角？',
    setUi({
      wallMode: 'ask',
      vramPillarH: '10%',
      vramPillarColor: P.cyan,
      vramPillarLabel: '目标：百维级',
      headsPillarH: '96%',
      headsPillarColor: P.emerald,
      headsPillarLabel: '保住 128 头独立',
    }),
    camera('zone_wall', { pad: 68, drift: { zoom: 1.05, ms: 16000 } }),
    narrate('所以 DeepSeek 问了一个更本质的问题：能不能存的时候压成极小一粒，算的时候却让一百二十八个头依然拥有各自的独立视角？'),
    done('建立显存体积与多头独立视角的张力悬念'),
  );

// ---------- 02 低秩潜向量与“矩阵吸收”神来之笔 ----------
const latent = chapter('压成潜向量后，为什么不用解压再算？', {
  description: '靠矩阵乘法结合律把解压算子提前并入两端',
  expected: '识破“推理时重新解压仍爆带宽”的误区，并通过静音飞行看懂 W_UK 与 W_UV 的矩阵吸收',
})
  .system(
    '联合低秩压缩',
    '先把整层 K、V 压成一粒 512 维潜向量 c_KV',
    setUi({
      absorbStage: 'compress',
      hudSource: SOURCES.v2,
    }),
    camera('zone_absorb', { pad: 72, drift: { zoom: 1.04, x: 16, ms: 16000 } }),
    narrate('第一步很直观：不再按头分别存键值，而是把整层信息联合压缩成一粒只有五百一十二维的潜向量，体积瞬间缩小六十多倍。'),
  )
  .system(
    '假省显存陷阱',
    '若推理时再乘 W_UK、W_UV 展开，大矩阵照样堵死带宽',
    setUi({
      absorbStage: 'naive_expand',
    }),
    camera('zone_absorb', { pad: 72, drift: { zoom: 1.03, x: -18, ms: 18000 } }),
    narrate('但这里藏着一个大坑：如果每算一步注意力，都要拿解压矩阵把它重新展开成一百二十八个头的大张量，显存带宽照样当场堵死。'),
  )
  .system(
    '准备矩阵吸收',
    '注意看潜向量右侧的 W_UK 和 W_UV 往哪飞',
    camera('zone_absorb', { pad: 68, drift: { zoom: 1.04, ms: 14000 } }),
    narrate('怎么才能彻底不解压？注意看潜向量右边的两块解压矩阵，看它们往哪走。'),
  )
  // 静音观察窗口 #1：让观众眼睛专注追踪 W_UK 左滑合体 Q、W_UV 右滑合体 O！
  .system(
    '双向矩阵吸收',
    'W_UK 左滑并入查询侧，W_UV 右滑并入输出侧',
    setUi({
      absorbStage: 'absorbing',
    }),
    narrate(false),
    hold(2.2),
  )
  .system(
    '免解压驻留',
    '结合律生效：显存全程只存 512 维潜向量',
    setUi({
      absorbStage: 'absorbed',
    }),
    camera('zone_absorb', { pad: 72, drift: { zoom: 1.05, y: 12, ms: 18000 } }),
    narrate('因为没有非线性激活，两块解压矩阵直接提前乘进了左边的查询投影和右边的输出投影里。从此显存里永远只躺着这五百一十二维潜向量！'),
    done('理解矩阵吸收如何消除运行期解压开销'),
  );

// ---------- 03 为什么 RoPE 会卡壳？“解耦 RoPE”双轨破局 ----------
const rope = chapter('位置编码挡路怎么办？解耦 RoPE 破局', {
  description: '拆出 64 维共享位置窄轨，保住主干矩阵吸收',
  expected: '看懂动态旋转矩阵 RoPE 为什么会阻断 W_UK 左移合并，以及 512+64 双轨解耦的工程巧思',
})
  .system(
    '旋转位置锁挡路',
    'RoPE 夹在 Q 与 K 中间随词距变化，挡死矩阵吸收',
    setUi({
      ropeStage: 'blocked',
      hudSource: SOURCES.v2,
    }),
    camera('zone_rope', { pad: 72, drift: { zoom: 1.04, x: 16, ms: 16000 } }),
    narrate('可一加上旋转位置编码，刚才的妙计突然失灵了。因为位置矩阵夹在查询和键正中间，随每个词的距离动态旋转，解压矩阵根本跨不过去！'),
  )
  // 静音观察窗口 #2：亲眼看 RoPE 下沉拆入 64 维窄轨，上层 W_UK 瞬间左滑畅通融合！
  .system(
    '双轨解耦分离',
    'RoPE 下沉走 64 维共享窄轨，主干恢复矩阵吸收',
    setUi({
      ropeStage: 'decoupling',
    }),
    narrate(false),
    hold(2.2),
  )
  .system(
    '512 + 64 成形',
    '每词每层仅存 576 维：兼得位置感知与免解压吸收',
    setUi({
      ropeStage: 'decoupled',
      hudSource: SOURCES.v3,
    }),
    camera('zone_rope', { pad: 72, drift: { zoom: 1.04, x: -14, ms: 18000 } }),
    narrate('DeepSeek 的破局极其干脆：把位置单独拆到下面一条六十四维的共享窄轨；上面的五百一十二维语义主干瞬间畅通无阻，合起来总共只存五百七十六维！'),
    done('看懂解耦 RoPE 为何是 MLA 落地的点睛之笔'),
  );

// ---------- 04 省下 93.3% 显存换来了什么？（含交互对比台） ----------
const scale = chapter('省下 93.3% 显存，吞吐翻了多少倍？', {
  description: '等比例体量对比与 128K 长上下文交互实验台',
  expected: '直观对比 32,768 维与 576 维的悬殊体量，并验证 MLA 同时保住 128 头视角与 5.76 倍吞吐',
})
  .system(
    '悬殊体量对比',
    '从 32,768 维压到 576 维：KV 显存直降 93.3%',
    setUi({
      labArch: 'mha',
      hudSource: SOURCES.v2,
    }),
    camera('zone_scale', { pad: 72 }),
    narrate('把三种架构放在同一条零基线上：左边是标准多头三万两千多维的显存巨塔，而右边 MLA 只有贴着地面薄薄一层五百七十六维。'),
  )
  .click(
    'arch_mla',
    '切到 MLA：保住 128 头视角，吞吐飙至 5.76×',
    narrate('切到 MLA 看右侧三根计量条：最上面的多头独立视角依然满格，中间显存骤降百分之九十三点三，释放出的带宽让最大生成吞吐飙到五点七六倍！'),
  )
  .system(
    '四岛全景闭环',
    '低秩潜核 + 矩阵吸收 + 解耦 RoPE = 既省显存又更聪明',
    setUi({ hudSource: '' }),
    camera('zone_wall', 'zone_absorb', 'zone_rope', 'zone_scale', { pad: 56 }),
    narrate('退回全景：联合低秩压缩、两端矩阵吸收、再加上解耦位置窄轨——三步环环相扣，让大模型既装得下超长上下文，又不牺牲一分多头精度。你可以暂停点按右下角对比三种架构。'),
    done('完成 DeepSeek MLA 完整因果心智模型构建'),
  );

export default work({
  title: 'DeepSeek MLA：怎么把 KV 显存砍掉 93.3%，还不伤多头精度？',
  summary: '纯几何可视动化拆解：从 128 头 KV 显存墙出发，看懂低秩潜向量压缩、两端矩阵吸收与 512+64 解耦 RoPE 如何环环相扣',
  audience: '希望真正看懂 DeepSeek-V2 / V3 多头潜在注意力（MLA）底层因果逻辑的技术关注者',
  layers: {
    world: layer('纯几何舞台', <MlaWorld />, { icon: 'flow' }),
  },
  state: {
    ui: {
      __plugins: { content: { camera: { targets: ['zone_wall'], pad: 72 } } },
      wallMode: 'mha',
      vramPillarH: '94%',
      vramPillarColor: P.danger,
      vramPillarLabel: '32,768 维 · 爆表',
      headsPillarH: '96%',
      headsPillarColor: P.emerald,
      headsPillarLabel: '128 头全独立',
      absorbStage: 'compress',
      ropeStage: 'blocked',
      labArch: 'mha',
      hudSource: '',
    },
  },
  scenarios: { wall, latent, rope, scale },
});
