/**
 * v2 接口（ADR-0002）：CLI 只依赖这里导出的三个函数。由 T-board 实现，届时 index.ts 改为导出它们。
 */
import type { AppearanceFont, AppearanceStroke, Diagnostic, ScopeInfo, ScopeRequest, VoiceIndex } from '@joplo-app/core';
import type { CloudBridge } from './cloud.ts';
export type { CloudAccount, CloudBridge, CloudJob, CloudJobError, CloudPublishRequest, CloudPublishResult } from './cloud.ts';

export type DevOptions = {
  projectDir: string;
  /** 缺省 4790；被占用时报错，不静默换端口。 */
  port?: number;
  open?: boolean;
  log?: (line: string) => void;
  /**
   * 直接发布到云端（D76）：CLI 注入登录与 share()；看板「导出 ▾」里的「发布到 Joplo Cloud」用它。
   * 只在本进程启动看板时生效（加入已有看板时，那个进程用它自己的）。
   */
  cloud?: CloudBridge;
};
/** 单进程：同一个 JOPLO_HOME 下只有一个看板进程，同时服务多个项目（编译、热更新、选中、导出）。 */
/**
 * url：项目在看板中的链接。attached = true 表示本机已有存活的看板，项目只是注册进去（没有启动第二个进程，close 不做事）。
 */
export type DevHandle = { url: string; attached?: boolean; close(): Promise<void> };
export declare function startDev(opts: DevOptions): Promise<DevHandle>;

export type BuildOptions = {
  projectDir: string;
  /** 缺省 `<projectDir>/dist`。 */
  outDir?: string;
  /** 目标目录非空时，必须显式允许才清空重建。 */
  overwrite?: boolean;
  /**
   * 评审版（D63，`joplo share --review`）：含所有功能的所有方案（compile 的 review 模式），创作侧信息与普通发布一样去掉。
   * 缺省 false：只含选定方案，与原来完全一致。
   */
  review?: boolean;
  /** 本机目录（缺省 JOPLO_HOME 或 ~/.joplo）：读声音供应商 profile（D74）；测试指向临时目录。 */
  home?: string;
  /**
   * 按场景保密分享（D75，`--scenario` / `--feature`）：构建时把 IR 裁剪到这些场景，产物里不出现范围外的功能、方案、场景。
   * 缺省（或两个数组都为空）时与原来完全一致。写错场景 / 功能时报错，不写任何文件。
   */
  scope?: ScopeRequest;
  /**
   * 上一次发布的分享（D84，`joplo share` 重新发布时传）：它的 voiceIndex 与取文件的方法。本机没有、分享里有的音频
   * （同样的文字和声音）下载进本机缓存后照常打包，不重新生成；本机没有声音供应商时按分享里的声音指纹带上。
   */
  sharedVoice?: { index: VoiceIndex; fetch: (file: string) => Promise<Uint8Array | null> };
  /**
   * 项目没选过声音来源、config 也没写时用哪个（D85）：CLI 已登录 Joplo Cloud 时传 'cloud'（与看板同一规则），
   * 这样看板里默认用 cloud 生成的音频也会带上。缺省 null：只用看板里选过的（与原来一致）。
   */
  voiceDefault?: string | null;
};
/** 静态发布站：只含选定方案（compile 的 publish 模式），离线可打开，可直接 `wrangler deploy`。 */
/**
 * voice（D74）：带上的朗读音频。clips = 片段数；bytes = 新写入的字节；missing = 当前声音下还没有音频的步骤数（观众端这些步骤用浏览器朗读）；
 * profile = 选用的声音供应商名。没有选用供应商、也没有音频时省略。
 */
export type BuildResult = { outDir: string; files: string[]; routes: string[]; scenarios: string[]; diagnostics: Diagnostic[]; voice?: { clips: number; bytes: number; missing: number; profile: string | null; reused?: number; locales?: Record<string, { missing: number }> }; /** 有 scope 时：范围与借用了哪些别的功能的内容（D75）。 */ scope?: ScopeInfo };
export declare function buildSite(opts: BuildOptions): Promise<BuildResult>;

export type RenderOptions = {
  projectDir: string;
  scenarioId: string;
  /** 渲染该步骤执行之后的状态；缺省为初始状态。 */
  stepId?: string;
  /** 主题名（D51）：内置主题或项目 themes/<name>.css；缺省用项目配置的主题。 */
  theme?: string;
  /** UI language for the standalone render route. Unsupported values are ignored. */
  locale?: string;
  /** Author content language (D84): one of config locales; the screenshot shows that translation. */
  content?: string;
  /** 字体（D55）：hand / sans / serif / kai / mono；缺省跟随主题。 */
  font?: AppearanceFont | null;
  /** 线条（D55）：rough / clean；缺省跟随主题。 */
  stroke?: AppearanceStroke | null;
  out: string;
  overwrite?: boolean;
  /** 截图尺寸（D44）：舞台宽度仍是页面自己的 viewport，按比例放进这个尺寸。缺省为舞台尺寸。 */
  viewport?: { width: number; height: number };
  scale?: number;
  /** 按场景保密分享（D75）：只用这些场景裁剪后的 IR 渲染（share 的预览图），画面上不出现范围外功能堆进来的元素。 */
  scope?: string[];
};
export type RenderedElement = { id: string; type: string; label: string; visible: boolean; disabled: boolean; at: string | null; box: { x: number; y: number; width: number; height: number } };
export type RenderResult = { path: string; sceneId: string; position: number; scale: number; elements: RenderedElement[]; warnings: string[] };
export declare function renderStep(opts: RenderOptions): Promise<RenderResult>;
