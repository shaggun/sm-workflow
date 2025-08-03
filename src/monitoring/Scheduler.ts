import * as cron from 'node-cron';
import { EventEmitter } from 'events';

export interface ScheduleConfig {
  interval: number; // in minutes
  cronExpression?: string;
  timezone?: string;
  runOnStart?: boolean;
}

export interface ScheduleEvent {
  type: 'scheduled' | 'manual' | 'error';
  timestamp: Date;
  nextRun?: Date | null;
  error?: Error;
}

export class Scheduler extends EventEmitter {
  private tasks: Map<string, cron.ScheduledTask> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;

  startScheduledMonitoring(config: ScheduleConfig): void {
    if (this.isRunning) {
      throw new Error('Scheduler is already running');
    }

    this.isRunning = true;

    // Run immediately if configured
    if (config.runOnStart) {
      this.emitScheduleEvent('manual');
    }

    // Set up scheduling based on configuration
    if (config.cronExpression) {
      this.setupCronSchedule(config);
    } else {
      this.setupIntervalSchedule(config);
    }
  }

  stopScheduledMonitoring(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Stop all cron tasks
    for (const [name, task] of this.tasks) {
      task.stop();
      if ('destroy' in task && typeof task.destroy === 'function') {
        (task.destroy as () => void)();
      }
      this.tasks.delete(name);
    }

    // Clear all intervals
    for (const [name, interval] of this.intervals) {
      clearInterval(interval);
      this.intervals.delete(name);
    }

    this.emit('scheduler-stopped');
  }

  triggerManualRun(): void {
    if (!this.isRunning) {
      throw new Error('Scheduler is not running');
    }

    this.emitScheduleEvent('manual');
  }

  getNextScheduledRun(): Date | null {
    if (!this.isRunning) {
      return null;
    }

    // For cron tasks, we can calculate the next run (simplified)
    if (this.tasks.size > 0) {
      // This is a simplification - node-cron doesn't provide direct access to next run time
      // In a real implementation, you might use a library like 'cronstrue' or 'cron-parser'
      return new Date(Date.now() + 60000); // Approximate next minute
    }

    // For interval-based scheduling, calculate based on interval
    const intervalNames = Array.from(this.intervals.keys());
    if (intervalNames.length > 0) {
      // Return an approximate next run time based on the first interval
      return new Date(Date.now() + 60000); // This would need to be more precise in production
    }

    return null;
  }

  getSchedulerStatus(): {
    isRunning: boolean;
    activeTasks: number;
    activeIntervals: number;
    nextRun: Date | null;
  } {
    return {
      isRunning: this.isRunning,
      activeTasks: this.tasks.size,
      activeIntervals: this.intervals.size,
      nextRun: this.getNextScheduledRun(),
    };
  }

  validateCronExpression(expression: string): boolean {
    try {
      return cron.validate(expression);
    } catch {
      return false;
    }
  }

  createOneTimeSchedule(delayMinutes: number): void {
    const delayMs = delayMinutes * 60 * 1000;

    setTimeout(() => {
      this.emitScheduleEvent('scheduled');
    }, delayMs);
  }

  private setupCronSchedule(config: ScheduleConfig): void {
    if (!config.cronExpression) {
      throw new Error('Cron expression is required for cron scheduling');
    }

    const isValid = this.validateCronExpression(config.cronExpression);
    if (!isValid) {
      throw new Error(`Invalid cron expression: ${config.cronExpression}`);
    }

    try {
      const task = cron.schedule(
        config.cronExpression,
        () => {
          this.emitScheduleEvent('scheduled');
        },
        {
          scheduled: true,
          timezone: config.timezone || 'UTC',
        }
      );

      this.tasks.set('main', task);
    } catch (error) {
      this.emitScheduleEvent('error', error as Error);
      throw error;
    }
  }

  private setupIntervalSchedule(config: ScheduleConfig): void {
    const intervalMs = config.interval * 60 * 1000; // Convert minutes to milliseconds

    if (intervalMs < 60000) {
      // Minimum 1 minute
      throw new Error('Minimum interval is 1 minute');
    }

    const interval = setInterval(() => {
      this.emitScheduleEvent('scheduled');
    }, intervalMs);

    this.intervals.set('main', interval);
  }

  private emitScheduleEvent(type: ScheduleEvent['type'], error?: Error): void {
    const event: ScheduleEvent = {
      type,
      timestamp: new Date(),
      nextRun: this.getNextScheduledRun(),
    };

    if (error) {
      event.error = error;
    }

    this.emit('schedule-event', event);
    this.emit(type, event);

    // Log the event silently - handled by calling code
    if (type === 'error') {
      // Error logging handled by calling code
    } else {
      // Event logging handled by calling code
    }
  }

  // Utility methods for common cron expressions
  static createMinutelyExpression(minute = '*'): string {
    return `${minute} * * * *`;
  }

  static createHourlyExpression(minute = 0): string {
    return `${minute} * * * *`;
  }

  static createDailyExpression(hour = 0, minute = 0): string {
    return `${minute} ${hour} * * *`;
  }

  static createWeeklyExpression(dayOfWeek = 0, hour = 0, minute = 0): string {
    return `${minute} ${hour} * * ${dayOfWeek}`;
  }

  static createIntervalExpression(intervalMinutes: number): string {
    if (intervalMinutes < 1 || intervalMinutes > 59) {
      throw new Error('Interval must be between 1 and 59 minutes');
    }

    // Create a cron expression that runs every N minutes
    const minutes = Array.from(
      { length: Math.ceil(60 / intervalMinutes) },
      (_, i) => i * intervalMinutes
    )
      .filter(m => m < 60)
      .join(',');

    return `${minutes} * * * *`;
  }
}
