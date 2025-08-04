import { Event } from './Event.js';
import { WorkflowEvent } from '../types/WorkflowEvent.js';
import { WorkflowState } from '../types/WorkflowState.js';

export interface Transition {
  eventType: WorkflowEvent | string;
  targetState: WorkflowState | string;
  condition?: (event: Event, context: Record<string, unknown>) => boolean;
}

export class TransitionBuilder {
  static create(
    eventType: WorkflowEvent | string,
    targetState: WorkflowState | string,
    condition?: (event: Event, context: Record<string, unknown>) => boolean
  ): Transition {
    return {
      eventType,
      targetState,
      condition,
    };
  }

  static on(eventType: WorkflowEvent | string): {
    goTo: (targetState: WorkflowState | string) => Transition;
    goToIf: (
      targetState: WorkflowState | string,
      condition: (event: Event, context: Record<string, unknown>) => boolean
    ) => Transition;
  } {
    return {
      goTo: (targetState: WorkflowState | string) =>
        this.create(eventType, targetState),
      goToIf: (
        targetState: WorkflowState | string,
        condition: (event: Event, context: Record<string, unknown>) => boolean
      ) => this.create(eventType, targetState, condition),
    };
  }
}
