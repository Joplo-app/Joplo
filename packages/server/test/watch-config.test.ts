import {expect,it} from 'vitest';
import {watchConfigDiagnostics} from '../src/watch-config.ts';
import {isProjectSource} from '../src/vite-shared.ts';
it('validates watch config without involving the playback compiler',()=>{
 for(const ignore of [['../assets'],['/tmp'],['exports/**'],['.'],['joplo.config.ts'],[42]])
  expect(watchConfigDiagnostics({ignore})).toMatchObject([{code:'WATCH_CONFIG_INVALID',severity:'error'}]);
 expect(watchConfigDiagnostics({ignore:['exports/frames','.coord']})).toEqual([]);
 expect(isProjectSource('/project','/project/exports/frames/01.jpg',['exports/frames'])).toBe(false);
 expect(isProjectSource('/project','/project/exports/frames-other/01.jpg',['exports/frames'])).toBe(true);
 expect(isProjectSource('/project','/project/assets/01.jpg',['exports/frames'])).toBe(true);
});
