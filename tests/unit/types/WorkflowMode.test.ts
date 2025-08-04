import { describe, it, expect } from 'vitest';
import {
  WorkflowMode,
  isValidWorkflowMode,
  getAllWorkflowModes,
  getAllWorkflowModeStrings,
} from '../../../src/types/WorkflowMode.js';

describe('WorkflowMode', () => {
  describe('WorkflowMode enum', () => {
    it('should have correct enum values', () => {
      expect(WorkflowMode.MONITOR).toBe('monitor');
      expect(WorkflowMode.TRIGGER).toBe('trigger');
      expect(WorkflowMode.SCHEDULE).toBe('schedule');
    });

    it('should have exactly 3 workflow modes', () => {
      const modes = Object.values(WorkflowMode);
      expect(modes).toHaveLength(3);
      expect(modes).toContain('monitor');
      expect(modes).toContain('trigger');
      expect(modes).toContain('schedule');
    });
  });

  describe('isValidWorkflowMode', () => {
    it('should return true for valid workflow modes', () => {
      expect(isValidWorkflowMode('monitor')).toBe(true);
      expect(isValidWorkflowMode('trigger')).toBe(true);
      expect(isValidWorkflowMode('schedule')).toBe(true);
    });

    it('should return false for invalid workflow modes', () => {
      expect(isValidWorkflowMode('invalid')).toBe(false);
      expect(isValidWorkflowMode('MONITOR')).toBe(false);
      expect(isValidWorkflowMode('Monitor')).toBe(false);
      expect(isValidWorkflowMode('')).toBe(false);
      expect(isValidWorkflowMode('test')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isValidWorkflowMode(null as any)).toBe(false);
      expect(isValidWorkflowMode(undefined as any)).toBe(false);
      expect(isValidWorkflowMode(123 as any)).toBe(false);
      expect(isValidWorkflowMode({} as any)).toBe(false);
      expect(isValidWorkflowMode([] as any)).toBe(false);
    });

    it('should handle whitespace and special characters', () => {
      expect(isValidWorkflowMode(' monitor ')).toBe(false);
      expect(isValidWorkflowMode('monitor\n')).toBe(false);
      expect(isValidWorkflowMode('mon-itor')).toBe(false);
      expect(isValidWorkflowMode('monitor_mode')).toBe(false);
    });
  });

  describe('getAllWorkflowModes', () => {
    it('should return all WorkflowMode enum values', () => {
      const modes = getAllWorkflowModes();
      
      expect(modes).toHaveLength(3);
      expect(modes).toContain(WorkflowMode.MONITOR);
      expect(modes).toContain(WorkflowMode.TRIGGER);
      expect(modes).toContain(WorkflowMode.SCHEDULE);
    });

    it('should return array of WorkflowMode enum types', () => {
      const modes = getAllWorkflowModes();
      
      modes.forEach(mode => {
        expect(Object.values(WorkflowMode)).toContain(mode);
      });
    });
  });

  describe('getAllWorkflowModeStrings', () => {
    it('should return all workflow mode strings', () => {
      const modeStrings = getAllWorkflowModeStrings();
      
      expect(modeStrings).toHaveLength(3);
      expect(modeStrings).toContain('monitor');
      expect(modeStrings).toContain('trigger');
      expect(modeStrings).toContain('schedule');
    });

    it('should return array of strings', () => {
      const modeStrings = getAllWorkflowModeStrings();
      
      modeStrings.forEach(mode => {
        expect(typeof mode).toBe('string');
      });
    });

    it('should match enum values when converted to strings', () => {
      const modeStrings = getAllWorkflowModeStrings();
      const enumValues = Object.values(WorkflowMode);
      
      expect(modeStrings.sort()).toEqual(enumValues.sort());
    });
  });

  describe('type safety', () => {
    it('should work as TypeScript enum', () => {
      const testMode: WorkflowMode = WorkflowMode.MONITOR;
      expect(testMode).toBe('monitor');
      
      // Test that enum can be used in switch statements
      function getActionForMode(mode: WorkflowMode): string {
        switch (mode) {
          case WorkflowMode.MONITOR:
            return 'monitoring';
          case WorkflowMode.TRIGGER:
            return 'triggering';
          case WorkflowMode.SCHEDULE:
            return 'scheduling';
          default:
            return 'unknown';
        }
      }
      
      expect(getActionForMode(WorkflowMode.MONITOR)).toBe('monitoring');
      expect(getActionForMode(WorkflowMode.TRIGGER)).toBe('triggering');
      expect(getActionForMode(WorkflowMode.SCHEDULE)).toBe('scheduling');
    });

    it('should work with string comparisons', () => {
      expect(WorkflowMode.MONITOR).toBe('monitor');
      expect(WorkflowMode.TRIGGER).toBe('trigger');
      expect(WorkflowMode.SCHEDULE).toBe('schedule');
    });
  });
});