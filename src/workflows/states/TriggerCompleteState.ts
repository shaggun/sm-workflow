import { BaseState, StateContext } from '../../state-machine/State.js';
import { Event, EventBuilder } from '../../state-machine/Event.js';
import { Transition } from '../../state-machine/Transition.js';
import { ChangeDetectionSummary } from '../../monitoring/ChangeDetector.js';
import { promises as fs } from 'fs';
import path from 'path';

export class TriggerCompleteState extends BaseState {
  constructor() {
    super('TRIGGER_COMPLETE');
  }

  async execute(context: StateContext): Promise<Event | null> {
    try {
      // Log trigger completion
      const changeDetectionSummary = context.data.changeDetectionSummary as ChangeDetectionSummary;

      if (changeDetectionSummary && changeDetectionSummary.changedImages > 0) {
        context.logger.info(`✅ Manual trigger completed - ${changeDetectionSummary.changedImages} changes processed`);
      } else {
        context.logger.info('✅ Manual trigger completed - no changes detected');
      }

      // Generate audit summary for trigger results
      await this.generateTriggerAuditSummary(context);

      // Clean up context data
      this.cleanupContextData(context);

      // Stop the state machine by returning null (no further transitions)
      return null;

    } catch (error) {
      context.logger.error(`Trigger completion error: ${error instanceof Error ? error.message : 'Unknown error'}`);

      // Still complete the trigger even if there's an error
      return null;
    }
  }

  getTransitions(): Transition[] {
    // No transitions - this is a terminal state for trigger mode
    return [];
  }

  private async generateTriggerAuditSummary(context: StateContext): Promise<void> {
    try {
      const summariesDir = './output/audit-summaries';
      await fs.mkdir(summariesDir, { recursive: true });

      const startTime = context.data.cycleStartTime as Date || new Date();
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      const summary = {
        audit: {
          timestamp: endTime.toISOString(),
          type: 'manual_trigger',
          duration: {
            ms: duration,
            seconds: Math.round(duration / 1000),
            formatted: this.formatDuration(duration),
          },
        },
        results: {
          triggerMode: true,
          screenshots: this.getScreenshotSummary(context),
          changes: this.getChangesSummary(context),
          quality: this.getQualitySummary(context),
        },
        files: {
          workflowSummary: context.data.workflowSummaryPath,
          qualityReport: context.data.qualityReportPath,
        },
        nextActions: ['Manual trigger completed successfully', 'State machine stopped'],
      };

      const timestamp = endTime.toISOString().replace(/[:.]/g, '-');
      const auditPath = path.join(summariesDir, `trigger-complete-${timestamp}.json`);

      await fs.writeFile(auditPath, JSON.stringify(summary, null, 2), 'utf8');
      context.logger.info(`Trigger audit summary saved to ${auditPath}`);

    } catch (error) {
      context.logger.error(`Failed to generate trigger audit summary: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private getScreenshotSummary(context: StateContext) {
    const capturedScreenshots = context.data.capturedScreenshots as any[] || [];

    return {
      total: capturedScreenshots.length,
      formats: [...new Set(capturedScreenshots.map(s => s.format))],
      viewports: [...new Set(capturedScreenshots.map(s => `${s.viewport.width}x${s.viewport.height}`))],
      totalSize: capturedScreenshots.reduce((sum, s) => sum + (s.size || 0), 0),
    };
  }

  private getChangesSummary(context: StateContext) {
    const changeDetectionSummary = context.data.changeDetectionSummary as ChangeDetectionSummary;

    if (!changeDetectionSummary) {
      return null;
    }

    return {
      totalImages: changeDetectionSummary.totalImages,
      changedImages: changeDetectionSummary.changedImages,
      unchangedImages: changeDetectionSummary.unchangedImages,
      averageChange: changeDetectionSummary.averageChange,
      changePercentage: changeDetectionSummary.totalImages > 0
        ? Math.round((changeDetectionSummary.changedImages / changeDetectionSummary.totalImages) * 100)
        : 0,
    };
  }

  private getQualitySummary(context: StateContext) {
    const qualityReports = context.data.qualityReports as any[] || [];

    if (qualityReports.length === 0) {
      return null;
    }

    const passed = qualityReports.filter(r => r.passed).length;
    const failed = qualityReports.length - passed;
    const averageScore = Math.round(
      qualityReports.reduce((sum, r) => sum + r.overallScore, 0) / qualityReports.length
    );

    return {
      total: qualityReports.length,
      passed,
      failed,
      passRate: Math.round((passed / qualityReports.length) * 100),
      averageScore,
    };
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  private cleanupContextData(context: StateContext): void {
    // Clear data from trigger run
    const keysToClean = [
      'currentScreenshots',
      'capturedScreenshots',
      'changeDetectionSummary',
      'qualityReports',
      'recipeResults',
      'qualityReportPath',
      'workflowSummaryPath',
      'triggerType',
    ];

    keysToClean.forEach(key => {
      delete context.data[key];
    });
  }
}