/**
 * All possible workflow states in the state machine
 */
export enum WorkflowState {
  /** Initial monitoring state - waits for schedule or manual trigger */
  MONITORING = 'MONITORING',

  /** Change detection state - compares current vs baseline screenshots */
  CHANGE_DETECTION = 'CHANGE_DETECTION',

  /** Recipe execution state - runs automation scripts */
  RECIPE_EXECUTION = 'RECIPE_EXECUTION',

  /** Quality audit state - validates execution results */
  QUALITY_AUDIT = 'QUALITY_AUDIT',

  /** Distribution state - syncs results to external systems */
  DISTRIBUTION = 'DISTRIBUTION',

  /** Audit complete state - finalizes monitoring cycle */
  AUDIT_COMPLETE = 'AUDIT_COMPLETE',

  /** Trigger complete state - terminal state for trigger mode */
  TRIGGER_COMPLETE = 'TRIGGER_COMPLETE',

  /** Schedule complete state - terminal state for schedule mode */
  SCHEDULE_COMPLETE = 'SCHEDULE_COMPLETE',
}
