/**
 * All possible workflow events that can trigger state transitions
 */
export enum WorkflowEvent {
  /** Scheduled time has been reached */
  SCHEDULE_REACHED = 'SCHEDULE_REACHED',

  /** Manual trigger has been initiated */
  MANUAL_TRIGGER = 'MANUAL_TRIGGER',

  /** Visual change detected in screenshots */
  VISUAL_CHANGE_DETECTED = 'VISUAL_CHANGE_DETECTED',

  /** No change detected in screenshots */
  NO_CHANGE_DETECTED = 'NO_CHANGE_DETECTED',

  /** Screenshots have been captured successfully */
  SCREENSHOTS_CAPTURED = 'SCREENSHOTS_CAPTURED',

  /** Recipe execution failed */
  EXECUTION_FAILED = 'EXECUTION_FAILED',

  /** Quality check passed */
  QUALITY_CHECK_PASSED = 'QUALITY_CHECK_PASSED',

  /** Quality check failed */
  QUALITY_CHECK_FAILED = 'QUALITY_CHECK_FAILED',

  /** Synchronization was successful */
  SYNC_SUCCESSFUL = 'SYNC_SUCCESSFUL',

  /** Synchronization failed */
  SYNC_FAILED = 'SYNC_FAILED',

  /** Workflow cycle is complete */
  CYCLE_COMPLETE = 'CYCLE_COMPLETE',
}

/**
 * Type guard to check if a string is a valid WorkflowEvent
 */
export function isValidWorkflowEvent(event: string): event is WorkflowEvent {
  return Object.values(WorkflowEvent).includes(event as WorkflowEvent);
}

/**
 * Get all available workflow events as an array
 */
export function getAllWorkflowEvents(): WorkflowEvent[] {
  return Object.values(WorkflowEvent);
}

/**
 * Get all available workflow events as strings
 */
export function getAllWorkflowEventStrings(): string[] {
  return Object.values(WorkflowEvent);
}
