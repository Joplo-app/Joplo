import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { EngineClock } from '../src/runtime/clock';
import { engineDriver } from '../src/renderer/engine-motion';
import { bindEngineAnimations } from '../src/renderer/engine-animations';

describe('D88 animation adapters share one engine clock', () => {
  it('Motion and CSS/WAAPI sample identical frozen and resumed times', () => {
    const clock = new EngineClock();
    const update = vi.fn(); const driver = engineDriver(clock)(update); driver.start();
    const animation = { pause:vi.fn(), finish:vi.fn(), currentTime:0, effect:{getComputedTiming:()=>({endTime:1000})} };
    const root = { getAnimations:()=>[animation], querySelectorAll:()=>[], addEventListener:vi.fn(), removeEventListener:vi.fn() } as unknown as HTMLElement;
    const cleanup = bindEngineAnimations(root,clock);
    clock.update(0,{running:true,speed:1}); clock.update(250,{running:false,speed:1});
    expect(animation.currentTime).toBe(250); expect(update).toHaveBeenLastCalledWith(250);
    clock.update(10000,{running:false,speed:1}); expect(animation.currentTime).toBe(250); expect(driver.now()).toBe(250);
    clock.update(11000,{running:true,speed:2}); clock.update(11250,{running:true,speed:2});
    expect(animation.currentTime).toBe(750); expect(update).toHaveBeenLastCalledWith(750);
    clock.update(11500,{running:true,speed:2}); expect(animation.finish).toHaveBeenCalledOnce();
    driver.stop(); cleanup();
  });
  it('first-party plugin runtimes cannot start independent animation clocks', () => {
    for (const [name,ext] of [['ui','tsx'],['diagram','tsx'],['content','tsx'],['scene3d','ts'],['alda','ts']]) {
      const source=readFileSync(`plugins/${name}/src/runtime.${ext}`,'utf8');
      expect(source, name).not.toMatch(/\b(?:requestAnimationFrame|setInterval|setTimeout)\s*\(|\bperformance\.now\s*\(/);
    }
    const demo=readFileSync('packages/web/src/runtime/demo.ts','utf8');
    expect(demo).not.toMatch(/from ['"]motion/);
    expect(readFileSync('plugins/scene3d/src/runtime.ts','utf8')).toContain('ctx.frame.gesture');
  });
});
