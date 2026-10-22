/** The authenticated study-only wrapper must not interpret SCO terminal claims as LMS approval. */
export function isScormStudyTerminalMessage(value:unknown):boolean {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const type=(value as {type?:unknown}).type;
  return type==='lms:completed'||type==='lms:completion-pending'||
    type==='lms:completion-error';
}
