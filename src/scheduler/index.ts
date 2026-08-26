import cron from 'node-cron';
import { getWibDateTime } from './wib-time.js';
import { evaluateDailyClassReminder } from './class-reminder.js';
import { evaluateDailyELearningReminder } from './elearning-reminder.js';
import { evaluateAssignmentDeadlines } from './assignment-reminder.js';
import pino from 'pino';

const logger = pino({ name: 'milestone-scheduler' });

export function initScheduler(): void {
  logger.info('Initializing Task, Class & E-Learning Scheduler...');

  // 1. Assignment deadline evaluation every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      await evaluateAssignmentDeadlines();
    } catch (error) {
      logger.error({ err: error }, 'Error during assignment deadline evaluation');
    }
  });

  // 2. Hourly Dispatcher for WIB-timed events:
  //    - 00:00 WIB (Mon-Fri): E-Learning active week daily reminder
  //    - 04:00 WIB (Daily): Today's class schedule reminder
  cron.schedule('0 * * * *', async () => {
    try {
      await dispatchWibHourlyJobs();
    } catch (error) {
      logger.error({ err: error }, 'Error during hourly WIB jobs dispatch');
    }
  });
}

async function dispatchWibHourlyJobs(): Promise<void> {
  const { hour, dayOfWeek } = getWibDateTime();

  // 00:00 WIB: E-Learning Daily Reminder (Mon-Fri)
  if (hour === 0 && dayOfWeek >= 1 && dayOfWeek <= 5) {
    await evaluateDailyELearningReminder();
  }

  // 04:00 WIB: Daily Class Schedule Reminder (Daily)
  if (hour === 4) {
    await evaluateDailyClassReminder();
  }
}
