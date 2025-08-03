import { BaseState, StateContext } from '../../state-machine/State.js';
import { Event, EventBuilder } from '../../state-machine/Event.js';
import { Transition, TransitionBuilder } from '../../state-machine/Transition.js';
import { QualityValidator, QualityConfig, QualityReport } from '../../screenshot/QualityValidator.js';
import { ScreenshotResult } from '../../screenshot/ScreenshotService.js';
import { promises as fs } from 'fs';
import path from 'path';

export class QualityAuditState extends BaseState {
  private qualityValidator: QualityValidator;
  private retryCount = 0;
  private readonly maxRetries = 1;

  constructor() {
    super('QUALITY_AUDIT');
    this.qualityValidator = new QualityValidator();
  }

  async execute(context: StateContext): Promise<Event | null> {
    try {
      const capturedScreenshots = context.data.capturedScreenshots as ScreenshotResult[] || [];
      const isInitialRun = context.data.isInitialRun as boolean;
      const changeDetectionSummary = context.data.changeDetectionSummary as any;
      const hasChanges = changeDetectionSummary && changeDetectionSummary.changedImages > 0;
      
      if (capturedScreenshots.length === 0) {
        context.logger.error('No screenshots to audit');
        return EventBuilder.qualityCheckFailed(['No screenshots provided for quality audit']);
      }

      const qualityConfig: QualityConfig = {
        minWidth: 320,
        maxWidth: 3840,
        minHeight: 240,
        maxHeight: 2160,
        maxFileSize: 10 * 1024 * 1024, // 10MB
        minFileSize: 1024, // 1KB
        requiredFormats: ['png', 'jpeg'],
        qualityThreshold: 80,
      };

      context.logger.info(`Starting quality audit for ${capturedScreenshots.length} screenshots`);

      // Validate all screenshots
      const qualityReports = await this.qualityValidator.validateMultipleScreenshots(
        capturedScreenshots,
        qualityConfig
      );

      // Analyze results
      const passedReports = qualityReports.filter(report => report.passed);
      const failedReports = qualityReports.filter(report => !report.passed);
      
      context.data.qualityReports = qualityReports;

      // Only generate quality report for initial run or when there are changes
      const shouldGenerateReport = isInitialRun || hasChanges;
      if (shouldGenerateReport) {
        await this.saveQualityReport(qualityReports, context);
      }

      // Determine if quality check passed
      const passRate = (passedReports.length / qualityReports.length) * 100;
      const minimumPassRate = 80; // 80% of screenshots must pass quality checks

      if (passRate >= minimumPassRate) {
        context.logger.info(`Quality audit passed: ${passedReports.length}/${qualityReports.length} screenshots passed (${Math.round(passRate)}%)`);
        this.retryCount = 0;
        return EventBuilder.qualityCheckPassed();
      } else {
        const issues = this.collectQualityIssues(failedReports);
        
        if (this.retryCount < this.maxRetries) {
          this.retryCount++;
          context.logger.info(`Quality audit failed (${Math.round(passRate)}% pass rate), retrying (attempt ${this.retryCount}/${this.maxRetries})`);
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000));
          return EventBuilder.qualityCheckFailed(issues);
        } else {
          context.logger.error(`Quality audit failed after ${this.maxRetries} retries: ${Math.round(passRate)}% pass rate`);
          this.retryCount = 0;
          return EventBuilder.qualityCheckFailed(issues);
        }
      }

    } catch (error) {
      context.logger.error(`Quality audit error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        await new Promise(resolve => setTimeout(resolve, 1000));
        return null; // Stay in current state to retry
      }

      this.retryCount = 0;
      return EventBuilder.qualityCheckFailed(['Quality audit system error']);
    }
  }

  getTransitions(): Transition[] {
    return [
      TransitionBuilder.on('QUALITY_CHECK_PASSED').goTo('DISTRIBUTION'),
      TransitionBuilder.on('QUALITY_CHECK_FAILED').goToIf('RECIPE_EXECUTION', (event, context) => {
        // Retry recipe execution if quality check failed and we haven't exhausted retries
        return this.retryCount < this.maxRetries;
      }),
      TransitionBuilder.on('QUALITY_CHECK_FAILED').goToIf('MONITORING', (event, context) => {
        // Go back to monitoring if we've exhausted retries
        return this.retryCount >= this.maxRetries;
      }),
    ];
  }

  private async saveQualityReport(qualityReports: QualityReport[], context: StateContext): Promise<void> {
    try {
      const reportsDir = './output/quality-reports';
      await fs.mkdir(reportsDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const reportPath = path.join(reportsDir, `quality-report-${timestamp}.json`);

      // Create JSON structure for the quality report
      const reportData = {
        timestamp: new Date().toISOString(),
        summary: {
          total: qualityReports.length,
          passed: qualityReports.filter(r => r.passed).length,
          failed: qualityReports.filter(r => !r.passed).length,
          averageScore: Math.round(
            qualityReports.reduce((sum, r) => sum + r.overallScore, 0) / qualityReports.length
          ),
        },
        reports: qualityReports.map(report => ({
          screenshot: {
            filename: report.screenshot.filename,
            url: report.screenshot.url,
            viewport: report.screenshot.viewport,
            format: report.screenshot.format,
            size: report.screenshot.size,
          },
          checks: report.checks,
          overallScore: report.overallScore,
          passed: report.passed,
          timestamp: report.timestamp,
        })),
      };

      await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2), 'utf8');
      context.logger.info(`Quality report saved to ${reportPath}`);
      
      context.data.qualityReportPath = reportPath;
    } catch (error) {
      context.logger.error(`Failed to save quality report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private collectQualityIssues(failedReports: QualityReport[]): string[] {
    const issues: string[] = [];

    for (const report of failedReports) {
      const failedChecks = report.checks.filter(check => !check.passed);
      for (const check of failedChecks) {
        issues.push(`${report.screenshot.filename}: ${check.message}`);
      }
    }

    return issues;
  }

  getQualityMetrics(reports: QualityReport[]) {
    if (reports.length === 0) {
      return {
        totalScreenshots: 0,
        passedScreenshots: 0,
        failedScreenshots: 0,
        averageScore: 0,
        passRate: 0,
      };
    }

    const passedScreenshots = reports.filter(r => r.passed).length;
    const failedScreenshots = reports.length - passedScreenshots;
    const averageScore = Math.round(
      reports.reduce((sum, r) => sum + r.overallScore, 0) / reports.length
    );
    const passRate = Math.round((passedScreenshots / reports.length) * 100);

    return {
      totalScreenshots: reports.length,
      passedScreenshots,
      failedScreenshots,
      averageScore,
      passRate,
    };
  }

  getRetryStatus(): { count: number; max: number } {
    return {
      count: this.retryCount,
      max: this.maxRetries,
    };
  }
}