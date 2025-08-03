/**
 * Supported workflow execution modes
 */
export enum WorkflowMode {
  /** Continuous monitoring with scheduled intervals - loops indefinitely */
  MONITOR = 'monitor',

  /** Manual one-time trigger - starts immediately and exits */
  TRIGGER = 'trigger',

  /** Scheduled one-time execution - waits for schedule, runs once, then exits */
  SCHEDULE = 'schedule',
}

/**
 * Type guard to check if a string is a valid WorkflowMode
 */
export function isValidWorkflowMode(mode: string): mode is WorkflowMode {
  return Object.values(WorkflowMode).includes(mode as WorkflowMode);
}

/**
 * Get all available workflow modes as an array
 */
export function getAllWorkflowModes(): WorkflowMode[] {
  return Object.values(WorkflowMode);
}

/**
 * Get all available workflow modes as strings
 */
export function getAllWorkflowModeStrings(): string[] {
  return Object.values(WorkflowMode);
}
