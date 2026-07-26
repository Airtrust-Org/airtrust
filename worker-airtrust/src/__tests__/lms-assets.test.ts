import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MOBILE_DRAWER_HELPER_JS } from '../lib/scorm/mobile-drawer-helper';

describe('LMS Assets - SCORM Mobile Fixes', () => {
  let doc: any;
  let windowMock: any;
  let postToParentCalls: any[] = [];
  let addedStyles: any[] = [];
  let disconnectSpy = vi.fn();
  let observerSpy = vi.fn();
  let mutationCb: any = null;

  beforeEach(() => {
    postToParentCalls = [];
    addedStyles = [];
    disconnectSpy.mockClear();
    observerSpy.mockClear();
    mutationCb = null;

    doc = {
      createElement: vi.fn((tag) => {
        const el: any = { 
          tag, 
          classList: { 
            classes: new Set(), 
            add: (c: string) => el.classList.classes.add(c), 
            remove: (c: string) => el.classList.classes.delete(c), 
            contains: (c: string) => el.classList.classes.has(c) 
          }, 
          addEventListener: vi.fn(), 
          setAttribute: vi.fn() 
        };
        return el;
      }),
      head: { appendChild: vi.fn((el: any) => addedStyles.push(el)) },
      body: { 
        appendChild: vi.fn(), 
        classList: { 
          classes: new Set(), 
          add: function(c: string) { this.classes.add(c); }, 
          remove: function(c: string) { this.classes.delete(c); }, 
          contains: function(c: string) { return this.classes.has(c); } 
        }
      },
      querySelector: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    windowMock = {
      setTimeout: vi.fn((fn) => fn()),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    (global as any).MutationObserver = class {
      observe = observerSpy;
      disconnect = disconnectSpy;
      constructor(cb: any) {
        mutationCb = cb;
      }
    } as any;
  });

  afterEach(() => {
    delete (global as any).MutationObserver;
  });

  it('behaves correctly: opens drawer, closes on X or backdrop or Escape, cleans up', () => {
    const postToParent = (msg: any) => postToParentCalls.push(msg);
    const MATRICULA_ID = 123;
    
    const setupFn = new Function('doc', 'window', 'postToParent', 'MATRICULA_ID', MOBILE_DRAWER_HELPER_JS + '; return injectDrawerFix;');
    const injectDrawerFix = setupFn(doc, windowMock, postToParent, MATRICULA_ID);
    
    injectDrawerFix();
    
    expect(doc.createElement).toHaveBeenCalledWith('style');
    expect(doc.createElement).toHaveBeenCalledWith('div');
    expect(doc.createElement).toHaveBeenCalledWith('button');
    
    const backdrop = doc.body.appendChild.mock.calls[0][0];
    const closeBtn = doc.body.appendChild.mock.calls[1][0];

    expect(observerSpy).toHaveBeenCalled();
    
    // Simulate drawer opening
    doc.querySelector.mockReturnValue({});
    mutationCb();
    
    expect(doc.body.classList.contains('airtrust-drawer-open')).toBe(true);
    expect(postToParentCalls).toContainEqual({ type: 'lms:drawer-opened', matriculaId: 123 });
    
    // Simulate drawer closing via button
    doc.querySelector.mockReturnValue(null);
    const closeDrawerHandler = closeBtn.addEventListener.mock.calls.find((c: any) => c[0] === 'click')[1];
    closeDrawerHandler();
    expect(doc.body.classList.contains('airtrust-drawer-open')).toBe(false);
    expect(postToParentCalls).toContainEqual({ type: 'lms:drawer-closed', matriculaId: 123 });

    // Simulate drawer opening again
    doc.querySelector.mockReturnValue({});
    mutationCb();
    
    // Simulate drawer closing via Escape
    doc.querySelector.mockReturnValue(null);
    const keydownHandler = doc.addEventListener.mock.calls.find((c: any) => c[0] === 'keydown')[1];
    keydownHandler({ key: 'Escape' });
    expect(doc.body.classList.contains('airtrust-drawer-open')).toBe(false);

    // Unload cleanup
    const unloadHandler = windowMock.addEventListener.mock.calls.find((c: any) => c[0] === 'unload')[1];
    unloadHandler();
    expect(disconnectSpy).toHaveBeenCalled();
  });
});
