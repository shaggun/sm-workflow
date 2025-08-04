import { BaseState, StateContext } from '../../state-machine/State.js';
import { Event, EventBuilder } from '../../state-machine/Event.js';
import { Transition, TransitionBuilder } from '../../state-machine/Transition.js';
import { ChangeDetectionSummary } from '../../monitoring/ChangeDetector.js';
import { WorkflowState } from '../../types/WorkflowState.js';
import { WorkflowEvent } from '../../types/WorkflowEvent.js';
import { promises as fs } from 'fs';
import path from 'path';

export class AuditCompleteState extends BaseState {
  constructor() {
    super(WorkflowState.AUDIT_COMPLETE);
  }

  async execute(context: StateContext): Promise<Event | null> {
    try {
      // Log cycle completion
      const isInitialRun = context.data.isInitialRun as boolean;
      const changeDetectionSummary = context.data.changeDetectionSummary as ChangeDetectionSummary;
      
      if (isInitialRun) {
        context.logger.info('🚀 Initial baseline creation completed successfully');
      } else if (changeDetectionSummary && changeDetectionSummary.changedImages > 0) {
        context.logger.info(`✅ Screenshot monitoring cycle completed - ${changeDetectionSummary.changedImages} changes processed`);
      } else {
        context.logger.info('✅ Screenshot monitoring cycle completed - no changes detected');
      }

      // Only generate audit summary for initial run or when there are changes
      const shouldGenerateAudit = isInitialRun || (changeDetectionSummary && changeDetectionSummary.changedImages > 0);
      if (shouldGenerateAudit) {
        await this.generateFinalAuditSummary(context);
      }

      // Clean up context data for next cycle
      this.cleanupContextData(context);

      // Add a small delay before transitioning back to monitoring
      await new Promise(resolve => setTimeout(resolve, 1000));

      return EventBuilder.cycleComplete();

    } catch (error) {
      context.logger.error(`Audit completion error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Still complete the cycle even if there's an error in cleanup
      return EventBuilder.cycleComplete();
    }
  }

  getTransitions(): Transition[] {
    return [
      TransitionBuilder.on(WorkflowEvent.CYCLE_COMPLETE).goTo(WorkflowState.MONITORING),
    ];
  }

  private async generateFinalAuditSummary(context: StateContext): Promise<void> {
    try {
      const summariesDir = './output/audit-summaries';
      await fs.mkdir(summariesDir, { recursive: true });

      const isInitialRun = context.data.isInitialRun as boolean;
      const startTime = context.data.cycleStartTime as Date || new Date();
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      const summary = {
        audit: {
          timestamp: endTime.toISOString(),
          type: isInitialRun ? 'initial_baseline' : 'monitoring_cycle',
          duration: {
            ms: duration,
            seconds: Math.round(duration / 1000),
            formatted: this.formatDuration(duration),
          },
        },
        results: {
          isInitialRun,
          screenshots: this.getScreenshotSummary(context),
          changes: this.getChangesSummary(context),
          quality: this.getQualitySummary(context),
        },
        files: {
          workflowSummary: context.data.workflowSummaryPath,
          qualityReport: context.data.qualityReportPath,
        },
        nextActions: this.getNextActions(context),
      };

      const timestamp = endTime.toISOString().replace(/[:.]/g, '-');
      const auditPath = path.join(summariesDir, `audit-complete-${timestamp}.json`);

      await fs.writeFile(auditPath, JSON.stringify(summary, null, 2), 'utf8');
      context.logger.info(`Final audit summary saved to ${auditPath}`);

    } catch (error) {
      context.logger.error(`Failed to generate audit summary: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  private getNextActions(context: StateContext): string[] {
    const actions: string[] = [];
    const isInitialRun = context.data.isInitialRun as boolean;
    
    if (isInitialRun) {
      actions.push('Baseline screenshots created - monitoring will begin on next cycle');
      actions.push('System ready for change detection');
    } else {
      const changeDetectionSummary = context.data.changeDetectionSummary as ChangeDetectionSummary;
      
      if (changeDetectionSummary && changeDetectionSummary.changedImages > 0) {
        actions.push('Baseline screenshots updated with detected changes');
        actions.push('Continue monitoring for further changes');
      } else {
        actions.push('No changes detected - continue monitoring');
      }
    }

    actions.push('Return to monitoring state for next scheduled check');
    
    return actions;
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
    // Clear data from previous cycle to prevent memory leaks
    const keysToClean = [
      'isInitialRun',
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

    // Set start time for next cycle
    context.data.cycleStartTime = new Date();
  }
}