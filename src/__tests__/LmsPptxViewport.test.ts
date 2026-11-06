// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observePptxSlideLayout } from '@/react-app/pages/lms/pptxViewport';

describe('PPTX learner slide viewport lifecycle', () => {
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrameId = 0;

  function flushFrame() {
    const queued = [...frames.values()];
    frames.clear();
    for (const callback of queued) callback(0);
  }

  beforeEach(() => {
    frames.clear();
    nextFrameId = 0;
    vi.stubGlobal('ResizeObserver', undefined);
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      const id = ++nextFrameId;
      frames.set(id, callback);
      return id;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => {
      frames.delete(id);
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('measures without ResizeObserver, tracks window resize and cleans up', () => {
    const measure = vi.fn();
    const stop = observePptxSlideLayout(measure, [document.createElement('div')]);

    flushFrame();
    expect(measure).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('resize'));
    flushFrame();
    expect(measure).toHaveBeenCalledTimes(2);

    stop();
    window.dispatchEvent(new Event('resize'));
    flushFrame();
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it('uses a native observer and disconnects after leaving the slide', () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    let notify: (() => void) | undefined;
    class NativeObserver {
      constructor(callback: ResizeObserverCallback) {
        notify = () => callback([], this as unknown as ResizeObserver);
      }
      observe = observe;
      disconnect = disconnect;
    }
    vi.stubGlobal('ResizeObserver', NativeObserver);

    const element = document.createElement('div');
    const measure = vi.fn();
    const stop = observePptxSlideLayout(measure, [element, null]);
    expect(observe).toHaveBeenCalledExactlyOnceWith(element);
    flushFrame();

    notify?.();
    flushFrame();
    expect(measure).toHaveBeenCalledTimes(2);

    stop();
    expect(disconnect).toHaveBeenCalledTimes(1);
    notify?.();
    flushFrame();
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it('recovers when an installed ResizeObserver implementation throws', () => {
    class BrokenObserver {
      constructor() {
        throw new Error('ResizeObserver unavailable');
      }
    }
    vi.stubGlobal('ResizeObserver', BrokenObserver);

    const measure = vi.fn();
    expect(() => {
      const stop = observePptxSlideLayout(measure, [document.createElement('div')]);
      flushFrame();
      window.dispatchEvent(new Event('resize'));
      flushFrame();
      expect(measure).toHaveBeenCalledTimes(2);
      stop();
    }).not.toThrow();
  });

  it('cancels an initial pending measurement when the player unmounts', () => {
    const measure = vi.fn();
    const stop = observePptxSlideLayout(measure, []);
    stop();
    flushFrame();
    expect(measure).not.toHaveBeenCalled();
  });
});
