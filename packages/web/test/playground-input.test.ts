import { describe, expect, it } from 'vitest';
import { EngineClock, gestureProgress, gesturePoint } from '../src/runtime/clock';
import { inputOwner, editableTarget, hoverAction } from '../src/runtime/input';

describe('D88 one logical clock', () => {
  it('freezes cursor, gesture and plugin progress at exactly the same time, resumes and scales together', () => {
    const c = new EngineClock();
    c.update(100, { running: true, speed: 1 });
    c.update(300, { running: false, speed: 1 });
    expect(c.time).toBe(200);
    expect(gesturePoint({ x: 0, y: 10 }, { x: 100, y: 50 }, gestureProgress(c.time, 0, 1000))).toEqual({ x: 20, y: 18 });
    c.update(5000, { running: false, speed: 1 }); expect(c.time).toBe(200);
    c.update(6000, { running: true, speed: 2 }); expect(c.time).toBe(200);
    c.update(6200, { running: true, speed: 2 }); expect(c.time).toBe(600);
    c.update(6100, { running: true, speed: 2 }); expect(c.time).toBe(600);
  });
  it('clamps gesture progress and handles zero duration without NaN', () => {
    expect(gestureProgress(40, 100, 500)).toBe(0);
    expect(gestureProgress(700, 100, 500)).toBe(1);
    expect(gestureProgress(100, 100, 0)).toBe(1);
  });
});

describe('D88 one input arbiter', () => {
  it('assigns draggable elements before plugin view or stage pan; editing never pans', () => {
    expect(inputOwner({ draggable: true, plugin: true, editable: false })).toBe('drag');
    expect(inputOwner({ draggable: false, plugin: true, editable: false })).toBe('plugin');
    expect(inputOwner({ draggable: false, plugin: false, editable: false })).toBe('pan');
    expect(inputOwner({ draggable: true, plugin: false, editable: true })).toBe('edit');
  });
  it('preserves editable key ownership and degrades hover to touch activation', () => {
    expect(editableTarget({ tagName: 'INPUT', isContentEditable: false })).toBe(true);
    expect(editableTarget({ tagName: 'TEXTAREA', isContentEditable: false })).toBe(true);
    expect(editableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(editableTarget({ tagName: 'BUTTON', isContentEditable: false })).toBe(false);
    expect(hoverAction('node', 0, 500, 'touch')).toEqual({ type: 'hover', target: 'node', ms: 500 });
    expect(hoverAction('node', 499, 500, 'mouse')).toBeNull();
    expect(hoverAction('node', 500, 500, 'mouse')).toEqual({ type: 'hover', target: 'node', ms: 500 });
  });
});
