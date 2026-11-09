import packageInfo from './version.json' with { type: 'json' };
import { skill, patterns, componentGuide } from './guide.ts';
import { definePlugin, type ElementTraits, type PluginComponentSpec } from '@joplo-app/kit/plugin';
import { COMPONENT_TYPES, COMPONENT_DOCS, COMPONENT_EXAMPLES, INTERACTIVE_TYPES, VALUE_TYPES, GATED_CONTAINERS, HTML_TAGS } from './catalog.ts';

// The UI family owns its vocabulary and display semantics, including HTML fallbacks.
const display: Record<string,string[]> = {
  Divider:['label'], Blockquote:['cite'], Avatar:['name'], Image:['alt'], Indicator:['label'],
  'Timeline.Item':['title'], Table:['data'], DataTable:['records','noRecordsText'],
  Radio:['label'], 'Radio.Card':['label','description','leftSection'], 'Radio.Group':['label','description','value','error'],
  'Stepper.Step':['label','description'], Alert:['title'], Notification:['title'], Modal:['title'], Drawer:['title'],
  RingProgress:['label'], ChatMessage:['name'], ToolCall:['title'], Thinking:['title','duration'],
  Artifact:['title'], 'Artifact.Ref':['title'], Email:['from','to','subject','time'], DataCard:['title','value'], StateFlow:['labels'],
  Terminal:['title'], 'Terminal.Input':['prompt','placeholder','value'], Placeholder:['label'],
  EmptyState:['title','description'], ListRow:['title','description','avatar'], Stat:['label','value','diff','description'],
  KeyValue:['items'], BarChart:['data','unit'], LineChart:['data','unit'],
  NavLink:['label','description','leftSection','rightSection'], Button:['leftSection','rightSection'],
  'Menu.Item':['leftSection','rightSection'], 'Tabs.Tab':['leftSection','rightSection'],
};
const textPaths: Record<string,string[][]> = {DataTable:[['columns','*','title']],DataCard:[['fields','*','label']],BarChart:[['series','*','label']],LineChart:[['series','*','label']]};
const fieldText = ['label','description','placeholder','error','value'];
const traits = (name: string): ElementTraits => ({
  ...(INTERACTIVE_TYPES.has(name) ? {hover:true} : {}),
  ...(name === 'Tabs.Panel' ? {selectionGate:{owner:'ui:Tabs',value:'value',fallbackFirst:true}} : {}),
  ...(name === 'Accordion.Panel' ? {selectionGate:{owner:'ui:Accordion',item:'ui:Accordion.Item',value:'value'}} : {}),
  ...(['TextInput', 'Textarea', 'PasswordInput', 'NumberInput', 'Autocomplete', 'PromptInput'].includes(name) ? {native:{action:'type',prop:'value'}} as const : {}),
  ...(['Switch', 'Checkbox', 'Radio'].includes(name) ? {native:{action:'toggle',prop:'checked'}} as const : {}),
  ...(['Tabs', 'Accordion', 'Radio.Group', 'Select', 'MultiSelect', 'SegmentedControl'].includes(name) ? {native:{action:'select',prop:'value',...(name === 'Accordion' ? {deselect:true} : {})}} as const : {}),
  ...(textPaths[name] ? {textPaths:textPaths[name]} : {}),
  text: ['aria-label', ...(display[name] ?? []), ...(VALUE_TYPES.has(name) ? fieldText : []), ...(['Select','MultiSelect','SegmentedControl','TabBar'].includes(name) ? ['data'] : [])],
  ...(name === 'Indicator' ? {disabledPresentation:true} : {}),
  ...(['Card','Paper','Modal','Drawer','Alert','Notification','Email','DataCard','StateFlow','Artifact','Terminal','ChatMessage','Table','DataTable','Accordion.Item','Tabs.Panel','AppShell.Navbar','AppShell.Aside','AppShell.Header','AppShell.Footer'].includes(name) ? {frame:true} : {}),
  ...(VALUE_TYPES.has(name) ? { input: name === 'MultiSelect' ? 'multiple' : 'single' } as const : {}),
  ...(GATED_CONTAINERS.has(name) ? { gate: ['opened'], selfEvident: true } : {}),
  ...(['DataCard','StateFlow'].includes(name) ? {selfEvident:true} : {}),
  ...(name === 'Checkbox' ? {toggleCaption:'check'} as const : {}),
  ...(['Select','MultiSelect','SegmentedControl','TabBar'].includes(name) ? {choices:{prop:'data'}} : {}),
  ...(name === 'Radio.Group' ? {choices:{descendants:['ui:Radio','ui:Radio.Card']}} : {}),
  ...(name === 'Tabs' ? {choices:{descendants:['ui:Tabs.Tab']}} : {}),
  ...(name === 'Accordion' ? {choices:{descendants:['ui:Accordion.Item'],labelChild:'ui:Accordion.Control'}} : {}),
  ...(name === 'Pagination' ? {choices:{range:'total'}} : {}),
  ...(name === 'AppShell' ? {layout:{header:{size:'height',defaultSize:60},footer:{size:'height',defaultSize:60},navbar:{size:'width',defaultSize:260,breakpoint:true},aside:{size:'width',defaultSize:300,breakpoint:true}}} : {}),
  ...(name === 'AppShell.Navbar' ? {region:'navbar'} : {}),
  ...(name === 'AppShell.Aside' ? {region:'aside'} : {}),
  ...(name === 'Phone' ? {childWidth:{value:390,when:{prop:'landscape',value:true,width:772}}} : {}),
});
export const components: Record<string, PluginComponentSpec> = Object.fromEntries(COMPONENT_TYPES.map(name=>[name,{
  doc: COMPONENT_DOCS[name],
  ...(COMPONENT_EXAMPLES[name] ? {example:COMPONENT_EXAMPLES[name]} : {}),
  ...(HTML_TAGS.includes(name) ? {intrinsic:name} : {}),
  ...(INTERACTIVE_TYPES.has(name) ? {interactive:true} : {}),
  traits: traits(name),
  ...(name==='Menu' ? {inherit:[{target:'ui:Menu.Dropdown',props:['opened']}]} : {}),
}]));
export default definePlugin({ packageName: '@joplo-app/plugin-ui',
  id:'ui', title:'Standard UI', version:packageInfo.version, runtime:new URL(import.meta.url.endsWith('.ts') ? './runtime.tsx' : './runtime.js',import.meta.url), skill, skillTopics: { components: { description: 'Component props and author examples', body: componentGuide(COMPONENT_DOCS, COMPONENT_EXAMPLES) }, patterns: { description: 'UI recipes and individual pitfalls', body: patterns } }, components,
  compile:{node(n,{report}){
    if(n.type !== 'ui:Image') return;
    const {src,fit}=n.props;
    if(typeof src==='string'&&src&&!src.startsWith('data:image/')) report('IMAGE_PLACEHOLDER',`<ui:Image src="${src.length>60?`${src.slice(0,57)}...`:src}"> is drawn as a placeholder: only embedded images are shown. Put the file in the project and write src={asset('./photo.jpg')} (path relative to this file; import asset from @joplo-app/kit)`,n.source,'warning');
    if(fit!==undefined&&!(typeof fit==='string'&&['cover','contain'].includes(fit))) report('INVALID_IMAGE_FIT',`<ui:Image> fit="${String(fit)}" is not supported (available: cover, contain)`,n.source);
  }},
});

export * from './components.ts';
