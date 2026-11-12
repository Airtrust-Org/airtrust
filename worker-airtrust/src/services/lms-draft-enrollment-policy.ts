/**
 * A manager can pre-enroll employees in a draft LMS course, but the unfinished
 * course must not trigger learner invitations or notifications.
 * Publishing the course remains an explicit, separately verified operation.
 */
export function mayNotifyEnrollmentForCourse(course: { publicado: number | string | null | undefined }): boolean {
  return Number(course.publicado) === 1;
}
