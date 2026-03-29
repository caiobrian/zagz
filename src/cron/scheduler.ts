import cron from "node-cron";
import { agentCore } from "../agent/core.js";
import { cronQueries } from "../db/queries/cron.js";
import { checkAndSendAppointmentReminders } from "./jobs/appointment-reminder.js";
import { financeSummaryJob } from "./jobs/finance-summary.js";
import { morningBriefingJob } from "./jobs/morning-briefing.js";
import { weeklyReviewJob } from "./jobs/weekly-review.js";

type CronJobDef = {
  name: string;
  schedule: string;
  buildPrompt(): string;
};

// Default jobs seeded into the DB on startup
const DEFAULT_JOBS: CronJobDef[] = [morningBriefingJob, financeSummaryJob, weeklyReviewJob];

// Will be set by init() — used to send proactive messages via WhatsApp
let whatsappSender: ((message: string) => Promise<void>) | null = null;

/**
 * Runs a single cron job by name and returns its output.
 */
async function runJob(job: CronJobDef): Promise<string> {
  const prompt = job.buildPrompt();
  return agentCore.handleCronPrompt(prompt, job.name);
}

/**
 * Seeds default jobs into the DB and schedules them via node-cron.
 */
export function initScheduler(sender: (message: string) => Promise<void>): void {
  whatsappSender = sender;

  // Seed default jobs
  for (const job of DEFAULT_JOBS) {
    cronQueries.upsert(job.name, job.schedule);
  }

  // Schedule all enabled jobs from DB
  const enabledJobs = cronQueries.getEnabled();

  for (const dbJob of enabledJobs) {
    const jobDef = DEFAULT_JOBS.find((j) => j.name === dbJob.name);
    if (!jobDef) continue;

    if (!cron.validate(dbJob.schedule)) {
      console.warn(`[Cron] Invalid schedule for "${dbJob.name}": ${dbJob.schedule}`);
      continue;
    }

    cron.schedule(
      dbJob.schedule,
      async () => {
        console.log(`[Cron] Running job: ${dbJob.name}`);
        try {
          const output = await runJob(jobDef);
          cronQueries.logRun(dbJob.name, "success", { output });

          if (whatsappSender) {
            await whatsappSender(output);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`[Cron] Job "${dbJob.name}" failed:`, error);
          cronQueries.logRun(dbJob.name, "failed", { error: errorMsg });

          if (whatsappSender) {
            await whatsappSender(`⚠️ Cron job "${dbJob.name}" falhou: ${errorMsg}`);
          }
        }
      },
      { timezone: process.env.TZ || "America/Sao_Paulo" }
    );

    console.log(`[Cron] Scheduled "${dbJob.name}" → ${dbJob.schedule}`);
  }

  // Appointment reminders: check every 30 minutes
  cron.schedule(
    "*/30 * * * *",
    async () => {
      try {
        if (whatsappSender) {
          await checkAndSendAppointmentReminders(whatsappSender);
        }
      } catch (error) {
        console.error("[Cron] Appointment reminder check failed:", error);
      }
    },
    { timezone: process.env.TZ || "America/Sao_Paulo" }
  );

  console.log("[Cron] Appointment reminders scheduled (every 30 min)");
}
