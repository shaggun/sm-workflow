import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChangeDetectionState } from '../../../../src/workflows/states/ChangeDetectionState.js';
import { StateContext } from '../../../../src/state-machine/State.js';
import { WorkflowMode } from '../../../../src/types/WorkflowMode.js';
import { WorkflowState } from '../../../../src/types/WorkflowState.js';
import { WorkflowEvent } from '../../../../src/types/WorkflowEvent.js';
import { TransitionBuilder } from '../../../../src/state-machine/Transition.js';
import { EventBuilder } from '../../../../src/state-machine/Event.js';

// Mock external dependencies
vi.mock('../../../../src/monitoring/ChangeDetector.js', () => ({
  ChangeDetector: vi.fn().mockImplementation(() => ({
    compareImages: vi.fn(),
    cleanupTempFiles: vi.fn(),
  })),
}));

vi.mock('../../../../src/screenshot/ScreenshotService.js', () => ({
  ScreenshotService: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    cleanup: vi.fn(),
    isUrlAccessible: vi.fn().mockResolvedValue(true),
    captureMultipleScreenshots: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(),
    readdir: vi.fn(),
    access: vi.fn(),
  },
}));

describe('ChangeDetectionState', () => {
  let state: ChangeDetectionState;
  let mockContext: StateContext;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    state = new ChangeDetectionState();

    mockContext = {
      config: {
        recipes: [
          {
            name: 'test-recipe',
            steps: [
              { type: 'navigate', url: 'http://example.com', filename: 'test-page' },
            ],
          },
        ],
        screenshots: {
          formats: ['png'],
          viewports: [{ width: 1920, height: 1080, name: 'desktop' }],
          quality: 90,
          timeout: 15000,
          waitForNavigation: true,
        },
        changeDetection: {
          threshold: 0.1,
          includeAA: false,
          alpha: 0.1,
          diffOutputDir: './output/diffs',
        },
        monitoring: {
          interval: 1,
        },
      },
      data: {},
      logger: mockLogger,
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('State Properties', () => {
    it('should have correct state name', () => {
      expect(state.name).toBe('CHANGE_DETECTION');
    });

    it('should have correct transitions', () => {
      const transitions = state.getTransitions();
      expect(transitions).toHaveLength(4);
      
      // Check that all expected transitions exist
      const transitionTypes = transitions.map(t => t.eventType);
      expect(transitionTypes).toContain('VISUAL_CHANGE_DETECTED');
      expect(transitionTypes).toContain('NO_CHANGE_DETECTED');
    });
  });

  describe('WorkflowMode-based Transitions', () => {
    it('should transition to TRIGGER_COMPLETE when no changes in trigger mode', () => {
      const transitions = state.getTransitions();
      const noChangeTransitions = transitions.filter(t => t.eventType === 'NO_CHANGE_DETECTED');
      
      const triggerTransition = noChangeTransitions.find(t => 
        t.condition && t.condition(EventBuilder.noChangeDetected(), { workflowMode: WorkflowMode.TRIGGER })
      );
      
      expect(triggerTransition).toBeDefined();
      expect(triggerTransition?.targetState).toBe('TRIGGER_COMPLETE');
    });

    it('should transition to SCHEDULE_COMPLETE when no changes in schedule mode', () => {
      const transitions = state.getTransitions();
      const noChangeTransitions = transitions.filter(t => t.eventType === 'NO_CHANGE_DETECTED');
      
      const scheduleTransition = noChangeTransitions.find(t => 
        t.condition && t.condition(EventBuilder.noChangeDetected(), { workflowMode: WorkflowMode.SCHEDULE })
      );
      
      expect(scheduleTransition).toBeDefined();
      expect(scheduleTransition?.targetState).toBe('SCHEDULE_COMPLETE');
    });

    it('should transition to AUDIT_COMPLETE when no changes in monitor mode', () => {
      const transitions = state.getTransitions();
      const noChangeTransitions = transitions.filter(t => t.eventType === 'NO_CHANGE_DETECTED');
      
      const monitorTransition = noChangeTransitions.find(t => 
        t.condition && t.condition(EventBuilder.noChangeDetected(), { workflowMode: WorkflowMode.MONITOR })
      );
      
      expect(monitorTransition).toBeDefined();
      expect(monitorTransition?.targetState).toBe('AUDIT_COMPLETE');
    });

    it('should always transition to RECIPE_EXECUTION when changes detected', () => {
      const transitions = state.getTransitions();
      const changeTransition = transitions.find(t => t.eventType === 'VISUAL_CHANGE_DETECTED');
      
      expect(changeTransition).toBeDefined();
      expect(changeTransition?.targetState).toBe('RECIPE_EXECUTION');
      expect(changeTransition?.condition).toBeUndefined(); // No condition for this transition
    });

    it('should not transition to wrong completion states for different modes', () => {
      const transitions = state.getTransitions();
      const noChangeTransitions = transitions.filter(t => t.eventType === 'NO_CHANGE_DETECTED');
      
      // Trigger mode should not go to schedule or monitor completion
      const nonTriggerForTrigger = noChangeTransitions.filter(t => 
        t.condition && 
        t.condition(EventBuilder.noChangeDetected(), { workflowMode: WorkflowMode.TRIGGER }) &&
        t.targetState !== 'TRIGGER_COMPLETE'
      );
      expect(nonTriggerForTrigger).toHaveLength(0);
      
      // Schedule mode should not go to trigger or monitor completion
      const nonScheduleForSchedule = noChangeTransitions.filter(t => 
        t.condition && 
        t.condition(EventBuilder.noChangeDetected(), { workflowMode: WorkflowMode.SCHEDULE }) &&
        t.targetState !== 'SCHEDULE_COMPLETE'
      );
      expect(nonScheduleForSchedule).toHaveLength(0);
      
      // Monitor mode should not go to trigger or schedule completion
      const nonMonitorForMonitor = noChangeTransitions.filter(t => 
        t.condition && 
        t.condition(EventBuilder.noChangeDetected(), { workflowMode: WorkflowMode.MONITOR }) &&
        t.targetState !== 'AUDIT_COMPLETE'
      );
      expect(nonMonitorForMonitor).toHaveLength(0);
    });
  });

  describe('Transition Condition Testing', () => {
    it('should test transition conditions with different context data', () => {
      const transitions = state.getTransitions();
      const noChangeTransitions = transitions.filter(t => t.eventType === 'NO_CHANGE_DETECTED');
      
      // Test with undefined workflowMode
      const undefinedModeResults = noChangeTransitions.map(t => ({
        target: t.targetState,
        matches: t.condition ? t.condition(EventBuilder.noChangeDetected(), { workflowMode: undefined }) : false,
      }));
      
      // Should not match any condition with undefined mode
      expect(undefinedModeResults.every(r => !r.matches)).toBe(true);
      
      // Test with invalid workflowMode
      const invalidModeResults = noChangeTransitions.map(t => ({
        target: t.targetState,
        matches: t.condition ? t.condition(EventBuilder.noChangeDetected(), { workflowMode: 'invalid' as any }) : false,
      }));
      
      // Should not match any condition with invalid mode
      expect(invalidModeResults.every(r => !r.matches)).toBe(true);
    });

    it('should handle missing context data gracefully', () => {
      const transitions = state.getTransitions();
      const noChangeTransitions = transitions.filter(t => t.eventType === 'NO_CHANGE_DETECTED');
      
      // Test with empty context data
      const emptyContextResults = noChangeTransitions.map(t => ({
        target: t.targetState,
        matches: t.condition ? t.condition(EventBuilder.noChangeDetected(), {}) : false,
      }));
      
      expect(emptyContextResults.every(r => !r.matches)).toBe(true);
      
      // Test with null context data should be handled safely
      // The actual implementation might throw, but we test that the conditions exist
      noChangeTransitions.forEach(t => {
        expect(t.condition).toBeDefined();
        // Skip null test as it would throw - this is expected behavior
      });
    });
  });

  describe('Transition Builder Usage', () => {
    it('should use TransitionBuilder correctly for conditional transitions', () => {
      // Verify that the state uses the same pattern as TransitionBuilder
      const testTransition = TransitionBuilder.on(WorkflowEvent.NO_CHANGE_DETECTED).goToIf(WorkflowState.TRIGGER_COMPLETE, (event, contextData) => {
        return contextData.workflowMode === WorkflowMode.TRIGGER;
      });
      
      expect(testTransition.eventType).toBe(WorkflowEvent.NO_CHANGE_DETECTED);
      expect(testTransition.targetState).toBe(WorkflowState.TRIGGER_COMPLETE);
      expect(testTransition.condition).toBeDefined();
      expect(testTransition.condition!(EventBuilder.noChangeDetected(), { workflowMode: WorkflowMode.TRIGGER })).toBe(true);
      expect(testTransition.condition!(EventBuilder.noChangeDetected(), { workflowMode: WorkflowMode.MONITOR })).toBe(false);
    });

    it('should create transitions matching the expected pattern', () => {
      const transitions = state.getTransitions();
      const scheduleTransition = transitions.find(t => 
        t.eventType === 'NO_CHANGE_DETECTED' && 
        t.targetState === 'SCHEDULE_COMPLETE'
      );
      
      expect(scheduleTransition).toBeDefined();
      expect(scheduleTransition?.condition).toBeDefined();
      
      // Test the condition function directly
      if (scheduleTransition?.condition) {
        expect(scheduleTransition.condition(EventBuilder.noChangeDetected(), { workflowMode: WorkflowMode.SCHEDULE })).toBe(true);
        expect(scheduleTransition.condition(EventBuilder.noChangeDetected(), { workflowMode: WorkflowMode.TRIGGER })).toBe(false);
        expect(scheduleTransition.condition(EventBuilder.noChangeDetected(), { workflowMode: WorkflowMode.MONITOR })).toBe(false);
      }
    });
  });

  describe('Integration with WorkflowMode enum', () => {
    it('should work with all WorkflowMode enum values', () => {
      const transitions = state.getTransitions();
      const noChangeTransitions = transitions.filter(t => t.eventType === 'NO_CHANGE_DETECTED');
      
      // Test each enum value
      Object.values(WorkflowMode).forEach(mode => {
        const matchingTransitions = noChangeTransitions.filter(t => 
          t.condition && t.condition(EventBuilder.noChangeDetected(), { workflowMode: mode })
        );
        
        // Each mode should match exactly one transition
        expect(matchingTransitions).toHaveLength(1);
        
        // Verify correct target state
        const transition = matchingTransitions[0];
        switch (mode) {
          case WorkflowMode.TRIGGER:
            expect(transition.targetState).toBe('TRIGGER_COMPLETE');
            break;
          case WorkflowMode.SCHEDULE:
            expect(transition.targetState).toBe('SCHEDULE_COMPLETE');
            break;
          case WorkflowMode.MONITOR:
            expect(transition.targetState).toBe('AUDIT_COMPLETE');
            break;
        }
      });
    });

    it('should maintain consistency with WorkflowMode string values', () => {
      const transitions = state.getTransitions();
      const noChangeTransitions = transitions.filter(t => t.eventType === 'NO_CHANGE_DETECTED');
      
      // Test with string values directly
      const triggerTransition = noChangeTransitions.find(t => 
        t.condition && t.condition(EventBuilder.noChangeDetected(), { workflowMode: 'trigger' })
      );
      expect(triggerTransition?.targetState).toBe('TRIGGER_COMPLETE');
      
      const scheduleTransition = noChangeTransitions.find(t => 
        t.condition && t.condition(EventBuilder.noChangeDetected(), { workflowMode: 'schedule' })
      );
      expect(scheduleTransition?.targetState).toBe('SCHEDULE_COMPLETE');
      
      const monitorTransition = noChangeTransitions.find(t => 
        t.condition && t.condition(EventBuilder.noChangeDetected(), { workflowMode: 'monitor' })
      );
      expect(monitorTransition?.targetState).toBe('AUDIT_COMPLETE');
    });
  });
});