import { describe, it, expect } from 'vitest';
import { EventBuilder } from '../../../src/state-machine/Event.js';

describe('Event', () => {
  describe('EventBuilder', () => {
    it('should create a basic event', () => {
      const event = EventBuilder.create('TEST_EVENT');
      
      expect(event.type).toBe('TEST_EVENT');
      expect(event.payload).toBeUndefined();
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('should create an event with payload', () => {
      const payload = { key: 'value', count: 42 };
      const event = EventBuilder.create('TEST_EVENT', payload);
      
      expect(event.type).toBe('TEST_EVENT');
      expect(event.payload).toEqual(payload);
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('should create schedule reached event', () => {
      const event = EventBuilder.scheduleReached();
      
      expect(event.type).toBe('SCHEDULE_REACHED');
      expect(event.payload).toBeUndefined();
    });

    it('should create manual trigger event', () => {
      const event = EventBuilder.manualTrigger();
      
      expect(event.type).toBe('MANUAL_TRIGGER');
      expect(event.payload).toBeUndefined();
    });

    it('should create visual change detected event', () => {
      const changes = [{ file: 'test.png', difference: 0.5 }];
      const event = EventBuilder.visualChangeDetected(changes);
      
      expect(event.type).toBe('VISUAL_CHANGE_DETECTED');
      expect(event.payload).toEqual({ changes });
    });

    it('should create no change detected event', () => {
      const event = EventBuilder.noChangeDetected();
      
      expect(event.type).toBe('NO_CHANGE_DETECTED');
      expect(event.payload).toBeUndefined();
    });

    it('should create screenshots captured event', () => {
      const screenshots = [{ filename: 'test.png', path: '/test/test.png' }];
      const event = EventBuilder.screenshotsCaptured(screenshots);
      
      expect(event.type).toBe('SCREENSHOTS_CAPTURED');
      expect(event.payload).toEqual({ screenshots });
    });

    it('should create execution failed event', () => {
      const error = new Error('Test error');
      const event = EventBuilder.executionFailed(error);
      
      expect(event.type).toBe('EXECUTION_FAILED');
      expect(event.payload).toEqual({ error: 'Test error' });
    });

    it('should create quality check passed event', () => {
      const event = EventBuilder.qualityCheckPassed();
      
      expect(event.type).toBe('QUALITY_CHECK_PASSED');
      expect(event.payload).toBeUndefined();
    });

    it('should create quality check failed event', () => {
      const issues = ['Issue 1', 'Issue 2'];
      const event = EventBuilder.qualityCheckFailed(issues);
      
      expect(event.type).toBe('QUALITY_CHECK_FAILED');
      expect(event.payload).toEqual({ issues });
    });

    it('should create sync successful event', () => {
      const event = EventBuilder.syncSuccessful();
      
      expect(event.type).toBe('SYNC_SUCCESSFUL');
      expect(event.payload).toBeUndefined();
    });

    it('should create sync failed event', () => {
      const error = new Error('Sync error');
      const event = EventBuilder.syncFailed(error);
      
      expect(event.type).toBe('SYNC_FAILED');
      expect(event.payload).toEqual({ error: 'Sync error' });
    });

    it('should create cycle complete event', () => {
      const event = EventBuilder.cycleComplete();
      
      expect(event.type).toBe('CYCLE_COMPLETE');
      expect(event.payload).toBeUndefined();
    });
  });
});