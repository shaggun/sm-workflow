import { Event } from './Event.js';
import { Transition } from './Transition.js';

export interface State {
  name: string;
  enter(context: StateContext): Promise<void>;
  execute(context: StateContext): Promise<Event | null>;
  exit(context: StateContext): Promise<void>;
  getTransitions(): Transition[];
}

export interface StateContext {
  config: Record<string, unknown>;
  data: Record<string, unknown>;
  logger: {
    info: (message: string) => void;
    error: (message: string) => void;
    debug: (message: string) => void;
  };
}

export abstract class BaseState implements State {
  constructor(public readonly name: string) {}

  async enter(context: StateContext): Promise<void> {
    await Promise.resolve(); // Make this actually async
    context.logger.info(`Entering state: ${this.name}`);
  }

  abstract execute(context: StateContext): Promise<Event | null>;

  async exit(context: StateContext): Promise<void> {
    await Promise.resolve(); // Make this actually async
    context.logger.info(`Exiting state: ${this.name}`);
  }

  abstract getTransitions(): Transition[];
}
