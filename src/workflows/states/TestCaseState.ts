import { BaseState, StateContext } from '../../state-machine/State.js';
import { Event, EventBuilder } from '../../state-machine/Event.js';
import { Transition, TransitionBuilder } from '../../state-machine/Transition.js';
import { WorkflowState } from '../../types/WorkflowState.js';
import { WorkflowEvent } from '../../types/WorkflowEvent.js';

export class TestCaseState extends BaseState {
  constructor() {
    super(WorkflowState.TEST_CASE);
  }

  async execute(context: StateContext): Promise<Event | null> {
    // Log the test message as requested
    context.logger.info('Test case');

    // Immediately complete the test case
    return EventBuilder.create(WorkflowEvent.TEST_COMPLETE);
  }

  getTransitions(): Transition[] {
    return [
      TransitionBuilder.on(WorkflowEvent.TEST_COMPLETE).goTo(WorkflowState.TRIGGER_COMPLETE),
    ];
  }
}