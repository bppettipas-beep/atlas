import { env } from '../env';
import { runOverdueEscalation, runRecurringTemplates } from './taskAutomation';

let timer: NodeJS.Timeout | null = null;
let running = false;

async function tick() {
  if (running) return; // never overlap runs
  running = true;
  try {
    const escalated = await runOverdueEscalation();
    const generated = await runRecurringTemplates();
    if (escalated || generated) {
      console.log(
        `[atlas] scheduler: escalated ${escalated} overdue task(s), generated ${generated} recurring task(s)`,
      );
    }
  } catch (error) {
    console.error('[atlas] scheduler failed:', error);
  } finally {
    running = false;
  }
}

export function startScheduler() {
  if (env.SCHEDULER_INTERVAL_SECONDS === 0 || env.isTest) return;
  void tick();
  timer = setInterval(tick, env.SCHEDULER_INTERVAL_SECONDS * 1000);
  timer.unref?.();
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
