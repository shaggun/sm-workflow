import { BaseState, StateContext } from '../../state-machine/State.js';
import { Event } from '../../state-machine/Event.js';
import { Transition } from '../../state-machine/Transition.js';
import { WorkflowMode } from '../../types/WorkflowMode.js';
import { promises as fs } from 'fs';

export class ScheduleCompleteState extends BaseState {
  constructor() {
    super('SCHEDULE_COMPLETE');
  }

  async execute(context: StateContext): Promise<Event | null> {
    const changeDetectionSummary = context.data.changeDetectionSummary;
    const currentScreenshots = context.data.currentScreenshots;
    const cycleStartTime = context.data.cycleStartTime as Date;

    // Calculate cycle duration
    const cycleDuration = new Date().getTime() - cycleStartTime.getTime();
    const durationMinutes = Math.round(cycleDuration / 1000 / 60 * 100) / 100;

    // Determine what was processed
    const screenshotCount = Array.isArray(currentScreenshots) ? currentScreenshots.length : 0;
    const changedCount = (changeDetectionSummary && typeof changeDetectionSummary === 'object' && 'changedImages' in changeDetectionSummary) 
      ? (changeDetectionSummary as { changedImages: number }).changedImages : 0;

    let completionMessage: string;
    if (screenshotCount === 0) {
      completionMessage = '✅ Scheduled run completed - no screenshots captured (target may be unavailable)';
    } else if (changedCount === 0) {
      completionMessage = `✅ Scheduled run completed - no changes detected in ${screenshotCount} screenshots`;
    } else {
      completionMessage = `✅ Scheduled run completed - ${changedCount} changes processed from ${screenshotCount} screenshots`;
    }

    context.logger.info(completionMessage);

    // Create audit summary
    const auditSummary = {
      mode: WorkflowMode.SCHEDULE,
      timestamp: new Date().toISOString(),
      cycleStartTime: cycleStartTime.toISOString(),
      cycleDurationMinutes: durationMinutes,
      screenshotCount,
      changedImages: changedCount,
      unchangedImages: screenshotCount - changedCount,
      averageChange: (changeDetectionSummary && typeof changeDetectionSummary === 'object' && 'averageChange' in changeDetectionSummary) 
        ? (changeDetectionSummary as { averageChange: number }).averageChange : 0,
      completed: true,
      completionMessage,
    };

    // Save audit summary
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const summaryPath = `output/audit-summaries/schedule-complete-${timestamp}.json`;
    
    try {
      await fs.mkdir('output/audit-summaries', { recursive: true });
      await fs.writeFile(summaryPath, JSON.stringify(auditSummary, null, 2));
      context.logger.info(`Schedule audit summary saved to ${summaryPath}`);
    } catch (error) {
      context.logger.error(`Failed to save audit summary: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Return null to indicate this is a terminal state
    return null;
  }

  getTransitions(): Transition[] {
    // No transitions - this is a terminal state
    return [];
  }
}