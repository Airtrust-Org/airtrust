import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { classifyBrowserError } from '../staging/pptx-browser-error-classifier.mjs';

test('classifies errors without returning browser messages or secrets', () => {
  const cases = [
    ['Minified React error #321; token=secret', 'REACT_321'],
    ['TypeError: secret@example.com', 'TYPE_ERROR'],
    ['Failed to fetch dynamically imported module: https://example.invalid/?token=secret', 'CHUNK_LOAD'],
    ['No QueryClient set, use QueryClientProvider', 'QUERY_CLIENT'],
    ['arbitrary private payload secret', 'OTHER'],
  ];
  for (const [input, expected] of cases) assert.equal(classifyBrowserError(input), expected);
});
