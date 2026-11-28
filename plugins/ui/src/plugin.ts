import { compileCompare } from './compare-options.ts';
import { isRegionRect } from './image-geometry.ts';
import labels from './labels.json' with { type: 'json' };
import type { PluginText } from '@joplo-app/kit/plugin';
import packageInfo from './version.json' with { type: 'json' };
import { skill, patterns, componentGuide } from './guide.ts';
import { definePlugin, type ComponentRole, type ElementTraits, type PluginComponentSpec, type PluginIRNode } from '@joplo-app/kit/plugin';
import { COMPONENT_TYPES, COMPONENT_DOCS, COMPONENT_EXAMPLES, INTERACTIVE_TYPES, VALUE_TYPES, GATED_CONTAINERS, HTML_TAGS } from './catalog.ts';

// The UI family owns its vocabulary and display semantics, including HTML fallbacks.
const display: Record<string,string[]> = {
  Divider:['label'], Blockquote:['cite'], Avatar:['name'], Image:['alt'], 'Image.Region':['label'], 'Compare.Side':['label'], Indicator:['label'],
  'Timeline.Item':['title'], Table:['data'], DataTable:['records','noRecordsText'],
  Radio:['label'], 'Radio.Card':['label','description','leftSection'], 'Radio.Group':['label','description','value','error'],
  'Stepper.Step':['label','description'], Alert:['title'], Notification:['title'], Modal:['title'], Drawer:['title'],
  RingProgress:['label'], ChatMessage:['name'], ToolCall:['title'], Thinking:['title','duration'],
  Artifact:['title'], 'Artifact.Ref':['title'], Email:['from','to','subject','time'], DataCard:['title','value'], StateFlow:['labels'],
  Terminal:['title'], 'Terminal.Input':['prompt','placeholder','value'], Placeholder:['label'],
  EmptyState:['title','description'], ListRow:['title','description','avatar'], Stat:['label','value','diff','description'],
  KeyValue:['items'],
  NavLink:['label','description','leftSection','rightSection'], Button:['leftSection','rightSection'],
  'Menu.Item':['leftSection','rightSection'], 'Tabs.Tab':['leftSection','rightSection'],
  BrowserWindow:['label','url'], Arrow:['label'],
};
const textPaths: Record<string,string[][]> = {Compare:[['compareOptions','*','label']],DataTable:[['columns','*','title']],DataCard:[['fields','*','label']]};
const fieldText = ['label','description','placeholder','error','value'];
const traits = (name: string): ElementTraits => ({
  ...(INTERACTIVE_TYPES.has(name) ? {hover:true} : {}),
  ...(name === 'Tabs.Panel' ? {selectionGate:{owner:'ui:Tabs',value:'value',fallbackFirst:true}} : {}),
  ...(name === 'Accordion.Panel' ? {selectionGate:{owner:'ui:Accordion',item:'ui:Accordion.Item',value:'value'}} : {}),
  ...(['TextInput', 'Textarea', 'PasswordInput', 'NumberInput', 'Autocomplete', 'PromptInput'].includes(name) ? {native:{action:'type',prop:'value'}} as const : {}),
  ...(['Switch', 'Checkbox', 'Radio'].includes(name) ? {native:{action:'toggle',prop:'checked'}} as const : {}),
  ...(['Compare', 'Tabs', 'Accordion', 'Radio.Group', 'Select', 'MultiSelect', 'SegmentedControl'].includes(name) ? {native:{action:'select',prop:'value',...(name === 'Accordion' ? {deselect:true} : {})}} as const : {}),
  ...(textPaths[name] ? {textPaths:textPaths[name]} : {}),
  text: ['aria-label', ...(display[name] ?? []), ...(VALUE_TYPES.has(name) && name !== 'Compare' ? fieldText : []), ...(['Select','MultiSelect','SegmentedControl','TabBar'].includes(name) ? ['data'] : [])],
  ...(name === 'Indicator' ? {disabledPresentation:true} : {}),
  ...(['Card','Paper','Modal','Drawer','Alert','Notification','Email','DataCard','StateFlow','Artifact','Terminal','ChatMessage','Table','DataTable','Accordion.Item','Tabs.Panel','AppShell.Navbar','AppShell.Aside','AppShell.Header','AppShell.Footer','BrowserWindow'].includes(name) ? {frame:true} : {}),
  ...(VALUE_TYPES.has(name) ? { input: name === 'MultiSelect' ? 'multiple' : 'single' } as const : {}),
  ...(GATED_CONTAINERS.has(name) ? { gate: ['opened'], selfEvident: true } : {}),
  ...(['DataCard','StateFlow','Board','Arrow'].includes(name) ? {selfEvident:true} : {}),
  ...(name === 'Checkbox' ? {toggleCaption:'check'} as const : {}),
  ...(['Select','MultiSelect','SegmentedControl','TabBar'].includes(name) ? {choices:{prop:'data'}} : {}),
  ...(name === 'Radio.Group' ? {choices:{descendants:['ui:Radio','ui:Radio.Card']}} : {}),
  ...(name === 'Compare' ? {choices:{prop:'compareOptions'}} : {}),
  ...(name === 'Tabs' ? {choices:{descendants:['ui:Tabs.Tab']}} : {}),
  ...(name === 'Accordion' ? {choices:{descendants:['ui:Accordion.Item'],labelChild:'ui:Accordion.Control'}} : {}),
  ...(name === 'Pagination' ? {choices:{range:'total'}} : {}),
  ...(name === 'AppShell' ? {layout:{header:{size:'height',defaultSize:60},footer:{size:'height',defaultSize:60},navbar:{size:'width',defaultSize:260,breakpoint:true},aside:{size:'width',defaultSize:300,breakpoint:true}}} : {}),
  ...(name === 'AppShell.Navbar' ? {region:'navbar'} : {}),
  ...(name === 'AppShell.Aside' ? {region:'aside'} : {}),
  ...(name === 'Phone' ? {childWidth:{value:390,when:{prop:'landscape',value:true,width:772}}} : {}),
});
const ROLE_GROUPS: readonly (readonly [ComponentRole, readonly string[]])[] = [
  ['stage', ['Board', 'BrowserWindow', 'Phone', 'AppShell', 'AppShell.Header', 'AppShell.Navbar', 'AppShell.Main', 'AppShell.Aside', 'AppShell.Footer']],
  ['metric', ['Stat', 'RingProgress', 'Progress', 'KeyValue', 'DataCard', 'DataTable', 'Table', 'Table.Thead', 'Table.Tbody', 'Table.Tr', 'Table.Th', 'Table.Td']],
  ['comparison', ['Compare', 'Compare.Side']],
  ['state', ['StateFlow', 'Timeline', 'Timeline.Item', 'Stepper', 'Stepper.Step']],
  ['code', ['Code', 'Terminal', 'Terminal.Command', 'Terminal.Output', 'Terminal.Input', 'Kbd']],
  ['conversation', ['ChatMessage', 'ToolCall', 'Thinking', 'Artifact', 'Artifact.Ref', 'Email', 'PromptInput']],
  ['annotation', ['Note', 'Arrow', 'Alert', 'Notification', 'Blockquote', 'EmptyState', 'Badge', 'Indicator', 'ThemeIcon', 'Loader', 'Skeleton', 'Placeholder']],
  ['media', ['Image', 'Image.Region', 'Avatar', 'Avatar.Group']],
  ['control', ['Radio', 'Radio.Card', 'Menu', 'Menu.Target', 'Menu.Dropdown', 'Menu.Label', 'Menu.Divider', 'Tabs.List', 'Tabs.Panel', 'Accordion', 'Accordion.Item', 'Accordion.Panel', 'Breadcrumbs', 'Modal', 'Drawer']],
];
const COMPONENT_ROLE: Record<string, ComponentRole> = Object.fromEntries(ROLE_GROUPS.flatMap(([role, names]) => names.map((name) => [name, role])));
const roleOf = (name: string): ComponentRole => {
  if (HTML_TAGS.includes(name)) return 'layout';
  if (COMPONENT_ROLE[name]) return COMPONENT_ROLE[name]!;
  return INTERACTIVE_TYPES.has(name) ? 'control' : 'layout';
};
export const components: Record<string, PluginComponentSpec> = Object.fromEntries(COMPONENT_TYPES.map(name=>[name,{
  // 看板检查抽屉里给人看的组件名（各语言），只进 dev IR
  ...((labels as Record<string, PluginText>)[name] ? {label:(labels as Record<string, PluginText>)[name]} : {}),
  role: roleOf(name),
  doc: COMPONENT_DOCS[name],
  ...(COMPONENT_EXAMPLES[name] ? {example:COMPONENT_EXAMPLES[name]} : {}),
  ...(HTML_TAGS.includes(name) ? {intrinsic:name} : {}),
  ...(INTERACTIVE_TYPES.has(name) ? {interactive:true} : {}),
  traits: traits(name),
  ...(name==='Menu' ? {inherit:[{target:'ui:Menu.Dropdown',props:['opened']}]} : {}),
  ...(name==='Compare.Side' ? {parent:'Compare'} : {}),
  ...(name==='Image.Region' ? {parent:'Image',needsId:true} : {}),
  ...(name==='Arrow' ? {parent:'Board'} : {}),
}]));
export default definePlugin({ packageName: '@joplo-app/plugin-ui',
  id:'ui', title:'Standard UI', version:packageInfo.version,
  bestFor: 'Product UI screens, interactive controls, KPI stats/gauges, side-by-side comparisons, terminals, and AI chat/agent panels',
  pairsWith: [
    { with: 'content', packageName: '@joplo-app/plugin-content', how: 'Place ui screens, BrowserWindow, Stat, Compare, or Terminal panels inside content:Canvas camera islands so the camera travels across states instead of cutting between static cards.' },
    { with: 'diagram', packageName: '@joplo-app/plugin-diagram', how: 'Nest ui Stat, Badge, Code, Terminal, or ChatMessage inside diagram BoardZone/ClusterBox/ArchNode/DeviceFrame, or show a live architecture/sequence layer beside the product UI.' },
    { with: 'viz', packageName: '@joplo-app/plugin-viz', how: 'Pair ui KPI Stat/RingProgress/Compare widgets with viz data visualizations in the same dashboard or Canvas island.' },
    { with: 'code', packageName: '@joplo-app/plugin-code', how: 'Mount code:Editor beside ui Terminal, BrowserWindow, or DataCard so animated code edits visibly drive output.' },
    { with: 'media', packageName: '@joplo-app/plugin-av', how: 'Embed engine-clock Video or Lottie clips inside ui frames, or add crisp one-shot WAV sound effects with sfx.play().' },
    { with: 'alda', packageName: '@joplo-app/plugin-alda', how: 'Underscore chapter transitions and walkthroughs with restrained procedural background music that auto-ducks under narration.' },
    { with: 'scene3d', packageName: '@joplo-app/plugin-3d', how: 'Embed interactive three.js 3D scenes driven by ui controls or chapter state for spatial and hardware demos.' },
  ],
  runtime:new URL(import.meta.url.endsWith('.ts') ? './runtime.tsx' : './runtime.js',import.meta.url), skill, skillTopics: { components: { description: 'Component props and author examples', body: componentGuide(COMPONENT_DOCS, COMPONENT_EXAMPLES) }, patterns: { description: 'UI recipes and individual pitfalls', body: patterns } }, components,
  compile:{
  // derive 对每个节点各调一次、只给它自己的子树；箭头都在 Board 里，所以从 Board 统一校验 from / to。
  derive(root,{report}){
    if(root.type !== 'ui:Board') return;
    const all=(n:PluginIRNode):PluginIRNode[]=>[n,...(n.children??[]).flatMap(all)];
    const nodes=all(root); const ids=new Set(nodes.map(n=>n.id));
    for(const n of nodes){
      if(n.type!=='ui:Arrow') continue;
      for(const key of ['from','to'] as const){
        const v=n.props?.[key];
        if(typeof v!=='string'||!v) report('ARROW_INVALID',`<Arrow> needs ${key}="<element id>"`,n.source);
        else if(!ids.has(v)) report('ARROW_TARGET_UNKNOWN',`<Arrow ${key}="${v}">: no element with id "${v}" on this Board; give the target element id="${v}"`,n.source);
      }
    }
  },
  node(n,{report}){
    if (n.type === 'ui:Compare') return compileCompare(n, report);
    if (n.type === 'ui:Image.Region' && !isRegionRect(n.props.rect)) {
      report('IMAGE_REGION_RECT', '<Image.Region> rect must be [x, y, width, height] inside the original image (0..1), with positive width and height', n.source);
    }
    if(n.type !== 'ui:Image') return;
    const {src,fit}=n.props;
    if(typeof src==='string'&&src&&!src.startsWith('data:image/') && !/^joplo-resource:resource-\d+$/.test(src)) report('IMAGE_PLACEHOLDER',`<ui:Image src="${src.length>60?`${src.slice(0,57)}...`:src}"> is drawn as a placeholder: only embedded images are shown. Put the file in the project and write src={asset('./photo.jpg')} (path relative to this file; import asset from @joplo-app/kit)`,n.source,'warning');
    if(fit!==undefined&&!(typeof fit==='string'&&['cover','contain','fill'].includes(fit))) report('INVALID_IMAGE_FIT',`<ui:Image> fit="${String(fit)}" is not supported (available: cover, contain, fill)`,n.source);
  }},
});

export * from './components.ts';
