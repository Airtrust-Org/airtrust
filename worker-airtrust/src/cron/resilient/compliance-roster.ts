import { buildSnapshot } from '../../routes/compliance-treinamentos';
import { applyTrainingRosterPlan, readTrainingRosterPlan } from '../../services/training-compliance-roster-sync';
import { runCronJobWithLease, type CronJobLogger } from './job-runner';

/**
 * Continuously reconciles the mandatory training roster to the effective
 * company/sector/function/designation matrix. No email/push invitation.
 * Uses the established cron lease and 20-row upper bound per tick.
 */
export async function runTrainingComplianceRosterJob(db:D1Database,logger:CronJobLogger) {
  return runCronJobWithLease({
    db,jobName:'lms-compliance-roster',scopeKey:'tenant:6',
    logger,ttlSeconds:240,budgetMs:25_000,
    execute:async context=>{
      if (!context.hasBudget(5000)) return {
        outcome:'PARTIAL' as const, processedCount:0,failedCount:0,
        metadata:{stop_reason:'BUDGET_BEFORE_SNAPSHOT'},
      };
      const {plan,resumo} = await readTrainingRosterPlan(db,6,buildSnapshot);
      if (!plan.enroll.length && !plan.remove.length) return {
        outcome:'SUCCEEDED' as const,processedCount:0,failedCount:0,
        metadata:{to_enroll:0,to_retire:0,email_sent:false},
      };
      if (!context.hasBudget(8000)) return {
        outcome:'PARTIAL' as const,processedCount:0,failedCount:0,
        metadata:{stop_reason:'BUDGET_AFTER_SNAPSHOT',to_enroll:resumo.para_matricular,to_retire:resumo.para_retirar},
      };
      const applied = await applyTrainingRosterPlan(db,6,plan,8);
      return {
        outcome:applied.remaining_estimate===0?'SUCCEEDED' as const:'PARTIAL' as const,
        processedCount:applied.removed+applied.enrolled,
        failedCount:0,
        metadata:{
          created_or_reactivated:applied.enrolled,
          retired:applied.removed,
          skipped:applied.ignored,
          outstanding:applied.remaining_estimate,
          email_sent:false,
        },
      };
    },
  });
}
