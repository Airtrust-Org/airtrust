import { z } from 'zod';

// Contract shared by canonical SCORM commits; the server still checks the
// active enrollment cycle against D1 before mutating learning evidence.
export const ScormCommitSchema = z.object({
  matricula_id: z.number().int().positive(),
  // Current wrapper is cycle-bound; legacy integrations without a cycle ID
  // continue through the pre-existing guarded path until upgraded.
  ciclo_id: z.number().int().positive().optional(),
  // SCORM 1.2
  lesson_status: z.string().optional().nullable(),
  // SCORM 2004
  completion_status: z.string().optional().nullable(),
  success_status: z.string().optional().nullable(),
  // Scores
  score_raw: z.number().optional().nullable(),
  score_max: z.number().optional().nullable(),
  score_min: z.number().optional().nullable(),
  score_scaled: z.number().optional().nullable(),
  // Tempo
  session_time: z.string().optional().nullable(),
  total_time: z.string().optional().nullable(),
  // Dados de estado
  suspend_data: z.string().max(65535).optional().nullable(),
  launch_data: z.string().optional().nullable(),
  // CMI completo (JSON stringified)
  cmi_json: z.string().optional().nullable(),
  // Metadados do wrapper AirTrust
  commit_event: z.string().optional().nullable(),
  completion_candidate: z.boolean().optional().nullable(),
  completion_observed_at: z.string().optional().nullable(),
});
