// Return only fixed labels and React's numeric error code; never persist the
// original browser message, which may contain credentials or learner data.
export function classifyBrowserError(value) {
  const message = String(value ?? '');
  const react = message.match(/Minified React error #(\d{1,4})\b/i);
  if (react) return `REACT_${react[1]}`;
  if (/failed to fetch dynamically imported module|importing a module script failed|loading chunk|chunkloaderror/i.test(message)) return 'CHUNK_LOAD';
  if (/rendered (?:more|fewer) hooks than|invalid hook call/i.test(message)) return 'REACT_HOOK';
  if (/no queryclient set/i.test(message)) return 'QUERY_CLIENT';
  if (/useauth must be used within/i.test(message)) return 'AUTH_CONTEXT';
  if (/\bTypeError\b/i.test(message)) return 'TYPE_ERROR';
  if (/\bReferenceError\b/i.test(message)) return 'REFERENCE_ERROR';
  return 'OTHER';
}
