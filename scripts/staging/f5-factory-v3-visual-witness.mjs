/**
 * Read-only visual resume witness for the immutable AirTrust Factory V3 engine.
 *
 * Unlike Score R4, Factory V3 draws #count, #viewport .screen.active and
 * #drawerList .drawer-item.selected, and writes suspend_data v4 with cursor a.
 * This is NOT a certification or permission to activate a course. Use only
 * with independently authenticated Worker/D1 readback and exact package scope.
 */

/** Browser function: run INSIDE the actual SCO iframe, never its wrapper. */
export function captureFactoryV3VisualState() {
  const data = window.COURSE_DATA;
  const slides = Array.isArray(data?.slides) ? data.slides : null;
  const text = document.querySelector('#count')?.textContent?.trim() ?? '';
  const match = /^([1-9]\d*)\s*\/\s*([1-9]\d*)$/.exec(text);
  const index = match ? Number(match[1]) - 1 : null;
  const total = match ? Number(match[2]) : null;
  const screens = [...document.querySelectorAll('#viewport .screen.active')];
  const screen = screens.length === 1 ? screens[0] : null;
  const navigation = [...document.querySelectorAll('#drawerList button.drawer-item')];
  const selected = navigation.filter(button => button.classList.contains('selected'));
  const navIndex = selected.length === 1 && navigation.length === slides?.length
    ? navigation.indexOf(selected[0]) : null;
  const slide = slides && Number.isSafeInteger(index) ? slides[index] : null;
  const bounds = screen?.getBoundingClientRect();
  return {
    contract: 'F5_FACTORY_V3_RENDERED_DOM_V1',
    index, total, navIndex, modelLength: slides?.length ?? null,
    packageVersion: typeof data?.packageVersion === 'string' ? data.packageVersion : null,
    unitId: typeof slide?.id === 'string' ? slide.id : null,
    stageVisible: Boolean(bounds && bounds.width > 0 && bounds.height > 0),
    unitMatchesModel: Boolean(screen && typeof slide?.id === 'string' &&
      screen.getAttribute('data-unit') === slide.id),
    titleMatchesModel: Boolean(typeof slide?.title === 'string' &&
      slide.title.trim().length > 0 &&
      screen?.querySelector('h1')?.textContent?.trim() === slide.title.trim()),
    interactionRequired: Boolean(slide?.kind === 'scenario' ||
      slide?.family === 'video' ||
      (Array.isArray(slide?.gateItems) && slide.gateItems.length > 0)),
  };
}

const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);

/** Validate BOTH the visible slide and the independent persisted v4 CMI. */
export function requireFactoryV3VisualState(visual, location, suspend, {
  expectedPackageVersion = null, previousIndex = null,
  previousLocation = null, previousSuspend = null,
} = {}) {
  let state;
  try { state = JSON.parse(suspend); } catch { throw Error('F5_FACTORY_V3_VISUAL_CMI_INVALID'); }
  const valid = visual?.contract === 'F5_FACTORY_V3_RENDERED_DOM_V1' &&
    Number.isSafeInteger(visual.index) && visual.index >= 0 &&
    Number.isSafeInteger(visual.total) && visual.total > 1 &&
    visual.index < visual.total && visual.modelLength === visual.total &&
    visual.navIndex === visual.index && visual.stageVisible === true &&
    visual.unitMatchesModel === true && visual.titleMatchesModel === true &&
    typeof visual.unitId === 'string' && visual.unitId.length > 0 &&
    typeof visual.packageVersion === 'string' && visual.packageVersion.length > 0 &&
    (expectedPackageVersion === null || visual.packageVersion === expectedPackageVersion) &&
    location === String(visual.index + 1) + '/' + String(visual.total) &&
    record(state) && state.v === 4 && state.p === visual.packageVersion &&
    Number.isSafeInteger(state.a) && state.a === visual.index &&
    Array.isArray(state.d) &&
    state.d.every(x => Number.isSafeInteger(x) && x >= 0 && x < visual.total) &&
    record(state.s) && Array.isArray(state.g) && record(state.h) &&
    record(state.vs) && record(state.q) && typeof state.c === 'boolean' &&
    (previousIndex === null ||
      (Number.isSafeInteger(previousIndex) && visual.index === previousIndex + 1 &&
       location !== previousLocation && suspend !== previousSuspend));
  if (!valid) throw Error('F5_FACTORY_V3_VISUAL_CMI_INVALID');
  return { index: visual.index, total: visual.total,
    unitId: visual.unitId, packageVersion: visual.packageVersion };
}

/** Fresh-context resume must be the exact same authored slide, not a preview. */
export function requireFactoryV3ResumeMatch(before, after) {
  if (!before || !after || !Number.isSafeInteger(before.index) || before.index < 1 ||
      before.index !== after.index || before.total !== after.total ||
      before.unitId !== after.unitId || !before.unitId ||
      before.packageVersion !== after.packageVersion || !before.packageVersion) {
    throw Error('F5_FACTORY_V3_RESUME_MISMATCH');
  }
  return true;
}

export function chooseFactoryV3Navigation({
  nextVisible, nextEnabled, prevEnabled, initialRendered,
} = {}) {
  if (nextVisible === true && nextEnabled === true) return 'FORWARD';
  if (nextVisible === true && nextEnabled === false && prevEnabled === true &&
      initialRendered?.interactionRequired === true &&
      Number.isSafeInteger(initialRendered.index) && initialRendered.index > 0) {
    return 'RESUME_ONLY_AUTHORED_INTERACTION';
  }
  throw Error('F5_FACTORY_V3_NAVIGATION_UNAVAILABLE');
}
