export interface Event {
  type: string;
  payload?: Record<string, unknown>;
  timestamp: Date;
}

export class EventBuilder {
  static create(type: string, payload?: Record<string, unknown>): Event {
    return {
      type,
      payload,
      timestamp: new Date(),
    };
  }

  static scheduleReached(): Event {
    return this.create('SCHEDULE_REACHED');
  }

  static manualTrigger(): Event {
    return this.create('MANUAL_TRIGGER');
  }

  static visualChangeDetected(changes: unknown[]): Event {
    return this.create('VISUAL_CHANGE_DETECTED', { changes });
  }

  static noChangeDetected(): Event {
    return this.create('NO_CHANGE_DETECTED');
  }

  static screenshotsCaptured(screenshots: unknown[]): Event {
    return this.create('SCREENSHOTS_CAPTURED', { screenshots });
  }

  static executionFailed(error: Error): Event {
    return this.create('EXECUTION_FAILED', { error: error.message });
  }

  static qualityCheckPassed(): Event {
    return this.create('QUALITY_CHECK_PASSED');
  }

  static qualityCheckFailed(issues: unknown[]): Event {
    return this.create('QUALITY_CHECK_FAILED', { issues });
  }

  static syncSuccessful(): Event {
    return this.create('SYNC_SUCCESSFUL');
  }

  static syncFailed(error: Error): Event {
    return this.create('SYNC_FAILED', { error: error.message });
  }

  static cycleComplete(): Event {
    return this.create('CYCLE_COMPLETE');
  }
}
