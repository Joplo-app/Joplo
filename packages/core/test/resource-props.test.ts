import { expect, it } from 'vitest';
import { PluginCompiler } from '../src/plugins/compiler.ts';
import { localResource, definePlugin, type ResourceRequest } from '@joplo-app/kit/plugin';
import { NODE, BIND } from '@joplo-app/kit/node';
it('strips author resource input and keeps state bindings, coalescing identical refs', () => {
  const requests:ResourceRequest[]=[], errors:unknown[]=[];
  const p=definePlugin({id:'test',title:'Test',runtime:'/runtime',local:'/local',components:{}});
  const compiler=new PluginCompiler([p],(...args)=>errors.push(args),undefined,{onResource:r=>requests.push(r)});
  const input=localResource('test','glb','private description');
  const node=compiler.node({[NODE]:true,type:'other:Model',props:{src:input,another:input,lit:{[BIND]:'data.on'}},children:[]},new Map());
  expect(node.props.src).toBe('joplo-resource:resource-0'); expect(requests).toHaveLength(1); expect(errors).toEqual([]);
  expect(JSON.stringify(node)).not.toContain('private description'); expect((node.props.lit as any)[BIND]).toBe('data.on');
});
it('diagnoses a missing resource plugin without exposing its input', () => {
  const errors:unknown[]=[]; const compiler=new PluginCompiler([], (...args)=>errors.push(args));
  const node=compiler.node({[NODE]:true,type:'scene3d:Model',props:{src:localResource('missing','glb','private')},children:[]},new Map());
  expect(node.props.src).toBe(''); expect(JSON.stringify(errors)).toContain('LOCAL_RESOURCE_INVALID'); expect(JSON.stringify(errors)).not.toContain('private');
});
