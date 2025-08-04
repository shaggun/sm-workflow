import { describe, it, expect } from 'vitest';
import { TransitionBuilder } from '../../../src/state-machine/Transition.js';
import { EventBuilder } from '../../../src/state-machine/Event.js';

describe('Transition', () => {
  describe('TransitionBuilder', () => {
    it('should create a basic transition', () => {
      const transition = TransitionBuilder.create('TEST_EVENT', 'TARGET_STATE');
      
      expect(transition.eventType).toBe('TEST_EVENT');
      expect(transition.targetState).toBe('TARGET_STATE');
      expect(transition.condition).toBeUndefined();
    });

    it('should create a transition with condition', () => {
      const condition = () => true;
      const transition = TransitionBuilder.create('TEST_EVENT', 'TARGET_STATE', condition);
      
      expect(transition.eventType).toBe('TEST_EVENT');
      expect(transition.targetState).toBe('TARGET_STATE');
      expect(transition.condition).toBe(condition);
    });

    it('should create transition using builder pattern', () => {
      const transition = TransitionBuilder.on('TEST_EVENT').goTo('TARGET_STATE');
      
      expect(transition.eventType).toBe('TEST_EVENT');
      expect(transition.targetState).toBe('TARGET_STATE');
      expect(transition.condition).toBeUndefined();
    });

    it('should create conditional transition using builder pattern', () => {
      const condition = (event: any, context: any) => event.payload?.count > 5;
      const transition = TransitionBuilder.on('TEST_EVENT').goToIf('TARGET_STATE', condition);
      
      expect(transition.eventType).toBe('TEST_EVENT');
      expect(transition.targetState).toBe('TARGET_STATE');
      expect(transition.condition).toBe(condition);
    });

    it('should evaluate condition correctly', () => {
      const condition = (event: any, context: any) => event.payload?.count > 5;
      const transition = TransitionBuilder.on('TEST_EVENT').goToIf('TARGET_STATE', condition);
      
      const eventLow = EventBuilder.create('TEST_EVENT', { count: 3 });
      const eventHigh = EventBuilder.create('TEST_EVENT', { count: 10 });
      const context = {};
      
      expect(transition.condition!(eventLow, context)).toBe(false);
      expect(transition.condition!(eventHigh, context)).toBe(true);
    });

    it('should handle missing payload in condition', () => {
      const condition = (event: any, context: any) => event.payload?.count > 5;
      const transition = TransitionBuilder.on('TEST_EVENT').goToIf('TARGET_STATE', condition);
      
      const eventNoPayload = EventBuilder.create('TEST_EVENT');
      const context = {};
      
      expect(transition.condition!(eventNoPayload, context)).toBe(false);
    });
  });
});