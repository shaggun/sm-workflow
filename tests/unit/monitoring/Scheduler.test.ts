import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Scheduler, ScheduleConfig } from '../../../src/monitoring/Scheduler.js';
import * as cron from 'node-cron';

// Mock node-cron
vi.mock('node-cron', () => ({
  schedule: vi.fn(),
  validate: vi.fn(),
}));

describe('Scheduler', () => {
  let scheduler: Scheduler;
  let mockTask: any;

  beforeEach(() => {
    scheduler = new Scheduler();
    
    mockTask = {
      stop: vi.fn(),
      destroy: vi.fn(),
      getStatus: vi.fn().mockReturnValue('scheduled'),
    };

    // Reset mocks
    vi.clearAllMocks();
    
    // Mock cron.schedule to return our mock task
    (cron.schedule as any).mockReturnValue(mockTask);
    (cron.validate as any).mockReturnValue(true);
  });

  afterEach(async () => {
    // Clean up any running schedulers
    if (scheduler) {
      await scheduler.stopScheduledMonitoring();
    }
  });

  describe('startScheduledMonitoring', () => {
    it('should start interval-based monitoring', async () => {
      const config: ScheduleConfig = {
        interval: 5, // 5 minutes
        runOnStart: false,
      };

      scheduler.startScheduledMonitoring(config);

      const status = scheduler.getSchedulerStatus();
      expect(status.isRunning).toBe(true);
      expect(status.activeIntervals).toBe(1);
    });

    it('should start cron-based monitoring', async () => {
      const config: ScheduleConfig = {
        interval: 5,
        cronExpression: '*/5 * * * *', // Every 5 minutes
        runOnStart: false,
      };

      scheduler.startScheduledMonitoring(config);

      expect(cron.schedule).toHaveBeenCalledWith(
        '*/5 * * * *',
        expect.any(Function),
        {
          scheduled: true,
          timezone: 'UTC',
        }
      );

      const status = scheduler.getSchedulerStatus();
      expect(status.isRunning).toBe(true);
      expect(status.activeTasks).toBe(1);
    });

    it('should run immediately if configured', async () => {
      const scheduleEventSpy = vi.fn();
      scheduler.on('schedule-event', scheduleEventSpy);

      const config: ScheduleConfig = {
        interval: 5,
        runOnStart: true,
      };

      scheduler.startScheduledMonitoring(config);

      expect(scheduleEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manual' })
      );
    });

    it('should throw error if already running', async () => {
      const config: ScheduleConfig = {
        interval: 5,
        runOnStart: false,
      };

      scheduler.startScheduledMonitoring(config);

      expect(() => scheduler.startScheduledMonitoring(config)).toThrow(
        'Scheduler is already running'
      );
    });

    it('should validate cron expression', async () => {
      (cron.validate as any).mockReturnValue(false);

      const config: ScheduleConfig = {
        interval: 5,
        cronExpression: 'invalid-cron',
      };

      expect(() => scheduler.startScheduledMonitoring(config)).toThrow(
        'Invalid cron expression: invalid-cron'
      );
    });

    it('should use custom timezone for cron', async () => {
      const config: ScheduleConfig = {
        interval: 5,
        cronExpression: '0 * * * *',
        timezone: 'America/New_York',
      };

      scheduler.startScheduledMonitoring(config);

      expect(cron.schedule).toHaveBeenCalledWith(
        '0 * * * *',
        expect.any(Function),
        {
          scheduled: true,
          timezone: 'America/New_York',
        }
      );
    });

    it('should reject intervals less than 1 minute', async () => {
      const config: ScheduleConfig = {
        interval: 0.5, // 30 seconds
      };

      expect(() => scheduler.startScheduledMonitoring(config)).toThrow(
        'Minimum interval is 1 minute'
      );
    });
  });

  describe('stopScheduledMonitoring', () => {
    it('should stop running scheduler gracefully', async () => {
      const config: ScheduleConfig = {
        interval: 5,
        runOnStart: false,
      };

      scheduler.startScheduledMonitoring(config);
      expect(scheduler.getSchedulerStatus().isRunning).toBe(true);

      await scheduler.stopScheduledMonitoring();
      expect(scheduler.getSchedulerStatus().isRunning).toBe(false);
    });

    it('should stop cron tasks', async () => {
      const config: ScheduleConfig = {
        interval: 5,
        cronExpression: '*/5 * * * *',
      };

      scheduler.startScheduledMonitoring(config);
      await scheduler.stopScheduledMonitoring();

      expect(mockTask.stop).toHaveBeenCalled();
      expect(mockTask.destroy).toHaveBeenCalled();
    });

    it('should handle stopping when not running', async () => {
      // Should not throw
      expect(() => scheduler.stopScheduledMonitoring()).not.toThrow();
    });

    it('should emit stopped event', async () => {
      const stoppedSpy = vi.fn();
      scheduler.on('scheduler-stopped', stoppedSpy);

      const config: ScheduleConfig = {
        interval: 5,
      };

      scheduler.startScheduledMonitoring(config);
      await scheduler.stopScheduledMonitoring();

      expect(stoppedSpy).toHaveBeenCalled();
    });
  });

  describe('triggerManualRun', () => {
    it('should trigger manual run when running', async () => {
      const manualEventSpy = vi.fn();
      scheduler.on('manual', manualEventSpy);

      const config: ScheduleConfig = {
        interval: 5,
        runOnStart: false,
      };

      scheduler.startScheduledMonitoring(config);
      scheduler.triggerManualRun();

      expect(manualEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manual' })
      );
    });

    it('should throw error when not running', () => {
      expect(() => scheduler.triggerManualRun()).toThrow(
        'Scheduler is not running'
      );
    });
  });

  describe('getSchedulerStatus', () => {
    it('should return correct status when not running', () => {
      const status = scheduler.getSchedulerStatus();

      expect(status.isRunning).toBe(false);
      expect(status.activeTasks).toBe(0);
      expect(status.activeIntervals).toBe(0);
      expect(status.nextRun).toBeNull();
    });

    it('should return correct status when running', async () => {
      const config: ScheduleConfig = {
        interval: 5,
      };

      scheduler.startScheduledMonitoring(config);
      const status = scheduler.getSchedulerStatus();

      expect(status.isRunning).toBe(true);
      expect(status.activeIntervals).toBe(1);
    });
  });

  describe('validateCronExpression', () => {
    it('should validate correct cron expression', async () => {
      (cron.validate as any).mockReturnValue(true);

      const isValid = await scheduler.validateCronExpression('0 * * * *');
      expect(isValid).toBe(true);
    });

    it('should reject invalid cron expression', async () => {
      (cron.validate as any).mockReturnValue(false);

      const isValid = await scheduler.validateCronExpression('invalid');
      expect(isValid).toBe(false);
    });

    it('should handle validation errors', async () => {
      (cron.validate as any).mockImplementation(() => {
        throw new Error('Validation error');
      });

      const isValid = await scheduler.validateCronExpression('test');
      expect(isValid).toBe(false);
    });
  });

  describe('createOneTimeSchedule', () => {
    it('should create one-time delayed schedule', () => {
      const scheduleEventSpy = vi.fn();
      scheduler.on('scheduled', scheduleEventSpy);

      // Use a very short delay for testing
      scheduler.createOneTimeSchedule(0.001); // ~60ms

      // Wait for the timeout to fire
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(scheduleEventSpy).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'scheduled' })
          );
          resolve();
        }, 100);
      });
    });
  });

  describe('static utility methods', () => {
    it('should create minutely expression', () => {
      expect(Scheduler.createMinutelyExpression()).toBe('* * * * *');
      expect(Scheduler.createMinutelyExpression('30')).toBe('30 * * * *');
    });

    it('should create hourly expression', () => {
      expect(Scheduler.createHourlyExpression()).toBe('0 * * * *');
      expect(Scheduler.createHourlyExpression(30)).toBe('30 * * * *');
    });

    it('should create daily expression', () => {
      expect(Scheduler.createDailyExpression()).toBe('0 0 * * *');
      expect(Scheduler.createDailyExpression(9, 30)).toBe('30 9 * * *');
    });

    it('should create weekly expression', () => {
      expect(Scheduler.createWeeklyExpression()).toBe('0 0 * * 0');
      expect(Scheduler.createWeeklyExpression(1, 9, 30)).toBe('30 9 * * 1');
    });

    it('should create interval expression', () => {
      expect(Scheduler.createIntervalExpression(5)).toBe('0,5,10,15,20,25,30,35,40,45,50,55 * * * *');
      expect(Scheduler.createIntervalExpression(15)).toBe('0,15,30,45 * * * *');
    });

    it('should reject invalid interval values', () => {
      expect(() => Scheduler.createIntervalExpression(0)).toThrow(
        'Interval must be between 1 and 59 minutes'
      );
      expect(() => Scheduler.createIntervalExpression(60)).toThrow(
        'Interval must be between 1 and 59 minutes'
      );
    });
  });

  describe('event handling', () => {
    it('should emit scheduled events', () => {
      return new Promise<void>((resolve) => {
        scheduler.on('scheduled', (event) => {
          expect(event.type).toBe('scheduled');
          expect(event.timestamp).toBeInstanceOf(Date);
          resolve();
        });

        // Simulate a scheduled event
        scheduler.emit('scheduled', {
          type: 'scheduled',
          timestamp: new Date(),
        });
      });
    });

    it('should emit error events', () => {
      return new Promise<void>((resolve) => {
        scheduler.on('error', (event) => {
          expect(event.type).toBe('error');
          expect(event.error).toBeInstanceOf(Error);
          resolve();
        });

        // Simulate an error event
        scheduler.emit('error', {
          type: 'error',
          timestamp: new Date(),
          error: new Error('Test error'),
        });
      });
    });
  });
});