import { Event } from './Event.js';
import { State, StateContext, BaseState } from './State.js';
import { Transition } from './Transition.js';
import { WorkflowState } from '../types/WorkflowState.js';

export interface StateMachineConfig {
  initialState: WorkflowState | string;
  states: Map<WorkflowState | string, State>;
  context: StateContext;
}

export class StateMachine {
  private currentState: State | null = null;
  private readonly states: Map<WorkflowState | string, State>;
  private readonly context: StateContext;
  private isRunning = false;

  constructor(private readonly config: StateMachineConfig) {
    this.states = config.states;
    this.context = config.context;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('State machine is already running');
    }

    const initialState = this.states.get(this.config.initialState);
    if (!initialState) {
      throw new Error(`Initial state '${this.config.initialState}' not found`);
    }

    this.isRunning = true;
    this.currentState = initialState;

    try {
      await this.currentState.enter(this.context);
      await this.runStateMachine();
    } catch (error) {
      this.context.logger.error(
        `State machine error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.currentState) {
      await this.currentState.exit(this.context);
    }
  }

  getCurrentStateName(): string | null {
    return this.currentState?.name || null;
  }

  getCurrentState(): BaseState | null {
    return this.currentState || null;
  }

  isStateMachineRunning(): boolean {
    return this.isRunning;
  }

  private async runStateMachine(): Promise<void> {
    while (this.isRunning && this.currentState) {
      try {
        const event = await this.currentState.execute(this.context);

        if (!event) {
          // Check if current state has no transitions (terminal state)
          const transitions = this.currentState.getTransitions();
          if (transitions.length === 0) {
            this.context.logger.info(
              `Terminal state '${this.currentState.name}' reached - stopping state machine`
            );
            this.isRunning = false;
            break;
          }

          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }

        const transition = this.findTransition(this.currentState, event);
        if (transition) {
          await this.executeTransition(transition, event);
        } else {
          this.context.logger.debug(
            `No transition found for event '${event.type}' in state '${this.currentState.name}'`
          );
        }
      } catch (error) {
        this.context.logger.error(
          `Error in state '${this.currentState.name}': ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  private findTransition(state: State, event: Event): Transition | null {
    const transitions = state.getTransitions();
    return (
      transitions.find(transition => {
        if (transition.eventType !== event.type) {
          return false;
        }

        if (transition.condition) {
          return transition.condition(event, this.context.data);
        }

        return true;
      }) || null
    );
  }

  private async executeTransition(
    transition: Transition,
    event: Event
  ): Promise<void> {
    if (!this.currentState) {
      return;
    }

    const targetState = this.states.get(transition.targetState);
    if (!targetState) {
      this.context.logger.error(
        `Target state '${transition.targetState}' not found`
      );
      return;
    }

    this.context.logger.info(
      `Transitioning from '${this.currentState.name}' to '${targetState.name}' on event '${event.type}'`
    );

    await this.currentState.exit(this.context);
    this.currentState = targetState;
    await this.currentState.enter(this.context);
  }
}
