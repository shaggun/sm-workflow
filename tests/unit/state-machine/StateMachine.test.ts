import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateMachine, StateMachineConfig } from '../../../src/state-machine/StateMachine.js';
import { BaseState, StateContext } from '../../../src/state-machine/State.js';
import { Event, EventBuilder } from '../../../src/state-machine/Event.js';
import { TransitionBuilder } from '../../../src/state-machine/Transition.js';

class TestState extends BaseState {
  constructor(name: string, private executeReturn: Event | null = null) {
    super(name);
  }

  async execute(context: StateContext): Promise<Event | null> {
    return this.executeReturn;
  }

  getTransitions() {
    return [
      TransitionBuilder.on('TEST_EVENT').goTo('STATE_B'),
      TransitionBuilder.on('COMPLETE').goTo('STATE_C'),
    ];
  }
}

class CompleteState extends BaseState {
  constructor() {
    super('STATE_C');
  }

  async execute(context: StateContext): Promise<Event | null> {
    return null; // Stay in this state
  }

  getTransitions() {
    return [];
  }
}

describe('StateMachine', () => {
  let mockLogger: any;
  let context: StateContext;
  let states: Map<string, any>;
  let config: StateMachineConfig;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    context = {
      config: {},
      data: {},
      logger: mockLogger,
    };

    states = new Map();
    states.set('STATE_A', new TestState('STATE_A', EventBuilder.create('TEST_EVENT')));
    states.set('STATE_B', new TestState('STATE_B', EventBuilder.create('COMPLETE')));
    states.set('STATE_C', new CompleteState());

    config = {
      initialState: 'STATE_A',
      states,
      context,
    };
  });

  it('should create a state machine', () => {
    const stateMachine = new StateMachine(config);
    
    expect(stateMachine.getCurrentStateName()).toBeNull();
    expect(stateMachine.isStateMachineRunning()).toBe(false);
  });

  it('should start with initial state', async () => {
    const stateMachine = new StateMachine(config);
    
    // Mock the enter and execute methods to prevent infinite loop
    const stateA = states.get('STATE_A');
    vi.spyOn(stateA, 'execute').mockResolvedValue(null);
    
    const startPromise = stateMachine.start();
    
    // Give it a moment to start
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(stateMachine.getCurrentStateName()).toBe('STATE_A');
    expect(stateMachine.isStateMachineRunning()).toBe(true);
    
    await stateMachine.stop();
    await startPromise.catch(() => {}); // Ignore errors from stopping
  });

  it('should throw error if initial state not found', async () => {
    const invalidConfig = {
      ...config,
      initialState: 'INVALID_STATE',
    };
    
    const stateMachine = new StateMachine(invalidConfig);
    
    await expect(stateMachine.start()).rejects.toThrow("Initial state 'INVALID_STATE' not found");
  });

  it('should throw error if already running', async () => {
    const stateMachine = new StateMachine(config);
    
    // Mock execute to prevent infinite loop
    const stateA = states.get('STATE_A');
    vi.spyOn(stateA, 'execute').mockResolvedValue(null);
    
    const startPromise = stateMachine.start();
    
    // Give it a moment to start
    await new Promise(resolve => setTimeout(resolve, 10));
    
    await expect(stateMachine.start()).rejects.toThrow('State machine is already running');
    
    await stateMachine.stop();
    await startPromise.catch(() => {});
  });

  it('should stop gracefully', async () => {
    const stateMachine = new StateMachine(config);
    
    // Mock execute to prevent infinite loop
    const stateA = states.get('STATE_A');
    vi.spyOn(stateA, 'execute').mockResolvedValue(null);
    
    const startPromise = stateMachine.start();
    
    // Give it a moment to start
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(stateMachine.isStateMachineRunning()).toBe(true);
    
    await stateMachine.stop();
    
    expect(stateMachine.isStateMachineRunning()).toBe(false);
    
    await startPromise.catch(() => {});
  });

  it('should handle state transitions', async () => {
    const stateMachine = new StateMachine(config);
    
    // Set up states to transition properly with controlled execution
    const stateA = states.get('STATE_A');
    const stateB = states.get('STATE_B');
    const stateC = states.get('STATE_C');
    
    let executeCount = 0;
    const executeSpy = vi.spyOn(stateA, 'execute').mockImplementation(async () => {
      executeCount++;
      if (executeCount === 1) {
        return EventBuilder.create('TEST_EVENT');
      }
      // Stop execution after first transition to prevent infinite loop
      await stateMachine.stop();
      return null;
    });
    
    const stateBSpy = vi.spyOn(stateB, 'execute').mockImplementation(async () => {
      // Immediately trigger completion and stop
      setTimeout(() => stateMachine.stop(), 5);
      return EventBuilder.create('COMPLETE');
    });
    
    vi.spyOn(stateC, 'execute').mockResolvedValue(null);
    
    const startPromise = stateMachine.start();
    
    // Wait for controlled execution
    await new Promise(resolve => setTimeout(resolve, 30));
    
    // Verify transitions occurred
    expect(executeSpy).toHaveBeenCalled();
    expect(stateBSpy).toHaveBeenCalled();
    
    await stateMachine.stop();
    await startPromise.catch(() => {});
  });

  it('should handle transition to non-existent state', async () => {
    const stateWithBadTransition = new TestState('STATE_A');
    stateWithBadTransition.getTransitions = () => [
      TransitionBuilder.on('TEST_EVENT').goTo('NON_EXISTENT_STATE'),
    ];
    
    states.set('STATE_A', stateWithBadTransition);
    
    const stateMachine = new StateMachine(config);
    
    let executed = false;
    vi.spyOn(stateWithBadTransition, 'execute').mockImplementation(async () => {
      if (!executed) {
        executed = true;
        // Stop after first execution to prevent memory issues
        setTimeout(() => stateMachine.stop(), 10);
        return EventBuilder.create('TEST_EVENT');
      }
      return null;
    });
    
    const startPromise = stateMachine.start();
    
    // Wait for controlled execution
    await new Promise(resolve => setTimeout(resolve, 25));
    
    // Verify error was logged
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("Target state 'NON_EXISTENT_STATE' not found")
    );
    
    await stateMachine.stop();
    await startPromise.catch(() => {});
  });

  it('should handle state execution errors', async () => {
    const errorState = new TestState('STATE_A');
    let errorThrown = false;
    vi.spyOn(errorState, 'execute').mockImplementation(async () => {
      if (!errorThrown) {
        errorThrown = true;
        // Stop machine after error to prevent memory issues
        setTimeout(() => stateMachine.stop(), 10);
        throw new Error('State execution error');
      }
      return null;
    });
    
    states.set('STATE_A', errorState);
    
    const stateMachine = new StateMachine(config);
    
    const startPromise = stateMachine.start();
    
    // Wait for controlled error handling
    await new Promise(resolve => setTimeout(resolve, 25));
    
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('State execution error')
    );
    
    await stateMachine.stop();
    await startPromise.catch(() => {});
  });
});