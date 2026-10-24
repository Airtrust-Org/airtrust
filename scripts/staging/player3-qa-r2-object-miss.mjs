/** An absent first-time QA object is normal; authorization errors are not. */
export function isExplicitMissingR2Object(output) {
  if (typeof output !== 'string') return false;
  // Never downgrade a permission/auth failure into permission to write.
  if (/\b(401|403|unauthorized|forbidden|permission denied|authentication error)\b/i.test(output))
    return false;
  return /\b(404|object not found|object does not exist|no such r2 object|specified key does not exist|nosuchkey)\b/i.test(output);
}
