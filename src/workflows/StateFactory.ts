import { BaseState } from '../state-machine/State.js';
import { MonitoringState } from './states/MonitoringState.js';
import { ChangeDetectionState } from './states/ChangeDetectionState.js';
import { RecipeExecutionState } from './states/RecipeExecutionState.js';
import { QualityAuditState } from './states/QualityAuditState.js';
import { DistributionState } from './states/DistributionState.js';
import { AuditCompleteState } from './states/AuditCompleteState.js';
import { TriggerCompleteState } from './states/TriggerCompleteState.js';
import { ScheduleCompleteState } from './states/ScheduleCompleteState.js';
import { WorkflowMode } from '../types/WorkflowMode.js';
import { WorkflowState } from '../types/WorkflowState.js';
import { promises as fs } from 'fs';
import path from 'path';

export interface WorkflowConfiguration {
  workflows: {
    [mode: string]: {
      initialState: WorkflowState | string;
      completionState: WorkflowState | string;
      states: (WorkflowState | string)[];
    };
  };
  stateMapping: {
    [stateName: string]: string;
  };
  completionStates: {
    [mode: string]: string;
  };
}

export class StateFactory {
  private static stateClasses = new Map<string, new () => BaseState>([
    ['MonitoringState', MonitoringState],
    ['ChangeDetectionState', ChangeDetectionState],
    ['RecipeExecutionState', RecipeExecutionState],
    ['QualityAuditState', QualityAuditState],
    ['DistributionState', DistributionState],
    ['AuditCompleteState', AuditCompleteState],
    ['TriggerCompleteState', TriggerCompleteState],
    ['ScheduleCompleteState', ScheduleCompleteState],
  ]);

  private static config: WorkflowConfiguration | null = null;

  /**
   * Load workflow configuration from file
   */
  static async loadConfiguration(): Promise<WorkflowConfiguration> {
    if (this.config) {
      return this.config;
    }

    const configPath = path.join(
      process.cwd(),
      'src/workflows/config/workflow-config.json'
    );

    try {
      const configContent = await fs.readFile(configPath, 'utf8');
      this.config = JSON.parse(configContent) as WorkflowConfiguration;
      return this.config;
    } catch (error) {
      throw new Error(
        `Failed to load workflow configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Create a state instance by class name
   */
  static createState(className: string): BaseState {
    const StateClass = this.stateClasses.get(className);

    if (!StateClass) {
      throw new Error(`Unknown state class: ${className}`);
    }

    return new StateClass();
  }

  /**
   * Create all states for a specific workflow mode
   */
  static async createStatesForMode(
    mode: WorkflowMode
  ): Promise<Map<WorkflowState | string, BaseState>> {
    const config = await this.loadConfiguration();
    const workflowConfig = config.workflows[mode];

    if (!workflowConfig) {
      throw new Error(
        `Unknown workflow mode: ${mode}. Available modes: ${Object.keys(config.workflows).join(', ')}`
      );
    }

    const states = new Map<WorkflowState | string, BaseState>();

    // Create states defined in the workflow
    for (const stateName of workflowConfig.states) {
      const className = config.stateMapping[stateName];

      if (!className) {
        throw new Error(`No class mapping found for state: ${stateName}`);
      }

      // Handle special completion state mapping
      if (stateName === 'AUDIT_COMPLETE') {
        const completionClassName = config.completionStates[mode];
        if (completionClassName) {
          states.set(stateName, this.createState(completionClassName));
          continue;
        }
      }

      states.set(stateName, this.createState(className));
    }

    return states;
  }

  /**
   * Get workflow configuration for a mode
   */
  static async getWorkflowConfig(mode: WorkflowMode): Promise<{
    initialState: WorkflowState | string;
    completionState: WorkflowState | string;
    states: (WorkflowState | string)[];
  }> {
    const config = await this.loadConfiguration();
    const workflowConfig = config.workflows[mode];

    if (!workflowConfig) {
      throw new Error(`Unknown workflow mode: ${mode}`);
    }

    return workflowConfig;
  }

  /**
   * Validate that all required states are available
   */
  static async validateConfiguration(): Promise<{
    isValid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    try {
      const config = await this.loadConfiguration();

      // Check that all mapped state classes exist
      for (const [stateName, className] of Object.entries(
        config.stateMapping
      )) {
        if (!this.stateClasses.has(className)) {
          errors.push(
            `State class not found: ${className} (mapped from ${stateName})`
          );
        }
      }

      // Check that all completion states exist
      for (const [mode, className] of Object.entries(config.completionStates)) {
        if (!this.stateClasses.has(className)) {
          errors.push(
            `Completion state class not found: ${className} (for mode ${mode})`
          );
        }
      }

      // Check that all workflow modes have valid states
      for (const [mode, workflowConfig] of Object.entries(config.workflows)) {
        for (const stateName of workflowConfig.states) {
          if (!config.stateMapping[stateName]) {
            errors.push(
              `No state mapping found for ${stateName} in ${mode} workflow`
            );
          }
        }
      }
    } catch (error) {
      errors.push(
        `Configuration loading failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Register a new state class (for extensibility)
   */
  static registerStateClass(
    className: string,
    StateClass: new () => BaseState
  ): void {
    this.stateClasses.set(className, StateClass);
  }

  /**
   * Get all available workflow modes
   */
  static async getAvailableModes(): Promise<WorkflowMode[]> {
    const config = await this.loadConfiguration();
    return Object.keys(config.workflows) as WorkflowMode[];
  }
}
