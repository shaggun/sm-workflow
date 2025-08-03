import { Event } from './Event.js';

export interface Transition {
  eventType: string;
  targetState: string;
  condition?: (event: Event, context: Record<string, unknown>) => boolean;
}

export class TransitionBuilder {
  static create(
    eventType: string,
    targetState: string,
    condition?: (event: Event, context: Record<string, unknown>) => boolean
  ): Transition {
    return {
      eventType,
      targetState,
      condition,
    };
  }

  static on(eventType: string): {
    goTo: (targetState: string) => Transition;
    goToIf: (
      targetState: string,
      condition: (event: Event, context: Record<string, unknown>) => boolean
    ) => Transition;
  } {
    return {
      goTo: (targetState: string) => this.create(eventType, targetState),
      goToIf: (
        targetState: string,
        condition: (event: Event, context: Record<string, unknown>) => boolean
      ) => this.create(eventType, targetState, condition),
    };
  }
}
