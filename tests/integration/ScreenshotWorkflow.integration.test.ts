import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ScreenshotWorkflow,
  WorkflowConfig,
} from '../../src/workflows/ScreenshotWorkflow.js';
import { WorkflowMode } from '../../src/types/WorkflowMode.js';
import { promises as fs } from 'fs';

// Mock external dependencies
vi.mock('puppeteer', () => ({
  default: {
    launch: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        setViewport: vi.fn(),
        goto: vi.fn().mockResolvedValue({ ok: () => true }),
        waitForTimeout: vi.fn(),
        screenshot: vi.fn(),
        close: vi.fn(),
      }),
      close: vi.fn(),
    }),
  },
}));

vi.mock('sharp', () => ({
  default: vi.fn().mockImplementation(() => ({
    resize: vi.fn().mockReturnThis(),
    ensureAlpha: vi.fn().mockReturnThis(),
    raw: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.alloc(1000)),
    metadata: vi.fn().mockResolvedValue({
      width: 1920,
      height: 1080,
    }),
  })),
}));

vi.mock('pixelmatch', () => ({
  default: vi.fn().mockReturnValue(0),
}));

describe('ScreenshotWorkflow Integration', () => {
  let workflow: ScreenshotWorkflow;
  let testConfig: WorkflowConfig;
  let testOutputDir: string;

  beforeEach(() => {
    // Create a unique test output directory
    testOutputDir = `./test-output-${Date.now()}`;

    testConfig = {
      monitoring: {
        interval: 1, // 1 minute for faster testing
      },
      screenshots: {
        formats: ['png'],
        viewports: [
          { width: 1920, height: 1080, name: 'desktop' },
          { width: 390, height: 844, name: 'mobile' },
        ],
        quality: 90,
        timeout: 15000,
        waitForNavigation: true,
      },
      changeDetection: {
        threshold: 0.1,
        includeAA: false,
        alpha: 0.1,
        diffOutputDir: `${testOutputDir}/diffs`,
      },
      recipes: [
        {
          name: 'test-recipe',
          description: 'Test recipe for integration testing',
          steps: [
            {
              type: 'navigate',
              url: 'http://example.com',
              filename: 'homepage',
            },
          ],
        },
      ],
    };

    workflow = new ScreenshotWorkflow(testConfig);
  });

  afterEach(async () => {
    // Clean up workflow
    if (workflow) {
      try {
        await workflow.stop();
      } catch {
        // Ignore cleanup errors
      }
    }

    // Clean up test output directory
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Workflow Initialization', () => {
    it('should initialize workflow successfully', async () => {
      await expect(workflow.initialize()).resolves.toBeUndefined();

      const status = workflow.getStatus();
      expect(status.isRunning).toBe(false);
      expect(status.currentState).toBeNull();
      expect(status.config).toEqual(testConfig);
    });

    it('should create required output directories', async () => {
      await workflow.initialize();

      // Check that output directories exist
      const expectedDirs = [
        './output/final',
        './output/temp',
        './output/diffs',
        './output/quality-reports',
        './output/audit-summaries',
      ];

      for (const dir of expectedDirs) {
        await expect(fs.access(dir)).resolves.toBeUndefined();
      }
    });
  });

  describe('Configuration Validation', () => {
    it('should validate correct configuration', () => {
      const validation = workflow.validateConfiguration();

      expect(validation.isValid).toBe(true);
      expect(validation.errors.length).toBe(0);
    });

    it('should reject invalid monitoring interval', () => {
      const invalidConfig = {
        ...testConfig,
        monitoring: { interval: 0 },
      };

      const invalidWorkflow = new ScreenshotWorkflow(invalidConfig);
      const validation = invalidWorkflow.validateConfiguration();

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'Monitoring interval must be at least 1 minute'
      );
    });

    it('should reject missing viewports', () => {
      const invalidConfig = {
        ...testConfig,
        screenshots: {
          ...testConfig.screenshots,
          viewports: [],
        },
      };

      const invalidWorkflow = new ScreenshotWorkflow(invalidConfig);
      const validation = invalidWorkflow.validateConfiguration();

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'At least one viewport must be configured'
      );
    });

    it('should reject invalid recipe steps', () => {
      const invalidConfig = {
        ...testConfig,
        recipes: [
          {
            name: 'invalid-recipe',
            steps: [
              {
                type: 'navigate',
                // Missing url and filename
              },
            ],
          },
        ],
      };

      const invalidWorkflow = new ScreenshotWorkflow(invalidConfig);
      const validation = invalidWorkflow.validateConfiguration();

      expect(validation.isValid).toBe(false);
      expect(
        validation.errors.some(error =>
          error.includes('navigate step missing URL')
        )
      ).toBe(true);
    });

    it('should warn about missing recipes', () => {
      const configWithoutRecipes = {
        ...testConfig,
        recipes: [],
      };

      const workflowWithoutRecipes = new ScreenshotWorkflow(
        configWithoutRecipes
      );
      const validation = workflowWithoutRecipes.validateConfiguration();

      expect(validation.isValid).toBe(true);
      expect(validation.warnings).toContain(
        'No recipes configured - workflow will not capture screenshots'
      );
    });
  });

  describe('Workflow Execution', () => {
    it('should start workflow successfully', async () => {
      await workflow.initialize();

      // Start workflow in background
      const startPromise = workflow.start();

      // Give it time to start
      await new Promise(resolve => setTimeout(resolve, 100));

      const status = workflow.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.currentState).toBe('MONITORING');

      // Stop workflow
      await workflow.stop();

      try {
        await startPromise;
      } catch {
        // Expected to throw when stopped
      }
    });

    it('should start schedule mode workflow successfully', async () => {
      await workflow.initialize(WorkflowMode.SCHEDULE);

      // Start workflow in background
      const startPromise = workflow.start();

      // Give it time to start
      await new Promise(resolve => setTimeout(resolve, 100));

      const status = workflow.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.currentState).toBe('MONITORING'); // Schedule mode starts with monitoring

      // Stop workflow
      await workflow.stop();

      try {
        await startPromise;
      } catch {
        // Expected to throw when stopped
      }
    });

    it('should complete schedule mode workflow and reach terminal state', async () => {
      // Create a workflow with minimal configuration for fast testing
      const scheduleTestConfig = {
        ...testConfig,
        monitoring: {
          interval: 1, // 1 minute
        },
      };

      const scheduleWorkflow = new ScreenshotWorkflow(scheduleTestConfig);
      await scheduleWorkflow.initialize(WorkflowMode.SCHEDULE);

      // Mock the state machine to simulate quick completion
      let currentState = 'MONITORING';
      const mockStateMachine = {
        start: vi.fn().mockImplementation(async () => {
          // Simulate quick state progression for schedule mode
          currentState = 'SCHEDULE_COMPLETE';
          return Promise.resolve();
        }),
        stop: vi.fn(),
        getCurrentStateName: vi.fn().mockImplementation(() => currentState),
        isStateMachineRunning: vi.fn().mockReturnValue(false),
      };

      // Replace the state machine
      Object.defineProperty(scheduleWorkflow, 'stateMachine', {
        value: mockStateMachine,
        writable: true,
      });

      // Start and immediately complete
      await scheduleWorkflow.start();

      const status = scheduleWorkflow.getStatus();
      expect(status.currentState).toBe('SCHEDULE_COMPLETE');
      expect(status.isRunning).toBe(false); // Should be stopped after completion

      // Cleanup
      try {
        await scheduleWorkflow.stop();
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should handle trigger mode workflow successfully', async () => {
      await workflow.initialize(WorkflowMode.TRIGGER);

      // Start workflow in background
      const startPromise = workflow.start();

      // Give it time to start and potentially complete
      await new Promise(resolve => setTimeout(resolve, 200));

      const status = workflow.getStatus();
      // Trigger mode runs once and completes, so it may be in TRIGGER_COMPLETE
      expect(['MONITORING', 'TRIGGER_COMPLETE']).toContain(status.currentState);

      // Stop workflow
      await workflow.stop();

      try {
        await startPromise;
      } catch {
        // Expected to throw when stopped
      }
    });

    it('should handle manual trigger', async () => {
      await workflow.initialize();

      // Start workflow
      const startPromise = workflow.start();

      // Wait for workflow to start
      await new Promise(resolve => setTimeout(resolve, 100));

      // Trigger manual run
      workflow.triggerManualRun();

      // Give it time to process
      await new Promise(resolve => setTimeout(resolve, 100));

      const status = workflow.getStatus();
      expect(status.isRunning).toBe(true);

      // Stop workflow
      await workflow.stop();

      try {
        await startPromise;
      } catch {
        // Expected to throw when stopped
      }
    });

    it('should throw error when starting uninitialized workflow', async () => {
      const uninitializedWorkflow = new ScreenshotWorkflow(testConfig);

      await expect(uninitializedWorkflow.start()).rejects.toThrow(
        'Workflow not initialized. Call initialize() first.'
      );
    });

    it('should throw error when triggering manual run on stopped workflow', async () => {
      await workflow.initialize();

      expect(() => workflow.triggerManualRun()).toThrow(
        'Workflow is not running'
      );
    });
  });

  describe('Workflow Metrics', () => {
    it('should provide workflow metrics', async () => {
      await workflow.initialize();

      const metrics = await workflow.getWorkflowMetrics();

      expect(metrics).toHaveProperty('directories');
      expect(metrics).toHaveProperty('recentActivity');

      expect(metrics.directories).toHaveProperty('final');
      expect(metrics.directories).toHaveProperty('temp');
      expect(metrics.directories).toHaveProperty('diffs');

      expect(metrics.directories.final).toHaveProperty('fileCount');
      expect(metrics.directories.final).toHaveProperty('totalSizeMB');
    });

    it('should handle missing directories gracefully', async () => {
      await workflow.initialize();

      // Remove one of the directories
      await fs.rm('./output/temp', { recursive: true, force: true });

      const metrics = await workflow.getWorkflowMetrics();

      expect(metrics.directories.temp.fileCount).toBe(0);
      expect(metrics.directories.temp.totalSizeMB).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle initialization errors gracefully', async () => {
      // Mock mkdir to fail
      const mkdirSpy = vi
        .spyOn(fs, 'mkdir')
        .mockRejectedValueOnce(new Error('Permission denied'));

      // Should not throw, but log error
      await expect(workflow.initialize()).resolves.toBeUndefined();

      // Restore original implementation
      mkdirSpy.mockRestore();
    });

    it('should handle workflow start errors', async () => {
      await workflow.initialize();

      // Mock state machine to throw error
      const mockStateMachine = {
        start: vi.fn().mockRejectedValue(new Error('State machine error')),
        stop: vi.fn(),
        getCurrentStateName: vi.fn().mockReturnValue(null),
        isStateMachineRunning: vi.fn().mockReturnValue(false),
      };

      // Replace the state machine (this is a bit hacky for testing)
      Object.defineProperty(workflow, 'stateMachine', {
        value: mockStateMachine,
        writable: true,
      });

      await expect(workflow.start()).rejects.toThrow('State machine error');
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle extreme change detection threshold', () => {
      const extremeConfig = {
        ...testConfig,
        changeDetection: {
          ...testConfig.changeDetection,
          threshold: 1.5, // > 1.0
        },
      };

      const extremeWorkflow = new ScreenshotWorkflow(extremeConfig);
      const validation = extremeWorkflow.validateConfiguration();

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'Change detection threshold must be between 0 and 1'
      );
    });

    it('should handle negative change detection threshold', () => {
      const negativeConfig = {
        ...testConfig,
        changeDetection: {
          ...testConfig.changeDetection,
          threshold: -0.1,
        },
      };

      const negativeWorkflow = new ScreenshotWorkflow(negativeConfig);
      const validation = negativeWorkflow.validateConfiguration();

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain(
        'Change detection threshold must be between 0 and 1'
      );
    });

    it('should handle multiple recipe validation errors', () => {
      const multiErrorConfig = {
        ...testConfig,
        recipes: [
          {
            name: '', // Empty name
            steps: [], // No steps
          },
          {
            name: 'valid-name',
            steps: [
              {
                type: 'navigate',
                // Missing url and filename
              },
            ],
          },
        ],
      };

      const multiErrorWorkflow = new ScreenshotWorkflow(multiErrorConfig);
      const validation = multiErrorWorkflow.validateConfiguration();

      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(1);
    });
  });
});
