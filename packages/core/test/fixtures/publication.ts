import { z } from 'zod';
import { $, chapter, config, narrate, page, set, Slot, work } from '@joplo-app/kit';
import ui, { Stack, Text } from '@joplo-app/plugin-ui';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { definePlugin } from '@joplo-app/kit/plugin';
import type { AuthoringProject } from '../../src/index.ts';
export const PRIVATE = ['privwork729', 'PRIVATE_TEXT_729', 'PRIVATE_TITLE_729', 'PRIVATE_SUMMARY_729', 'PRIVATE_TRANS_729', 'private_node729', '/private-page729'];
export function publicationSource(kind: 'stage' | 'on' | 'routes' | 'translated' = 'on'): AuthoringProject {
  const probe = definePlugin({id:'probe',title:'Probe',runtime:'/probe.js',components:{},schemas:{step:z.object({snapshot:z.string()})},data:{step:{scope:'global'}},compile:{frame:ctx=>({snapshot:JSON.stringify(ctx.roots)})}});
  const picture = jsx(Text,{id:'private_node729',children:'PRIVATE_TEXT_729'});
  const shared = jsx(Stack,{id:'public_shell',children:jsx(Slot,{name:'body'})});
  const draft = work({title:'PRIVATE_TITLE_729',summary:'PRIVATE_SUMMARY_729',draft:true,
    ...(kind==='stage'?{stage:picture}:kind==='routes'?{routes:{'/private-page729':page({title:'PRIVATE_TITLE_729',layout:false},picture)}}:{on:{'/':{body:picture}}}),
    scenarios:{one:chapter('PRIVATE_TITLE_729').system('PRIVATE_TEXT_729',narrate('PRIVATE_TEXT_729'),set($.ui.private,'PRIVATE_TEXT_729'))},
  });
  return {root:'/p',config:{...config({name:'Portfolio',plugins:[ui,probe],...(kind==='translated'?{locales:['en','ja']}: {})}),file:'joplo.config.ts'},layouts:{},features:{},
    routes:{'/':{...page({title:'Public home',layout:false},shared),file:'routes/page.tsx'}},
    works:{live:{...work({title:'Live',summary:'Public summary',on:{'/':{body:jsx(Text,{id:'public_node',children:'PUBLIC_TEXT'})}},scenarios:{one:chapter('Public chapter').system('Public event',narrate('PUBLIC_TEXT'))}}),file:'works/live.tsx'},privwork729:{...draft,file:'works/privwork729.tsx'}},
    ...(kind==='translated'?{locales:{ja:{PRIVATE_TEXT_729:'PRIVATE_TRANS_729',PRIVATE_TITLE_729:'PRIVATE_TRANS_729'}},localeFiles:{ja:'locales/ja.json'}}: {}),
  };
}
