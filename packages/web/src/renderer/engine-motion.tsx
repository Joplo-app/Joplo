/** Motion is a drawing adapter here. Its driver samples the engine, never the browser's time. */
import { createContext, createElement, forwardRef, useContext, useMemo, type ComponentType } from 'react';
import { motion as browserMotion } from 'motion/react';
import type { ClockSource } from '../runtime/clock';
export const EngineClockContext = createContext<ClockSource | undefined>(undefined);

export function engineDriver(clock: ClockSource) {
  return (update: (time: number) => void) => {
    let unsubscribe: (() => void) | undefined;
    return {
      start: () => { if (!unsubscribe) unsubscribe = clock.subscribe(() => update(clock.getSnapshot().timeMs)); },
      stop: () => { unsubscribe?.(); unsubscribe = undefined; },
      now: () => clock.getSnapshot().timeMs,
    };
  };
}
export function engineTransition(transition: Record<string, any> | undefined, clock: ClockSource): Record<string, any> {
  const driver = engineDriver(clock);
  const result: Record<string, any> = { ...transition, driver, startTime: clock.getSnapshot().timeMs };
  for (const [key, value] of Object.entries(transition ?? {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) result[key] = { ...value, driver, startTime: clock.getSnapshot().timeMs };
  }
  return result;
}
const components = new Map<string, ComponentType<any>>();
const noop = () => {};
/** Same Motion vocabulary for host and React plugins, with the host's per-stage clock. */
export const motion = new Proxy({} as typeof browserMotion, {
  get(_target, tag: string) {
    let component = components.get(tag);
    if (!component) {
      const Base = (browserMotion as unknown as Record<string, ComponentType<any>>)[tag]!;
      component = forwardRef<HTMLElement, Record<string, any>>((props, ref) => {
        const clock = useContext(EngineClockContext);
        const running = clock?.getSnapshot().running ?? true;
        const transition = useMemo(() => clock ? engineTransition({ ...props.transition, ...(!running ? {skipAnimations:true} : {}) }, clock) : props.transition, [props.transition, clock, running]);
        const adapt = (value: any) => clock && value && typeof value === 'object' && value.transition ? { ...value, transition: engineTransition(value.transition, clock) } : value;
        // onUpdate disables the native Motion acceleration path (which has its own clock).
        return createElement(Base, { ...props, ref, transition, ...(clock ? { initial: !running ? false : props.initial, onUpdate: props.onUpdate ?? noop, animate: adapt(props.animate), exit: adapt(props.exit) } : {}) });
      });
      components.set(tag, component);
    }
    return component;
  },
});
