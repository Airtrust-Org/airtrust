import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { buildScormFunctionalDriverScript } from '../../lib/lms/lms-scorm-functional-driver';

/**
 * Synthetic isolated authored SCO. Buttons implement real learner callbacks;
 * the browser driver cannot write SCORM data or manipulate learner state.
 */
function createLegacySCO(options: { invalidQuiz?:boolean; wrongStatus?:boolean; noNext?:boolean; nonemptyStart?:boolean } = {}) {
  const ctx = createContext({});
  runInContext(