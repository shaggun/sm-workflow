import { StateContext } from '../state-machine/State.js';
import { StateMachineConfig } from '../state-machine/StateMachine.js';
import { StateFactory } from './StateFactory.js';
import { WorkflowMode } from '../types/WorkflowMode.js';

export interface WorkflowBuildOptions {
  mode: WorkflowMode;
  config: Record<string, unknown>;
  logger: {
    info: (message: string) => void;
    error: (message: string) => void;
    debug: (message: string) => void;
  };
  initialData?: Record<string, unknown>;
}

export class WorkflowBuilder {
  /**
   * Build a complete workflow configuration for a given mode
   */
  static async buildWorkflow(
    options: WorkflowBuildOptions
  ): Promise<StateMachineConfig> {
    const { mode, config, logger, initialData = {} } = options;

    // Validate the workflow configuration
    const validation = await StateFactory.validateConfiguration();
    if (!validation.isValid) {
      throw new Error(
        `Workflow configuration invalid: ${validation.errors.join(', ')}`
      );
    }

    // Get workflow configuration for this mode
    const workflowConfig = await StateFactory.getWorkflowConfig(mode);

    // Create states for this mode
    const states = await StateFactory.createStatesForMode(mode);

    // Create state context
    const context: StateContext = {
      config,
      data: {
        cycleStartTime: new Date(),
        workflowMode: mode,
        ...initialData,
      },
      logger,
    };

    // Return state machine configuration
    return {
      initialState: workflowConfig.initialState,
      states,
      context,
    };
  }

  /**
   * Validate workflow dependencies and flow
   */
  static async validateWorkflowFlow(
    mode: WorkflowMode
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      const workflowConfig = await StateFactory.getWorkflowConfig(mode);
      const states = await StateFactory.createStatesForMode(mode);

      // Check that initial state exists
      if (!states.has(workflowConfig.initialState)) {
        errors.push(
          `Initial state ${workflowConfig.initialState} not found in state map`
        );
      }

      // Check that completion state exists
      if (!states.has(workflowConfig.completionState)) {
        errors.push(
          `Completion state ${workflowConfig.completionState} not found in state map`
        );
      }

      // Validate that all states can be instantiated
      for (const [stateName, stateInstance] of states) {
        try {
          // Test that state has required methods
          if (typeof stateInstance.execute !== 'function') {
            errors.push(`State ${stateName} missing execute method`);
          }
          if (typeof stateInstance.getTransitions !== 'function') {
            errors.push(`State ${stateName} missing getTransitions method`);
          }
        } catch (error) {
          errors.push(
            `State ${stateName} instantiation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    } catch (error) {
      errors.push(
        `Workflow validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get workflow summary information
   */
  static async getWorkflowSummary(mode: WorkflowMode): Promise<{
    mode: WorkflowMode;
    initialState: string;
    completionState: string;
    stateCount: number;
    states: string[];
  }> {
    const workflowConfig = await StateFactory.getWorkflowConfig(mode);

    return {
      mode,
      initialState: workflowConfig.initialState,
      completionState: workflowConfig.completionState,
      stateCount: workflowConfig.states.length,
      states: [...workflowConfig.states],
    };
  }

  /**
   * List all available workflow modes with their configurations
   */
  static async listAllWorkflows(): Promise<
    Array<{
      mode: WorkflowMode;
      initialState: string;
      completionState: string;
      stateCount: number;
      states: string[];
    }>
  > {
    const modes = await StateFactory.getAvailableModes();
    const workflows = [];

    for (const mode of modes) {
      workflows.push(await this.getWorkflowSummary(mode));
    }

    return workflows;
  }
}
