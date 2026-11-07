// Offline adapter wrapper retained for synthetic R2 contract tests.
// The same implementation is imported by the governed Worker upload flow.
export {
  createR2ReadOnlyZipSource,
  validateF5R2ArchiveReadOnly,
} from '../../worker-airtrust/src/lib/lms/lms-scorm-r2-reader.mjs';
