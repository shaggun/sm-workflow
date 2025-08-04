import { BaseState, StateContext } from '../../state-machine/State.js';
import { Event, EventBuilder } from '../../state-machine/Event.js';
import { Transition, TransitionBuilder } from '../../state-machine/Transition.js';
import { ChangeDetector, ChangeDetectionSummary } from '../../monitoring/ChangeDetector.js';
import { ScreenshotResult } from '../../screenshot/ScreenshotService.js';
import { WorkflowMode } from '../../types/WorkflowMode.js';
import { WorkflowState } from '../../types/WorkflowState.js';
import { WorkflowEvent } from '../../types/WorkflowEvent.js';
import { promises as fs } from 'fs';
import path from 'path';

export class DistributionState extends BaseState {
  private changeDetector: ChangeDetector;
  private retryCount = 0;
  private readonly maxRetries = 2;

  constructor() {
    super(WorkflowState.DISTRIBUTION);
    this.changeDetector = new ChangeDetector();
  }

  async execute(context: StateContext): Promise<Event | null> {
    try {
      const isInitialRun = context.data.isInitialRun as boolean;
      const capturedScreenshots = context.data.capturedScreenshots as ScreenshotResult[] || [];

      if (isInitialRun) {
        // For initial run, screenshots are already in final directory
        context.logger.info(`Initial run completed - ${capturedScreenshots.length} baseline screenshots saved`);
        return EventBuilder.syncSuccessful();
      }

      // For subsequent runs, update baselines with changed screenshots
      const changeDetectionSummary = context.data.changeDetectionSummary as ChangeDetectionSummary;

      if (!changeDetectionSummary) {
        context.logger.error('No change detection summary found');
        return this.handleSyncFailure(new Error('Missing change detection data'));
      }

      const tempDir = './output/temp';
      const finalDir = './output/final';

      // Get list of changed files to update with proper mapping
      const changedFiles = changeDetectionSummary.results
        .filter((result: { hasChanged: boolean }) => result.hasChanged);

      if (changedFiles.length > 0) {
        // Update baselines with changed screenshots using consistent naming
        await this.updateBaselinesWithConsistentNaming(tempDir, finalDir, changedFiles);
        context.logger.info(`Updated ${changedFiles.length} baseline screenshots`);
      }

      // Clean up temporary files
      await this.changeDetector.cleanupTempFiles(tempDir);
      context.logger.info('Cleaned up temporary screenshot files');

      this.retryCount = 0;
      return EventBuilder.syncSuccessful();

    } catch (error) {
      return this.handleSyncFailure(error as Error);
    }
  }

  getTransitions(): Transition[] {
    return [
      TransitionBuilder.on(WorkflowEvent.SYNC_SUCCESSFUL).goToIf(WorkflowState.TRIGGER_COMPLETE, (event, contextData) => {
        // Go to trigger completion if in trigger mode
        return contextData.workflowMode === WorkflowMode.TRIGGER;
      }),
      TransitionBuilder.on(WorkflowEvent.SYNC_SUCCESSFUL).goToIf(WorkflowState.SCHEDULE_COMPLETE, (event, contextData) => {
        // Go to schedule completion if in schedule mode
        return contextData.workflowMode === WorkflowMode.SCHEDULE;
      }),
      TransitionBuilder.on(WorkflowEvent.SYNC_SUCCESSFUL).goToIf(WorkflowState.AUDIT_COMPLETE, (event, contextData) => {
        // Go to audit completion if in monitor mode
        return contextData.workflowMode === WorkflowMode.MONITOR;
      }),
      TransitionBuilder.on(WorkflowEvent.SYNC_FAILED).goToIf(WorkflowState.DISTRIBUTION, (event, contextData) => {
        // Retry if we haven't exhausted retries
        return this.retryCount < this.maxRetries;
      }),
      TransitionBuilder.on(WorkflowEvent.SYNC_FAILED).goToIf(WorkflowState.MONITORING, (event, contextData) => {
        // Go back to monitoring if we've exhausted retries
        return this.retryCount >= this.maxRetries;
      }),
    ];
  }

  private async handleSyncFailure(error: Error): Promise<Event> {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
      return EventBuilder.syncFailed(error);
    } else {
      this.retryCount = 0;
      return EventBuilder.syncFailed(error);
    }
  }

  getRetryStatus(): { count: number; max: number } {
    return {
      count: this.retryCount,
      max: this.maxRetries,
    };
  }

  private async updateBaselinesWithConsistentNaming(
    tempDir: string,
    finalDir: string,
    changedResults: any[]
  ): Promise<void> {
    await fs.mkdir(finalDir, { recursive: true });

    for (const result of changedResults) {
      try {
        const tempPath = result.currentPath;

        // Generate consistent baseline filename (remove timestamp if present)
        const baselineFilename = result.filename.includes('-') && result.filename.match(/-\d{4}-\d{2}-\d{2}T/)
          ? result.filename.replace(/-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z/, '') // Remove timestamp
          : result.filename;

        const finalPath = path.join(finalDir, baselineFilename);

        // Copy the temp file to final with consistent name, replacing existing
        await fs.copyFile(tempPath, finalPath);

        console.log(`Updated baseline: ${baselineFilename}`);
      } catch (error) {
        console.error(`Failed to update baseline for ${result.filename}:`, error);
      }
    }
  }

}