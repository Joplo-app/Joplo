/**
 * @joplo-app/plugin-3d 运行时（浏览器端）：用 three.js 画 <Scene3D>。
 *
 * - 子元素（Object / Target）是数据：形状、位置、尺寸、颜色，和随状态变化的 lit / open / 可见 / 禁用。
 *   结构属性变了就重建这个物体；随状态变化的属性平滑过渡（frame.animate 为 false 时直接到终点）。
 * - 每个可见子元素在 DOM 里有一个锚点（带 node.attrs），摆在它投影到画面上的包围盒处：
 *   Joplo 的光标、镜头、聚光、圈注、⌥+单击检查都按锚点定位。锚点不接收指针事件。
 * - 观众拖动 = 旋转视角（只影响这位观众的画面）；单击 = 射线命中的子元素交给 ctx.click，由引擎判断。
 * - 颜色读主题变量（--jp-*），主题变化时重新上色；描边用墨色线条，和手绘 / 线框主题一致。
 */
import * as THREE from 'three';
import { loadModel, disposeModel, modelStructureKey } from './model.ts';
import { visibleLabel } from './label.ts';
import { defineRuntime, type ComponentCtx, type ComponentInstance, type PluginNode } from '@joplo-app/kit/plugin';

type Vec3 = [number, number, number];
type Role = 'ink' | 'bg' | 'surface' | 'subtle' | 'line' | 'muted' | 'accent' | 'info' | 'ok' | 'warn' | 'danger';
const ROLES: readonly Role[] = ['ink', 'bg', 'surface', 'subtle', 'line', 'muted', 'accent', 'info', 'ok', 'warn', 'danger'];
const FALLBACK: Record<Role, string> = { ink: '#1e1e1e', bg: '#fafaf7', surface: '#ffffff', subtle: '#f1f0ec', line: '#d8d6cf', muted: '#6b6b6b', accent: '#1971c2', info: '#4dabf7', ok: '#2f9e44', warn: '#f08c00', danger: '#e03131' };

/** 预设尺寸（米）；base = 底部中心在 at（落地家具），center = 中心在 at（墙、窗、挂墙设备）。 */
const PRESET: Record<string, { size: Vec3; anchor: 'base' | 'center'; color: Role }> = {
  box: { size: [1, 1, 1], anchor: 'base', color: 'surface' },
  cylinder: { size: [1, 1, 1], anchor: 'base', color: 'surface' },
  sphere: { size: [1, 1, 1], anchor: 'base', color: 'surface' },
  cone: { size: [1, 1, 1], anchor: 'base', color: 'surface' },
  floor: { size: [6, 0.1, 6], anchor: 'base', color: 'subtle' },
  wall: { size: [6, 3, 0.1], anchor: 'center', color: 'surface' },
  lamp: { size: [0.5, 1.7, 0.5], anchor: 'base', color: 'surface' },
  door: { size: [0.9, 2.1, 0.08], anchor: 'base', color: 'surface' },
  window: { size: [1.4, 1.1, 0.08], anchor: 'center', color: 'surface' },
  sofa: { size: [2, 0.8, 0.9], anchor: 'base', color: 'subtle' },
  table: { size: [1.2, 0.75, 0.8], anchor: 'base', color: 'surface' },
  bed: { size: [1.6, 0.6, 2.1], anchor: 'base', color: 'surface' },
  tv: { size: [1.4, 0.85, 0.08], anchor: 'center', color: 'ink' },
  plant: { size: [0.5, 1, 0.5], anchor: 'base', color: 'ok' },
  speaker: { size: [0.3, 0.5, 0.3], anchor: 'base', color: 'ink' },
  ac: { size: [0.9, 0.3, 0.25], anchor: 'center', color: 'surface' },
};

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const vec = (v: unknown, d: Vec3): Vec3 => (Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? (v as Vec3) : d);
const DEG = Math.PI / 180;
const CAMERA_MS = 700;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** 主题颜色：读 CSS 变量，用 2D canvas 规范化（color-mix 等写法也能得到 rgb）。 */
function themePalette(ctx: ComponentCtx): Record<Role, THREE.Color> {
  const c2d = document.createElement('canvas').getContext('2d');
  const out = {} as Record<Role, THREE.Color>;
  for (const r of ROLES) {
    const raw = ctx.css(`--jp-${r}`) || FALLBACK[r];
    let norm = FALLBACK[r];
    if (c2d) {
      c2d.fillStyle = FALLBACK[r];
      c2d.fillStyle = raw;
      norm = String(c2d.fillStyle);
    }
    const col = new THREE.Color();
    try {
      col.setStyle(norm.replace(/^rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)$/, 'rgb($1,$2,$3)'));
    } catch {
      col.set(FALLBACK[r]);
    }
    out[r] = col;
  }
  return out;
}

/** 灯的光晕：径向渐变的白色贴图，颜色由材质决定。 */
let haloTex: THREE.CanvasTexture | null = null;
function haloTexture(): THREE.CanvasTexture {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  haloTex = new THREE.CanvasTexture(c);
  return haloTex;
}

/** 卡通明暗的三级色阶。 */
function toonGradient(): THREE.DataTexture {
  const data = new Uint8Array([150, 150, 150, 255, 210, 210, 210, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

/** glow：亮起时的自发光颜色；tint：亮起时底色渐变到的颜色（灯罩）。 */
type Paint = { mat: THREE.MeshToonMaterial | THREE.MeshStandardMaterial | THREE.LineBasicMaterial; role: Role | string; glow?: Role; tint?: Role; originalColor?: THREE.Color };

/** 一个子元素在场景里的样子。 */
type Item = {
  release?: () => void;
  cancelled?: boolean;
  loaded?: THREE.Object3D;
  status?: HTMLDivElement;
  id: string;
  key: string;
  src?: unknown;
  node: PluginNode;
  group: THREE.Group;
  meshes: THREE.Mesh[];
  edges: THREE.LineSegments[];
  paints: Paint[];
  /** 门、窗扇的转轴。 */
  hinge: THREE.Object3D | null;
  hingeSign: number;
  light: THREE.PointLight | null;
  /** 灯亮起时的光晕。 */
  halo: THREE.Sprite | null;
  /** 随状态变化、平滑过渡的值。 */
  cur: { lit: number; open: number; show: number; fade: number };
  goal: { lit: number; open: number; show: number; fade: number };
  anchor: HTMLDivElement;
  label: HTMLDivElement | null;
};

class SceneView implements ComponentInstance {
  private ctx: ComponentCtx;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  private readonly world = new THREE.Group();
  private readonly overlay: HTMLDivElement;
  private readonly items = new Map<string, Item>();
  private readonly gradient = toonGradient();
  private palette: Record<Role, THREE.Color>;
  private theme = '';
  private width = 1;
  private height = 1;
  /** 视角：方位角、仰角（弧度）、注视点、半高（正交相机的取景）。 */
  private view = { az: 45 * DEG, el: 32 * DEG, target: new THREE.Vector3(), half: 4 };
  private tween: { from: SceneView['view']; to: SceneView['view']; t0: number } | null = null;
  private focusKey: string | null = null;
  /** 观众拖动过视角：画框尺寸变化时不再自动重新取景，直到下一次 focus 变化。 */
  private userMoved = false;
  private framedOnce = false;
  private resetKey: string | undefined;
  private frozen: { focusKey: string | null; view: SceneView['view']; tween: SceneView['tween']; values: Map<string, Item['cur']> } | null = null;
  private gestureFrom: SceneView['view'] | null = null;
  private last = 0;
  private hover: string | null = null;
  private drag: { x: number; y: number; az: number; el: number; moved: boolean; id: number; target?: string } | null = null;
  private readonly ro: ResizeObserver;
  private readonly raycaster = new THREE.Raycaster();
  private readonly cleanup: (() => void)[] = [];

  constructor(private readonly el: HTMLElement, ctx: ComponentCtx) {
    this.ctx = ctx;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x000000, 0);
    const canvas = this.renderer.domElement;
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab';
    canvas.setAttribute('aria-label', String(ctx.node.props.label ?? ctx.node.label ?? '3D scene'));
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
    el.style.position = 'relative';
    el.style.overflow = 'hidden';
    el.append(canvas, this.overlay);

    this.palette = themePalette(ctx);
    this.theme = ctx.frame.theme;
    this.scene.add(this.world);
    const hemi = new THREE.HemisphereLight(0xffffff, 0xbbbbbb, 2.2);
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(6, 10, 8);
    this.scene.add(hemi, sun);

    canvas.dataset.jgestureView = '';
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', String(ctx.node.props.label ?? ctx.node.label));
    this.bindPointer(canvas);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.update(ctx);
  }

  // ---------- 引擎每次渲染调用 ----------
  update(ctx: ComponentCtx): void {
    if (this.resetKey !== ctx.frame.resetKey && this.frozen) {
      this.view = this.frozen.view; this.tween = this.frozen.tween; this.focusKey = this.frozen.focusKey;
      for (const [id, value] of this.frozen.values) { const item = this.items.get(id); if (item) item.cur = value; }
      this.userMoved = false; this.frozen = null;
    }
    if (ctx.frame.playground && !this.frozen) this.freezeView();
    this.resetKey = ctx.frame.resetKey;
    this.ctx = ctx;
    const p = ctx.node.props;
    this.el.style.height = `${Math.max(160, num(p.height, 420))}px`;
    if (ctx.frame.theme !== this.theme) {
      this.theme = ctx.frame.theme;
      this.palette = themePalette(ctx);
      for (const it of this.items.values()) this.repaint(it);
    }
    this.sync(ctx.node.children);
    this.resize(false);
    // 镜头：focus 变化（或第一次）时重新取景；用户拖动过的视角由导演接管
    const focus = typeof p.focus === 'string' && this.items.has(p.focus) ? p.focus : null;
    const key = `${focus ?? '*'}|${String(p.view ?? 'iso')}|${String(p.azimuth ?? '')}|${String(p.elevation ?? '')}`;
    if (!this.framedOnce || key !== this.focusKey) {
      const to = this.frameFor(focus, String(p.view ?? 'iso'));
      if (!this.framedOnce || !ctx.frame.animate || !ctx.frame.clock || !ctx.frame.clock.running && !ctx.frame.clock.paused || ctx.frame.playground) {
        this.view = to;
        this.tween = null;
      } else this.tween = { from: { ...this.view, target: this.view.target.clone() }, to, t0: ctx.frame.clock?.timeMs ?? 0 };
      this.focusKey = key;
      this.framedOnce = true;
      this.userMoved = false;
    }
    if (!ctx.frame.animate || !ctx.frame.clock || !ctx.frame.clock.running && !ctx.frame.clock.paused || ctx.frame.playground) {
      for (const it of this.items.values()) it.cur = { ...it.goal };
      this.tween = null;
    }
    const gesture = ctx.frame.gesture;
    if (gesture?.action.type === 'plugin' && gesture.action.name === 'scene3d:rotate' && gesture.action.target === ctx.node.id) {
      // Audience orbit owns the view until the reset epoch. Retain the original
      // gesture anchor so reset/resume restores the same in-flight orientation.
      if (!this.userMoved) {
        if (!this.gestureFrom) this.gestureFrom = { ...this.view, target: this.view.target.clone() };
        const data = gesture.action.data;
        this.tween = null;
        this.view = { ...this.gestureFrom, az: this.gestureFrom.az + (num(data.azimuth, 45) * DEG - this.gestureFrom.az) * gesture.progress, el: this.gestureFrom.el + (num(data.elevation, 32) * DEG - this.gestureFrom.el) * gesture.progress };
      }
    } else this.gestureFrom = null;
    this.tick(ctx.frame.clock?.timeMs ?? 0, false);
  }

  private freezeView() {
    if (!this.frozen) this.frozen = { focusKey: this.focusKey, view: { ...this.view, target: this.view.target.clone() }, tween: this.tween, values: new Map([...this.items].map(([id, item]) => [id, {...item.cur}])) };
  }

  destroy(): void {
    this.ro.disconnect();
    for (const f of this.cleanup) f();
    for (const it of this.items.values()) this.dispose(it);
    this.gradient.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }

  // ---------- 子元素 ----------
  private sync(children: PluginNode[]): void {
    const seen = new Set<string>();
    for (const n of children) {
      if (n.name !== 'Object' && n.name !== 'Target' && n.name !== 'Model') continue;
      seen.add(n.id);
      const shape = typeof n.props.shape === 'string' && PRESET[n.props.shape] ? n.props.shape : 'box';
      const key = n.name === 'Model' ? modelStructureKey(n.props) : JSON.stringify([shape, n.props.at, n.props.size, n.props.rotate, n.props.color, n.props.outline]);
      let it = this.items.get(n.id);
      if (it && (it.key !== key || it.src !== n.props.src)) {
        this.dispose(it);
        this.items.delete(n.id);
        it = undefined;
      }
      if (!it) {
        it = this.build(n, shape, key);
        this.items.set(n.id, it);
        if (n.name === 'Model') this.load(it);
        // 新出现的物体：第一次就在终点（不从 0 长出来），之后的显示 / 隐藏才过渡
        it.cur = { lit: n.props.lit ? 1 : 0, open: n.props.open ? 1 : 0, show: n.visible ? 1 : 0, fade: n.disabled ? 1 : 0 };
      }
      const colorChanged = it.node.props.color !== n.props.color;
      it.node = n;
      if (it.loaded && colorChanged) {
        for (const paint of it.paints) if (paint.originalColor) paint.role = typeof n.props.color === 'string' ? n.props.color : 'original';
        this.repaint(it);
      }
      it.goal = { lit: n.props.lit ? 1 : 0, open: n.props.open ? 1 : 0, show: n.visible ? 1 : 0, fade: n.disabled ? 1 : 0 };
      // 锚点：引擎要求的属性原样放上
      for (const a of [...it.anchor.attributes]) if (a.name.startsWith('data-') || a.name.startsWith('aria-')) it.anchor.removeAttribute(a.name);
      for (const [k, v] of Object.entries(n.attrs)) it.anchor.setAttribute(k, v);
      const text = visibleLabel(n.props, n.interactive);
      const wantLabel = text !== null;
      if (wantLabel && !it.label) {
        it.label = document.createElement('div');
        it.label.style.cssText = 'position:absolute;transform:translate(-50%,-100%);white-space:nowrap;font:500 12px/1.4 var(--jp-font);color:var(--jp-ink);background:var(--jp-surface);border:1px solid var(--jp-line-strong);border-radius:4px;padding:1px 7px;transition:opacity .25s';
        this.overlay.append(it.label);
      } else if (!wantLabel && it.label) {
        it.label.remove();
        it.label = null;
      }
      if (it.label) it.label.textContent = text;
    }
    for (const [id, it] of this.items) if (!seen.has(id)) {
      this.dispose(it);
      this.items.delete(id);
    }
  }

  private mat(paints: Paint[], role: Role | string, glow?: Role, opts: THREE.MeshToonMaterialParameters = {}): THREE.MeshToonMaterial {
    const m = new THREE.MeshToonMaterial({ gradientMap: this.gradient, ...opts });
    paints.push({ mat: m, role, ...(glow ? { glow } : {}) });
    return m;
  }

  private color(role: Role | string): THREE.Color {
    if ((ROLES as readonly string[]).includes(role)) return this.palette[role as Role].clone();
    const c = new THREE.Color();
    try {
      c.setStyle(role);
    } catch {
      c.copy(this.palette.surface);
    }
    return c;
  }

  private build(n: PluginNode, shape: string, key: string): Item {
    const pre = PRESET[shape]!;
    const [w, h, d] = vec(n.props.size, pre.size);
    const at = vec(n.props.at, [0, 0, 0]);
    const tone: Role | string = typeof n.props.color === 'string' && n.props.color ? n.props.color : pre.color;
    const group = new THREE.Group();
    group.position.set(at[0], at[1], at[2]);
    group.rotation.y = num(n.props.rotate, 0) * DEG;
    const paints: Paint[] = [];
    const meshes: THREE.Mesh[] = [];
    let hinge: THREE.Object3D | null = null;
    let hingeSign = 1;
    let light: THREE.PointLight | null = null;
    const y0 = pre.anchor === 'base' ? 0 : -h / 2;
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = group) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.userData.itemId = n.id;
      parent.add(mesh);
      meshes.push(mesh);
      return mesh;
    };
    const box = (bw: number, bh: number, bd: number) => new THREE.BoxGeometry(bw, bh, bd);
    // 通用形状亮起时整体发光；预设物件只让专门的部件发光（灯罩、屏幕、指示灯）
    const generic = shape === 'box' || shape === 'cylinder' || shape === 'sphere' || shape === 'cone';
    const body = this.mat(paints, tone, generic ? 'warn' : undefined);
    let halo: THREE.Sprite | null = null;

    switch (shape) {
      case 'cylinder':
        add(new THREE.CylinderGeometry(w / 2, w / 2, h, 32), body, 0, h / 2, 0).scale.set(1, 1, d / w);
        break;
      case 'sphere':
        add(new THREE.SphereGeometry(0.5, 32, 16), body, 0, h / 2, 0).scale.set(w, h, d);
        break;
      case 'cone':
        add(new THREE.ConeGeometry(w / 2, h, 32), body, 0, h / 2, 0).scale.set(1, 1, d / w);
        break;
      case 'floor':
        add(box(w, h, d), body, 0, -h / 2, 0);
        break;
      case 'wall':
        add(box(w, h, d), body, 0, 0, 0);
        break;
      case 'lamp': {
        const dark = this.mat(paints, 'ink');
        add(new THREE.CylinderGeometry(w * 0.36, w * 0.4, 0.05, 24), dark, 0, 0.025, 0);
        add(new THREE.CylinderGeometry(0.022, 0.022, h * 0.8, 8), dark, 0, h * 0.4, 0);
        const shade = this.mat(paints, tone, 'warn', { side: THREE.DoubleSide });
        paints[paints.length - 1]!.tint = 'warn';
        add(new THREE.CylinderGeometry(w * 0.26, w * 0.5, h * 0.22, 32, 1, true), shade, 0, h * 0.86, 0);
        halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), transparent: true, depthWrite: false }));
        halo.scale.setScalar(w * 3.2);
        halo.position.set(0, h * 0.86, 0);
        paints.push({ mat: halo.material as unknown as THREE.LineBasicMaterial, role: 'halo' });
        group.add(halo);
        light = new THREE.PointLight(0xffffff, 0, 7, 1.4);
        light.position.set(0, h * 0.8, 0);
        group.add(light);
        break;
      }
      case 'door': {
        hinge = new THREE.Group();
        hinge.position.set(-w / 2, 0, 0);
        group.add(hinge);
        add(box(w, h, d), body, w / 2, h / 2, 0, hinge);
        add(new THREE.SphereGeometry(0.04, 12, 8), this.mat(paints, 'ink'), w - 0.1, h * 0.48, d / 2 + 0.03, hinge);
        hingeSign = 1;
        break;
      }
      case 'window': {
        const fw = 0.06;
        add(box(w, fw, d), body, 0, h / 2 - fw / 2, 0);
        add(box(w, fw, d), body, 0, -h / 2 + fw / 2, 0);
        add(box(fw, h, d), body, -w / 2 + fw / 2, 0, 0);
        add(box(fw, h, d), body, w / 2 - fw / 2, 0, 0);
        hinge = new THREE.Group();
        hinge.position.set(-w / 2 + fw, 0, d / 2);
        group.add(hinge);
        const glass = this.mat(paints, 'info', undefined, { transparent: true, opacity: 0.35 });
        add(box(w - fw * 2, h - fw * 2, 0.02), glass, (w - fw * 2) / 2, 0, 0, hinge);
        hingeSign = 1;
        break;
      }
      case 'sofa': {
        add(box(w, h * 0.5, d), body, 0, h * 0.25, 0);
        add(box(w, h * 0.55, d * 0.22), body, 0, h * 0.5 + h * 0.275, -d / 2 + d * 0.11);
        add(box(w * 0.1, h * 0.75, d), body, -w / 2 + w * 0.05, h * 0.375, 0);
        add(box(w * 0.1, h * 0.75, d), body, w / 2 - w * 0.05, h * 0.375, 0);
        break;
      }
      case 'table': {
        add(box(w, 0.05, d), body, 0, h - 0.025, 0);
        const leg = this.mat(paints, 'ink');
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.025, 0.025, h - 0.05, 8), leg, sx * (w / 2 - 0.08), (h - 0.05) / 2, sz * (d / 2 - 0.08));
        break;
      }
      case 'bed': {
        add(box(w, h * 0.55, d), body, 0, h * 0.275, 0);
        add(box(w * 0.96, h * 0.32, d * 0.96), this.mat(paints, 'subtle', 'warn'), 0, h * 0.55 + h * 0.16, 0);
        add(box(w * 0.7, h * 0.16, d * 0.16), body, 0, h * 0.95, -d / 2 + d * 0.14);
        add(box(w, h * 1.6, 0.08), body, 0, h * 0.8, -d / 2 - 0.04);
        break;
      }
      case 'tv': {
        add(box(w, h, d), body, 0, 0, 0);
        add(new THREE.PlaneGeometry(w * 0.93, h * 0.88), this.mat(paints, 'line', 'info'), 0, 0, d / 2 + 0.002);
        break;
      }
      case 'plant': {
        add(new THREE.CylinderGeometry(w * 0.36, w * 0.28, h * 0.35, 20), this.mat(paints, 'muted'), 0, h * 0.175, 0);
        add(new THREE.SphereGeometry(w * 0.5, 16, 12), body, 0, h * 0.62, 0);
        add(new THREE.SphereGeometry(w * 0.32, 14, 10), body, w * 0.18, h * 0.86, w * 0.05);
        break;
      }
      case 'speaker': {
        add(new THREE.CylinderGeometry(w / 2, w / 2, h, 28), body, 0, h / 2, 0);
        add(new THREE.CylinderGeometry(w / 2 + 0.005, w / 2 + 0.005, 0.03, 28), this.mat(paints, 'line', 'info'), 0, h - 0.04, 0);
        break;
      }
      case 'ac': {
        add(box(w, h, d), body, 0, 0, 0);
        add(box(w * 0.8, 0.025, 0.01), this.mat(paints, 'line', 'info'), 0, -h / 2 + 0.06, d / 2 + 0.006);
        break;
      }
      default:
        add(box(w, h, d), body, 0, y0 + h / 2, 0);
    }
    // 墨色描边
    const edges: THREE.LineSegments[] = [];
    for (const m of meshes) {
      const lm = new THREE.LineBasicMaterial({ transparent: true });
      paints.push({ mat: lm, role: 'ink' });
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 28), lm);
      e.position.copy(m.position);
      e.rotation.copy(m.rotation);
      e.scale.copy(m.scale);
      m.parent!.add(e);
      edges.push(e);
    }
    this.world.add(group);
    const anchor = document.createElement('div');
    anchor.style.cssText = 'position:absolute;pointer-events:none';
    this.overlay.append(anchor);
    const it: Item = { id: n.id, key, src: n.props.src, node: n, group, meshes, edges, paints, hinge, hingeSign, light, halo, cur: { lit: 0, open: 0, show: 1, fade: 0 }, goal: { lit: 0, open: 0, show: 1, fade: 0 }, anchor, label: null };
    this.repaint(it);
    return it;
  }

  private repaint(it: Item): void {
    for (const p of it.paints) {
      if (p.role === 'halo') (p.mat as unknown as THREE.SpriteMaterial).color.copy(this.palette.warn);
      else if (p.mat instanceof THREE.LineBasicMaterial) p.mat.color.copy(this.palette.ink);
      else {
        if (p.role !== 'original') p.mat.color.copy(this.color(p.role));
        else if (p.originalColor) p.mat.color.copy(p.originalColor);
        if (p.glow) p.mat.emissive.copy(this.palette[p.glow]);
      }
    }
    if (it.light) it.light.color.copy(this.palette.warn);
  }

  private load(it: Item): void {
    const release = this.ctx.hold(); let released = false;
    it.release = () => { if (!released) { released = true; release(); } };
    const status = document.createElement('div');
    status.textContent = 'Loading 3D model…'; status.setAttribute('role','status');
    status.style.cssText = 'position:absolute;left:12px;top:12px;padding:6px 10px;background:var(--jp-surface);color:var(--jp-ink);border:1px solid var(--jp-line);font:12px var(--jp-font)';
    this.overlay.append(status); it.status = status;
    void loadModel(it.node.props.src).then(model => {
      if (it.cancelled) { disposeModel(model); return; }
      // Replace the visible loading box, retaining the stable item and its anchors.
      for (const mesh of it.meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); }
      for (const edge of it.edges) { edge.removeFromParent(); edge.geometry.dispose(); }
      for (const paint of it.paints) paint.mat.dispose();
      it.meshes = []; it.edges = []; it.paints = [];
      const box = new THREE.Box3().setFromObject(model), dimensions = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
      const size = vec(it.node.props.size, [1,1,1]);
      const scale = Math.min(...size.map((v,i) => dimensions.getComponent(i) > 1e-8 ? v / dimensions.getComponent(i) : Infinity));
      if (!Number.isFinite(scale) || scale <= 0) { disposeModel(model); throw new Error('Empty model geometry'); }
      model.position.sub(new THREE.Vector3(center.x,box.min.y,center.z));
      const normalized = new THREE.Group(); normalized.add(model); normalized.scale.setScalar(scale); it.group.add(normalized); it.loaded = normalized;
      model.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.userData.itemId = it.id; it.meshes.push(object);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshToonMaterial) it.paints.push({mat:material,role:typeof it.node.props.color === 'string' ? it.node.props.color : 'original',glow:'warn',originalColor:material.color.clone()});
        }
        if (it.node.props.outline !== false) {
          const material = new THREE.LineBasicMaterial({transparent:true});
          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(object.geometry,28),material);
          object.add(edges); it.edges.push(edges); it.paints.push({mat:material,role:'ink'});
        }
      });
      status.remove(); it.status = undefined;
      this.repaint(it);
      if (!this.userMoved) { this.view = this.frameFor(this.focusId(),String(this.ctx.node.props.view ?? 'iso')); this.tween = null; }
      this.tick(this.ctx.frame.clock?.timeMs ?? 0, false);
    }).catch(() => {
      if (it.cancelled) return;
      status.textContent = `${it.node.label || it.id}: model unavailable. Restore a valid GLB or run joplo resources.`;
      status.dataset.joploDiagnostic = 'MODEL_LOAD_FAILED'; status.setAttribute('role','alert');
    }).finally(() => it.release?.());
  }

  private dispose(it: Item): void {
    it.cancelled = true; it.release?.(); it.status?.remove();
    if (it.loaded) disposeModel(it.loaded);
    this.world.remove(it.group);
    for (const m of it.meshes) m.geometry.dispose();
    for (const e of it.edges) e.geometry.dispose();
    for (const p of it.paints) p.mat.dispose();
    it.anchor.remove();
    it.label?.remove();
  }

  /** 每帧把过渡值落到场景上。 */
  private apply(it: Item): void {
    const { lit, open, show, fade } = it.cur;
    const hovered = this.hover === it.id && it.node.interactive && !it.node.disabled;
    const selected = this.ctx.frame.selectedId === it.id;
    for (const p of it.paints) {
      if (p.role === 'halo') {
        (p.mat as unknown as THREE.SpriteMaterial).opacity = lit * 0.75 * show;
        continue;
      }
      if (p.mat instanceof THREE.LineBasicMaterial) {
        p.mat.color.copy(hovered || selected ? this.palette.accent : this.palette.ink);
        p.mat.opacity = (1 - fade * 0.6) * show;
      } else {
        if (p.glow) p.mat.emissiveIntensity = lit * (p.glow === 'warn' && it.light ? 0.6 : 0.85);
        if (p.tint) p.mat.color.copy(this.color(p.role)).lerp(this.palette[p.tint], lit * 0.7);
        const baseOpacity = p.mat.userData.baseOpacity ?? (p.mat.userData.baseOpacity = p.mat.opacity);
        const o = baseOpacity * (1 - fade * 0.55) * show;
        p.mat.transparent = o < 0.999 || p.mat.userData.baseOpacity < 1;
        p.mat.opacity = o;
      }
    }
    if (it.light) it.light.intensity = lit * 5;
    if (it.halo) it.halo.visible = lit > 0.01 && show > 0.01;
    if (it.hinge) it.hinge.rotation.y = -it.hingeSign * open * (it.node.props.shape === 'door' ? 1.45 : 1.15);
    it.group.visible = show > 0.01;
    const s = 0.6 + 0.4 * show;
    it.group.scale.setScalar(s);
  }

  // ---------- 镜头 ----------
  private boxOf(ids: string[] | null): THREE.Box3 {
    const b = new THREE.Box3();
    for (const it of this.items.values()) {
      if (ids && !ids.includes(it.id)) continue;
      if (!ids && it.goal.show < 0.5) continue;
      const s = it.group.scale.x;
      it.group.scale.setScalar(1);
      it.group.updateWorldMatrix(true, true);
      for (const m of it.meshes) b.expandByObject(m);
      it.group.scale.setScalar(s);
    }
    if (b.isEmpty()) b.set(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 2, 2));
    return b;
  }

  private frameFor(focus: string | null, viewName: string): SceneView['view'] {
    const angles = viewName === 'front' ? { az: 0, el: 12 * DEG } : viewName === 'top' ? { az: 0, el: 88 * DEG } : { az: 45 * DEG, el: 32 * DEG };
    const b = this.boxOf(focus ? [focus] : null);
    const sphere = b.getBoundingSphere(new THREE.Sphere());
    const aspect = this.width / Math.max(1, this.height);
    const r = Math.max(sphere.radius, focus ? 0.9 : 1.5);
    const half = (focus ? 1.9 : 1.04) * Math.max(r, r / Math.max(0.2, aspect)) * (focus ? 1 : 0.92);
    const p = this.ctx.node.props;
    return { ...angles, az: typeof p.azimuth === 'number' ? p.azimuth * DEG : angles.az, el: typeof p.elevation === 'number' ? p.elevation * DEG : angles.el, target: sphere.center.clone(), half };
  }

  private placeCamera(): void {
    const { az, el, target, half } = this.view;
    const dir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    this.camera.position.copy(target).addScaledVector(dir, 80);
    this.camera.up.set(0, 1, 0);
    if (el > 80 * DEG) this.camera.up.set(-Math.sin(az), 0, -Math.cos(az));
    this.camera.lookAt(target);
    const aspect = this.width / Math.max(1, this.height);
    this.camera.left = -half * aspect;
    this.camera.right = half * aspect;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
  }

  private focusId(): string | null {
    const f = this.ctx.node.props.focus;
    return typeof f === 'string' && this.items.has(f) ? f : null;
  }

  private reportOrbit() {
    const azimuth = ((this.view.az / DEG + 180) % 360 + 360) % 360 - 180;
    this.ctx.act?.(this.ctx.node.id, {type:'plugin',name:'scene3d:rotate',data:{azimuth,elevation:this.view.el / DEG}});
  }

  // ---------- 帧 ----------
  private resize(render = true): void {
    const w = Math.max(1, this.el.clientWidth);
    const h = Math.max(1, this.el.clientHeight);
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    if (this.framedOnce && !this.userMoved && !this.tween) this.view = this.frameFor(this.focusId(), String(this.ctx.node.props.view ?? 'iso'));
    if (render) this.tick(this.ctx.frame.clock?.timeMs ?? 0, true);
  }

  private tick(now: number, immediate: boolean): void {
    const dt = immediate || !this.last ? 0 : Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    let busy = false;
    // 过渡：指数逼近；frame.animate 为 false 时 update 已经直接到终点
    const k = 1 - Math.exp(-dt * 9);
    for (const it of this.items.values()) {
      for (const f of ['lit', 'open', 'show', 'fade'] as const) {
        const d = it.goal[f] - it.cur[f];
        if (Math.abs(d) < 0.002) it.cur[f] = it.goal[f];
        else {
          it.cur[f] += d * k;
          busy = true;
        }
      }
      this.apply(it);
    }
    if (this.tween) {
      const t = Math.min(1, (now - this.tween.t0) / CAMERA_MS);
      const e = ease(t);
      const { from, to } = this.tween;
      let daz = to.az - from.az;
      daz = ((daz + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      this.view = { az: from.az + daz * e, el: from.el + (to.el - from.el) * e, target: from.target.clone().lerp(to.target, e), half: from.half + (to.half - from.half) * e };
      if (t >= 1) this.tween = null;
      else busy = true;
    }
    this.placeCamera();
    this.renderer.render(this.scene, this.camera);
    this.placeOverlay();
    if (busy && (!this.ctx.frame.animate || !this.ctx.frame.clock)) {
      for (const it of this.items.values()) {
        it.cur = { ...it.goal };
        this.apply(it);
      }
      this.renderer.render(this.scene, this.camera);
      this.placeOverlay();
    }
  }

  /** 锚点与名牌：物体包围盒投影到画面上的位置（元素坐标，未缩放）。 */
  private placeOverlay(): void {
    const v = new THREE.Vector3();
    const b = new THREE.Box3();
    for (const it of this.items.values()) {
      const visible = it.node.visible && it.cur.show > 0.5;
      it.anchor.style.display = visible ? '' : 'none';
      if (it.label) it.label.style.opacity = visible ? '1' : '0';
      if (!visible) continue;
      b.makeEmpty();
      for (const m of it.meshes) b.expandByObject(m);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(this.camera);
        const px = (v.x * 0.5 + 0.5) * this.width;
        const py = (-v.y * 0.5 + 0.5) * this.height;
        x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
      }
      // 夹到画面里，至少 8px，便于光标与提示对准
      const cx0 = Math.max(0, Math.min(this.width - 8, x0));
      const cy0 = Math.max(0, Math.min(this.height - 8, y0));
      const cx1 = Math.max(cx0 + 8, Math.min(this.width, x1));
      const cy1 = Math.max(cy0 + 8, Math.min(this.height, y1));
      Object.assign(it.anchor.style, { left: `${cx0}px`, top: `${cy0}px`, width: `${cx1 - cx0}px`, height: `${cy1 - cy0}px` });
      if (it.label) {
        it.label.style.left = `${(cx0 + cx1) / 2}px`;
        it.label.style.top = `${Math.max(18, cy0 - 4)}px`;
      }
    }
  }

  // ---------- 指针 ----------
  private pick(clientX: number, clientY: number): Item | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const meshes = [...this.items.values()].filter((it) => it.node.visible && it.cur.show > 0.5).flatMap((it) => it.meshes);
    const hits = this.raycaster.intersectObjects(meshes, false);
    // 优先命中可操作的元素（灯在墙前面时点到墙也算点灯附近的墙，不抢灯）
    const ids = hits.map((h) => h.object.userData.itemId as string);
    const first = ids.find((id) => this.items.get(id)?.node.interactive) ?? ids.find((id) => { const s = this.items.get(id)?.node.props.shape; return s !== 'floor' && s !== 'wall'; }) ?? null;
    return first ? this.items.get(first) ?? null : null;
  }

  private bindPointer(canvas: HTMLCanvasElement): void {
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      canvas.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => canvas.removeEventListener(type, fn as EventListener, opts));
    };
    const scale = () => {
      const r = canvas.getBoundingClientRect();
      return r.width / Math.max(1, canvas.clientWidth) || 1;
    };
    const key = (e: KeyboardEvent) => {
      if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation(); this.freezeView(); this.userMoved = true; this.tween = null;
      const step = (e.shiftKey ? 1 : 15) * DEG;
      this.view.az += e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      this.view.el = Math.max(6 * DEG, Math.min(86 * DEG, this.view.el + (e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0)));
      this.tick(this.ctx.frame.clock?.timeMs ?? 0, true); this.reportOrbit();
    };
    canvas.addEventListener('keydown', key); this.cleanup.push(() => canvas.removeEventListener('keydown', key));
    on('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation(); // 不让舞台把拖动当作平移
      const hit = this.pick(e.clientX, e.clientY);
      // Host-owned anchor metadata is the same ownership decision used by DOM gestures.
      const target = hit?.anchor.hasAttribute('data-jdraggable') ? hit.id : undefined;
      this.ctx.hover?.(null);
      this.drag = { x: e.clientX, y: e.clientY, az: this.view.az, el: this.view.el, moved: false, id: e.pointerId, target };
    });
    on('pointermove', (e) => {
      const d = this.drag;
      if (d && e.buttons & 1) {
        e.stopPropagation();
        const s = scale();
        const dx = (e.clientX - d.x) / s;
        const dy = (e.clientY - d.y) / s;
        if (!d.moved && Math.hypot(dx, dy) < 4) return;
        if (!d.moved) {
          d.moved = true;
          canvas.setPointerCapture?.(d.id);
          canvas.style.cursor = 'grabbing';
        }
        if (d.target) return;
        this.freezeView();
        this.tween = null;
        this.userMoved = true;
        this.view = { ...this.view, az: d.az - dx * 0.008, el: Math.max(6 * DEG, Math.min(86 * DEG, d.el + dy * 0.006)) };
        this.tick(this.ctx.frame.clock?.timeMs ?? 0, true);
        return;
      }
      const hit = this.pick(e.clientX, e.clientY);
      const id = hit?.id ?? null;
      this.ctx.hover?.(e.pointerType === 'touch' ? null : id);
      if (id !== this.hover) {
        this.hover = id;
        this.tick(this.ctx.frame.clock?.timeMs ?? 0, true);
      }
      canvas.style.cursor = this.ctx.frame.mode === 'review' ? 'help' : hit?.node.interactive ? 'pointer' : 'grab';
    });
    on('pointerleave', () => {
      this.ctx.hover?.(null);
      if (this.hover) {
        this.hover = null;
        this.tick(this.ctx.frame.clock?.timeMs ?? 0, true);
      }
    });
    on('pointerup', (e) => {
      const d = this.drag;
      this.drag = null;
      canvas.style.cursor = 'grab';
      if (!d) return;
      e.stopPropagation();
      if (d.moved) {
        if (d.target) {
          const stage = this.el.closest<HTMLElement>('[data-joplo-stage]');
          const box = stage?.getBoundingClientRect();
          const scale = box && stage ? box.width / stage.offsetWidth || 1 : 1;
          const point = {x:(e.clientX-(box?.left??0))/scale,y:(e.clientY-(box?.top??0))/scale};
          const destination = this.pick(e.clientX, e.clientY);
          this.ctx.act?.(d.target, {type:'drag',to:destination && destination.id !== d.target ? destination.id : point}, {type:'drag',target:d.target,to:point});
        } else this.reportOrbit();
        return;
      }
      const hit = this.pick(e.clientX, e.clientY);
      if (hit) this.ctx.click(hit.id, { clientX: e.clientX, clientY: e.clientY, altKey: e.altKey });
    });
    // 原生 click 不交给舞台（上面已经按命中的元素转交引擎）
    on('click', (e) => e.stopPropagation());
  }
}

export default defineRuntime({
  id: 'scene3d',
  components: {
    Scene: { mount: (el, ctx) => new SceneView(el, ctx) },
  },
});
