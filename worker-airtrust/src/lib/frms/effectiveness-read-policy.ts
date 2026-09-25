export const COMPLETE_FRMS_CHECKIN_EXISTS_SQL = `EXISTS (
  SELECT 1
    FROM frms_fadiga_checkin ch
   WHERE ch.empresa_id = p.empresa_id
     AND ch.funcionario_id = p.id
     AND ch.data_checkin = j.data
     AND ch.deleted_at IS NULL
     AND ch.jornada_inicio_prevista IS NOT NULL
     AND ch.wake_time IS NOT NULL
     AND ch.horas_sono > 0
     AND ch.horas_sono <= 24
)`;
