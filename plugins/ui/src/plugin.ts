import packageInfo from './version.json' with { type: 'json' };
import { skill } from './guide.ts';
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
  ...(textPaths[name] ? {textPaths:textPaths[name]} : {}),
  text: ['aria-label', ...(display[name] ?? []), ...(VALUE_TYPES.has(name) ? fieldText : []), ...(['Select','MultiSelect','SegmentedControl','TabBar'].includes(name) ? ['data'] : [])],
  ...(name === 'Indicator' ? {disabledPresentation:true} : {}),
  ...(['Card','Paper','Modal','Drawer','Alert','Notification','Email','DataCard','StateFlow','Artifact','Terminal','ChatMessage','Table','DataTable','Accordion.Item','Tabs.Panel','AppShell.Navbar','AppShell.Aside','AppShell.Header','AppShell.Footer'].includes(name) ? {frame:true} : {}),
  ...(VALUE_TYPES.has(name) ? { input: name === 'MultiSelect' ? 'multiple' : 'single' } as const : {}),
  ...(GATED_CONTAINERS.has(name) ? { gate: ['opened','open'], selfEvident: true } : {}),
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
export default definePlugin({
  id:'ui', title:'Standard UI', version:packageInfo.version, runtime:new URL(import.meta.url.endsWith('.ts') ? './runtime.tsx' : './runtime.js',import.meta.url), skill, components,
  legacyTypes:Object.fromEntries(COMPONENT_TYPES.filter(name=>!HTML_TAGS.includes(name)).map(name=>[name,`ui:${name}`])),
  compile:{node(n,{report}){
    if(n.type !== 'ui:Image') return;
    const {src,fit}=n.props;
    if(typeof src==='string'&&src&&!src.startsWith('data:image/')) report('IMAGE_PLACEHOLDER',`<ui:Image src="${src.length>60?`${src.slice(0,57)}...`:src}"> is drawn as a placeholder: only embedded images are shown. Put the file in the project and write src={asset('./photo.jpg')} (path relative to this file; import asset from @joplo-app/kit)`,n.source,'warning');
    if(fit!==undefined&&!(typeof fit==='string'&&['cover','contain'].includes(fit))) report('INVALID_IMAGE_FIT',`<ui:Image> fit="${String(fit)}" is not supported (available: cover, contain)`,n.source);
  }},
});
