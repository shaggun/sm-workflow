import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScheduleCompleteState } from '../../../../src/workflows/states/ScheduleCompleteState.js';
import { StateContext } from '../../../../src/state-machine/State.js';
import { WorkflowMode } from '../../../../src/types/WorkflowMode.js';
import { promises as fs } from 'fs';

// Mock fs module
vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
  },
}));

describe('ScheduleCompleteState', () => {
  let state: ScheduleCompleteState;
  let mockContext: StateContext;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    state = new ScheduleCompleteState();

    mockContext = {
      config: {},
      data: {
        cycleStartTime: new Date('2025-08-03T21:00:00.000Z'),
        currentScreenshots: [],
        changeDetectionSummary: {
          changedImages: 0,
          averageChange: 0,
        },
      },
      logger: mockLogger,
    };

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('State Properties', () => {
    it('should have correct state name', () => {
      expect(state.name).toBe('SCHEDULE_COMPLETE');
    });

    it('should be a terminal state with no transitions', () => {
      const transitions = state.getTransitions();
      expect(transitions).toEqual([]);
    });
  });

  describe('execute method', () => {
    it('should complete successfully with no screenshots', async () => {
      mockContext.data.currentScreenshots = [];
      mockContext.data.changeDetectionSummary = null;

      const result = await state.execute(mockContext);

      expect(result).toBeNull(); // Terminal state returns null
      expect(mockLogger.info).toHaveBeenCalledWith(
        '✅ Scheduled run completed - no screenshots captured (target may be unavailable)'
      );
    });

    it('should complete successfully with screenshots but no changes', async () => {
      mockContext.data.currentScreenshots = ['screenshot1.png', 'screenshot2.png'];
      mockContext.data.changeDetectionSummary = {
        changedImages: 0,
        averageChange: 0,
      };

      const result = await state.execute(mockContext);

      expect(result).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith(
        '✅ Scheduled run completed - no changes detected in 2 screenshots'
      );
    });

    it('should complete successfully with changes detected', async () => {
      mockContext.data.currentScreenshots = ['screenshot1.png', 'screenshot2.png', 'screenshot3.png'];
      mockContext.data.changeDetectionSummary = {
        changedImages: 2,
        averageChange: 0.15,
      };

      const result = await state.execute(mockContext);

      expect(result).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith(
        '✅ Scheduled run completed - 2 changes processed from 3 screenshots'
      );
    });

    it('should handle null currentScreenshots gracefully', async () => {
      mockContext.data.currentScreenshots = null;
      mockContext.data.changeDetectionSummary = null;

      const result = await state.execute(mockContext);

      expect(result).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith(
        '✅ Scheduled run completed - no screenshots captured (target may be unavailable)'
      );
    });

    it('should handle undefined changeDetectionSummary gracefully', async () => {
      mockContext.data.currentScreenshots = ['screenshot1.png'];
      mockContext.data.changeDetectionSummary = undefined;

      const result = await state.execute(mockContext);

      expect(result).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith(
        '✅ Scheduled run completed - no changes detected in 1 screenshots'
      );
    });
  });

  describe('Audit Summary Generation', () => {
    beforeEach(() => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    });

    it('should create correct audit summary with no changes', async () => {
      const startTime = new Date('2025-08-03T21:00:00.000Z');
      mockContext.data.cycleStartTime = startTime;
      mockContext.data.currentScreenshots = ['screenshot1.png'];
      mockContext.data.changeDetectionSummary = {
        changedImages: 0,
        averageChange: 0,
      };

      // Mock current time for consistent duration calculation
      const mockDate = new Date('2025-08-03T21:01:30.000Z'); // 1.5 minutes later
      vi.spyOn(Date, 'now').mockReturnValue(mockDate.getTime());
      vi.spyOn(global, 'Date').mockImplementation(() => mockDate);

      await state.execute(mockContext);

      expect(fs.mkdir).toHaveBeenCalledWith('output/audit-summaries', { recursive: true });
      
      const writeFileCall = vi.mocked(fs.writeFile).mock.calls[0];
      expect(writeFileCall[0]).toMatch(/output\/audit-summaries\/schedule-complete-.*\.json/);
      
      const auditSummary = JSON.parse(writeFileCall[1] as string);
      expect(auditSummary).toEqual({
        mode: WorkflowMode.SCHEDULE,
        timestamp: mockDate.toISOString(),
        cycleStartTime: startTime.toISOString(),
        cycleDurationMinutes: 1.5,
        screenshotCount: 1,
        changedImages: 0,
        unchangedImages: 1,
        averageChange: 0,
        completed: true,
        completionMessage: '✅ Scheduled run completed - no changes detected in 1 screenshots',
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringMatching(/Schedule audit summary saved to output\/audit-summaries\/schedule-complete-.*\.json/)
      );
    });

    it('should create correct audit summary with changes', async () => {
      const startTime = new Date('2025-08-03T21:00:00.000Z');
      mockContext.data.cycleStartTime = startTime;
      mockContext.data.currentScreenshots = ['screenshot1.png', 'screenshot2.png'];
      mockContext.data.changeDetectionSummary = {
        changedImages: 1,
        averageChange: 0.25,
      };

      const mockDate = new Date('2025-08-03T21:02:00.000Z'); // 2 minutes later
      vi.spyOn(Date, 'now').mockReturnValue(mockDate.getTime());
      vi.spyOn(global, 'Date').mockImplementation(() => mockDate);

      await state.execute(mockContext);

      const writeFileCall = vi.mocked(fs.writeFile).mock.calls[0];
      const auditSummary = JSON.parse(writeFileCall[1] as string);
      
      expect(auditSummary.cycleDurationMinutes).toBe(2);
      expect(auditSummary.screenshotCount).toBe(2);
      expect(auditSummary.changedImages).toBe(1);
      expect(auditSummary.unchangedImages).toBe(1);
      expect(auditSummary.averageChange).toBe(0.25);
      expect(auditSummary.completionMessage).toBe(
        '✅ Scheduled run completed - 1 changes processed from 2 screenshots'
      );
    });

    it('should handle file system errors when saving audit summary', async () => {
      const fsError = new Error('Permission denied');
      vi.mocked(fs.writeFile).mockRejectedValue(fsError);

      await state.execute(mockContext);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to save audit summary: Permission denied'
      );
    });

    it('should handle mkdir errors gracefully', async () => {
      const mkdirError = new Error('Cannot create directory');
      vi.mocked(fs.mkdir).mockRejectedValue(mkdirError);

      await state.execute(mockContext);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to save audit summary: Cannot create directory'
      );
    });

    it('should handle unknown errors gracefully', async () => {
      vi.mocked(fs.writeFile).mockRejectedValue('Unknown error object');

      await state.execute(mockContext);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to save audit summary: Unknown error'
      );
    });
  });

  describe('Duration Calculation', () => {
    it('should calculate correct duration in minutes', async () => {
      const startTime = new Date('2025-08-03T21:00:00.000Z');
      mockContext.data.cycleStartTime = startTime;

      // Mock 3.75 minutes (3 minutes 45 seconds) later
      const endTime = new Date('2025-08-03T21:03:45.000Z');
      vi.spyOn(Date, 'now').mockReturnValue(endTime.getTime());
      vi.spyOn(global, 'Date').mockImplementation(() => endTime);

      await state.execute(mockContext);

      const writeFileCall = vi.mocked(fs.writeFile).mock.calls[0];
      const auditSummary = JSON.parse(writeFileCall[1] as string);
      
      expect(auditSummary.cycleDurationMinutes).toBe(3.75);
    });

    it('should round duration to 2 decimal places', async () => {
      const startTime = new Date('2025-08-03T21:00:00.000Z');
      mockContext.data.cycleStartTime = startTime;

      // Mock 1 minute 23.456 seconds later
      const endTime = new Date('2025-08-03T21:01:23.456Z');
      vi.spyOn(Date, 'now').mockReturnValue(endTime.getTime());
      vi.spyOn(global, 'Date').mockImplementation(() => endTime);

      await state.execute(mockContext);

      const writeFileCall = vi.mocked(fs.writeFile).mock.calls[0];
      const auditSummary = JSON.parse(writeFileCall[1] as string);
      
      // Should round 1.3909333... to 1.39
      expect(auditSummary.cycleDurationMinutes).toBe(1.39);
    });
  });

  describe('Change Detection Summary Handling', () => {
    it('should handle malformed changeDetectionSummary', async () => {
      mockContext.data.currentScreenshots = ['screenshot1.png'];
      mockContext.data.changeDetectionSummary = 'invalid';

      await state.execute(mockContext);

      const writeFileCall = vi.mocked(fs.writeFile).mock.calls[0];
      const auditSummary = JSON.parse(writeFileCall[1] as string);
      
      expect(auditSummary.changedImages).toBe(0);
      expect(auditSummary.averageChange).toBe(0);
    });

    it('should handle changeDetectionSummary with missing properties', async () => {
      mockContext.data.currentScreenshots = ['screenshot1.png'];
      mockContext.data.changeDetectionSummary = {};

      await state.execute(mockContext);

      const writeFileCall = vi.mocked(fs.writeFile).mock.calls[0];
      const auditSummary = JSON.parse(writeFileCall[1] as string);
      
      expect(auditSummary.changedImages).toBe(0);
      expect(auditSummary.averageChange).toBe(0);
    });

    it('should handle changeDetectionSummary as array', async () => {
      mockContext.data.currentScreenshots = ['screenshot1.png'];
      mockContext.data.changeDetectionSummary = [];

      await state.execute(mockContext);

      const writeFileCall = vi.mocked(fs.writeFile).mock.calls[0];
      const auditSummary = JSON.parse(writeFileCall[1] as string);
      
      expect(auditSummary.changedImages).toBe(0);
      expect(auditSummary.averageChange).toBe(0);
    });
  });

  describe('Filename Generation', () => {
    it('should generate unique filenames with timestamp', async () => {
      const mockDate1 = new Date('2025-08-03T21:25:07.450Z');
      const mockDate2 = new Date('2025-08-03T21:25:08.123Z');
      
      // First execution
      vi.spyOn(global, 'Date').mockImplementation(() => mockDate1);
      await state.execute(mockContext);
      
      const firstCall = vi.mocked(fs.writeFile).mock.calls[0];
      expect(firstCall[0]).toBe('output/audit-summaries/schedule-complete-2025-08-03T21-25-07-450Z.json');
      
      // Clear mocks and run second execution
      vi.clearAllMocks();
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      
      vi.spyOn(global, 'Date').mockImplementation(() => mockDate2);
      await state.execute(mockContext);
      
      const secondCall = vi.mocked(fs.writeFile).mock.calls[0];
      expect(secondCall[0]).toBe('output/audit-summaries/schedule-complete-2025-08-03T21-25-08-123Z.json');
    });
  });
});