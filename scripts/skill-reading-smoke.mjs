/** D89 acceptance: an author reads only installed skills, then combines three plugins. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import http from 'node:http';

/** 只读、只监听本机的最小静态服务器（与 joplo preview 同一规则：不出目录）。 */
function serveStatic(dir){
  const root=fs.realpathSync(dir);
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.gif':'image/gif','.woff2':'font/woff2','.mp3':'audio/mpeg','.glb':'model/gltf-binary','.mp4':'video/mp4','.webm':'video/webm'};
  const server=http.createServer((req,res)=>{
    let rel=decodeURIComponent(new URL(req.url??'/','http://x').pathname);if(rel.endsWith('/'))rel+='index.html';
    const file=path.resolve(root,'.'+rel);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
    res.writeHead(200,{'content-type':types[path.extname(file).toLowerCase()]??'application/octet-stream'});fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve({url:`http://127.0.0.1:${server.address().port}/`,close:()=>new Promise(r=>server.close(()=>r()))})));
}

export function writeSkillReadingDemo(project) {
  const requirements = {
    'joplo/SKILL.md': ['Required:', 'feedback watch'],
    'joplo/topics/authoring.md': ['flow', 'plugins', '.system'],
    'joplo/topics/demo.md': ['layer', 'hold'],
    'joplo-plugins/SKILL.md': ['ui', 'diagram', 'content', 'alda'],
    'joplo-plugin-ui/SKILL.md': ['@joplo-app/plugin-ui', 'config.plugins'],
    'joplo-plugin-ui/topics/components.md': ['Text', 'Stack'],
    'joplo-plugin-diagram/SKILL.md': ['@joplo-app/plugin-diagram', 'trace', 'Diagram.Group'],
    'joplo-plugin-content/SKILL.md': ['@joplo-app/plugin-content', 'Canvas', 'camera(', 'motion'],
  };
  const evidence=[];
  for(const [file,words] of Object.entries(requirements)) {
    const bytes=fs.readFileSync(path.join(project,'.claude/skills',file));
    for(const word of words)if(!bytes.toString().includes(word))throw Error(`Installed skill ${file} is missing ${word}`);
    evidence.push({file,sha256:createHash('sha256').update(bytes).digest('hex'),contracts:words});
  }
  // Same structure as the installed recipes: plugin markers are direct imports;
  // engine flow controls state; camera and trace remain plugin-owned effects.
  fs.mkdirSync(path.join(project,'features/reading/options'),{recursive:true});
  fs.writeFileSync(path.join(project,'features/reading/feature.ts'),`import {feature} from '@joplo-app/kit';
export default feature({name:'Skill reading',goal:'Explain one request with three enabled plugins',cases:{happy:'Observe the result'},pick:'a'});
`);
  const layer=path.join(project,'features/reading/world.tsx');
  fs.writeFileSync(layer,`import { $, layer } from '@joplo-app/kit';
import { Text } from '@joplo-app/plugin-ui';
import { Canvas } from '@joplo-app/plugin-content';
import { Diagram } from '@joplo-app/plugin-diagram';
export const world=layer('Request world',
  <Canvas w={1280} h={800}>
    <div id="cluster" motion="world" style={{position:'absolute',left:80,top:140,width:1120,height:480}}>
      <Text id="explain" size="xl">{$.ui.message}</Text>
      <Diagram id="request" direction="right" h={400}>
        <Diagram.Group id="client_domain" label="Client"><Diagram.Node id="client" label="Request" /></Diagram.Group>
        <Diagram.Group id="service_domain" label="Service"><Diagram.Node id="service" label="Response" /></Diagram.Group>
        <Diagram.Edge id="call" from="client" to="service" label="send" />
      </Diagram>
    </div>
  </Canvas>);
`);
  const file=path.join(project,'features/reading/options/a.tsx');
  fs.writeFileSync(file,`import { world } from '../world';
import { trace } from '@joplo-app/plugin-diagram';
import { camera } from '@joplo-app/plugin-content';
import { $, option, flow, set, shot } from '@joplo-app/kit';
export default option({name:'Request',idea:'Follow the same request from start to result',
  state:{ui:{message:'Request ready'}},layers:{world},
  scenarios:{inspect:flow('Installed skills example',{cases:['happy'],start:'/',layer:'world'})
    .system('Call service',trace('client','service'),shot(),camera('cluster'),set($.ui.message,'Request sent'))
    .system('Show result',shot(),camera(),set($.ui.message,'Response received'))}
});
`);
  fs.mkdirSync(path.join(project,'.joplo'),{recursive:true});
  fs.writeFileSync(path.join(project,'.joplo/skill-reading-evidence.json'),JSON.stringify({skillsRead:evidence,authored:['features/reading/feature.ts','features/reading/world.tsx','features/reading/options/a.tsx'],scenario:'reading.a.inspect'},null,2));
}

/** Playwright is a test driver from the workspace, never installed into the authored project. */
export async function verifySkillReadingBrowser(repo, project, boardUrl) {
  const require=createRequire(path.join(repo,'packages/server/package.json'));
  const driver=await import(pathToFileURL(require.resolve('playwright')).href);
  const {chromium}=driver.chromium?driver:driver.default;
  let browser;
  try{browser=await chromium.launch({headless:true});}
  catch{browser=await chromium.launch({headless:true,channel:'chrome'});}
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(boardUrl);
    await page.waitForSelector('[data-joplo-stage]');
    await page.waitForSelector('[data-jid="start"]',{state:'attached'});
    if(await page.locator('[data-jplugin][data-dashed]').count())throw Error('Dev plugin runtime is not ready');
    await context.close();
    // D98：构建产物的素材是独立文件，只保证通过 HTTP 打开；用本机静态服务器打开，除了它不许有任何网络请求
    const site=await serveStatic(path.join(project,'dist'));
    const offline=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    await offline.route(u=>/^https?:/.test(u.href)&&!u.href.startsWith(site.url),r=>r.abort());
    const viewer=await offline.newPage(),network=[];viewer.setDefaultTimeout(15000);
    viewer.on('pageerror',e=>errors.push(e.message));
    viewer.on('requestfailed',r=>errors.push(r.url()));
    viewer.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(site.url))network.push(r.url());});
    await viewer.goto(site.url+'index.html#/f/reading?s=reading.a.inspect&step=1');
    await viewer.waitForSelector('[data-jcanvas-world]');
    await viewer.waitForSelector('[data-jid="request"] [data-jid="client"]');
    await viewer.waitForFunction(()=>document.querySelector('[data-jid="explain"]')?.textContent==='Request sent');
    await viewer.keyboard.press('ArrowRight');
    await viewer.waitForFunction(()=>document.querySelector('[data-jid="explain"]')?.textContent==='Response received');
    const bounds=await viewer.locator('[data-jid="explain"]').boundingBox();
    if(!bounds||bounds.x<0||bounds.y<0||bounds.x+bounds.width>1440||bounds.y+bounds.height>1000)throw Error('UI explanation is outside the visible viewport');
    await viewer.screenshot({path:path.join(project,'.joplo/skill-reading-offline.png')});
    await viewer.keyboard.press('ArrowLeft');
    await viewer.waitForFunction(()=>document.querySelector('[data-jid="explain"]')?.textContent==='Request sent');
    if(errors.length||network.length)throw Error(`Browser acceptance failed: ${JSON.stringify({errors,network})}`);
    const file=path.join(project,'.joplo/skill-reading-evidence.json');
    fs.writeFileSync(file,JSON.stringify({...JSON.parse(fs.readFileSync(file,'utf8')),browser:{dev:true,builtSite:'http',steps:[1,2,1],errors,network}},null,2));
    await offline.close();await site.close();
  } finally {await browser.close();}
}
