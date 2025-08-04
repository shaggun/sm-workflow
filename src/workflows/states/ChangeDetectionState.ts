import { BaseState, StateContext } from '../../state-machine/State.js';
import { Event, EventBuilder } from '../../state-machine/Event.js';
import { Transition, TransitionBuilder } from '../../state-machine/Transition.js';
import { ChangeDetector, ChangeDetectionOptions } from '../../monitoring/ChangeDetector.js';
import { ScreenshotService, ScreenshotOptions } from '../../screenshot/ScreenshotService.js';
import { WorkflowMode } from '../../types/WorkflowMode.js';
import { WorkflowState } from '../../types/WorkflowState.js';
import { WorkflowEvent } from '../../types/WorkflowEvent.js';
import { promises as fs } from 'fs';
import path from 'path';

export class ChangeDetectionState extends BaseState {
  private changeDetector: ChangeDetector;
  private screenshotService: ScreenshotService;

  constructor() {
    super(WorkflowState.CHANGE_DETECTION);
    this.changeDetector = new ChangeDetector();
    this.screenshotService = new ScreenshotService();
  }

  async enter(context: StateContext): Promise<void> {
    await super.enter(context);
    await this.screenshotService.initialize();
  }

  async execute(context: StateContext): Promise<Event | null> {
    try {
      const config = context.config as {
        recipes?: Array<{ steps: Array<{ url: string; filename: string }> }>;
        screenshots?: ScreenshotOptions;
        changeDetection?: ChangeDetectionOptions;
      };

      const finalDir = './output/final';
      const tempDir = './output/temp';
      
      // Ensure directories exist
      await fs.mkdir(finalDir, { recursive: true });
      await fs.mkdir(tempDir, { recursive: true });

      // Check if baseline screenshots exist
      const hasBaselines = await this.hasBaselineScreenshots(finalDir);
      
      if (!hasBaselines) {
        context.logger.info('No baseline screenshots found - creating initial baselines');
        context.data.isInitialRun = true;
        // For initial run, we capture directly to final directory with consistent names
        const screenshots = await this.captureCurrentScreenshots(finalDir, config, false);
        context.data.currentScreenshots = screenshots;
        return EventBuilder.visualChangeDetected([]);
      }

      // Capture current screenshots for comparison in temp directory
      const screenshots = await this.captureCurrentScreenshots(tempDir, config, true);
      
      if (screenshots.length === 0) {
        context.logger.info('No screenshots captured - target may be unavailable');
        return EventBuilder.noChangeDetected();
      }

      // Compare with baselines using consistent naming
      const changeDetectionConfig = config.changeDetection || {};
      const summary = await this.compareWithBaselines(finalDir, tempDir, screenshots, changeDetectionConfig);

      context.data.changeDetectionSummary = summary;
      context.data.currentScreenshots = screenshots;

      if (summary.changedImages > 0) {
        context.logger.info(`Visual changes detected in ${summary.changedImages} screenshots`);
        return EventBuilder.visualChangeDetected(summary.results.filter(r => r.hasChanged));
      } else {
        context.logger.info('No visual changes detected');
        // Clean up temp files since no changes
        await this.changeDetector.cleanupTempFiles(tempDir);
        return EventBuilder.noChangeDetected();
      }

    } catch (error) {
      context.logger.error(`Change detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return EventBuilder.noChangeDetected();
    }
  }

  async exit(context: StateContext): Promise<void> {
    await this.screenshotService.cleanup();
    await super.exit(context);
  }

  getTransitions(): Transition[] {
    return [
      TransitionBuilder.on(WorkflowEvent.VISUAL_CHANGE_DETECTED).goTo(WorkflowState.RECIPE_EXECUTION),
      TransitionBuilder.on(WorkflowEvent.NO_CHANGE_DETECTED).goToIf(WorkflowState.TRIGGER_COMPLETE, (event, contextData) => {
        // Go to trigger completion if in trigger mode
        return contextData.workflowMode === WorkflowMode.TRIGGER;
      }),
      TransitionBuilder.on(WorkflowEvent.NO_CHANGE_DETECTED).goToIf(WorkflowState.SCHEDULE_COMPLETE, (event, contextData) => {
        // Go to schedule completion if in schedule mode
        return contextData.workflowMode === WorkflowMode.SCHEDULE;
      }),
      TransitionBuilder.on(WorkflowEvent.NO_CHANGE_DETECTED).goToIf(WorkflowState.AUDIT_COMPLETE, (event, contextData) => {
        // Go to audit completion if in monitor mode
        return contextData.workflowMode === WorkflowMode.MONITOR;
      }),
    ];
  }

  private async hasBaselineScreenshots(finalDir: string): Promise<boolean> {
    try {
      const files = await fs.readdir(finalDir);
      const imageFiles = files.filter(file => 
        /\.(png|jpg|jpeg)$/i.test(file)
      );
      return imageFiles.length > 0;
    } catch {
      return false;
    }
  }

  private async captureCurrentScreenshots(
    outputDir: string,
    config: {
      recipes?: Array<{ steps: Array<{ url: string; filename: string }> }>;
      screenshots?: ScreenshotOptions;
    },
    useTimestamp = true
  ) {
    const recipes = config.recipes || [];
    const screenshotOptions = config.screenshots || {};
    const allScreenshots = [];

    for (const recipe of recipes) {
      for (const step of recipe.steps) {
        if (step.url && step.filename) {
          // Check if URL is accessible
          const isAccessible = await this.screenshotService.isUrlAccessible(step.url);
          if (!isAccessible) {
            continue; // Skip inaccessible URLs
          }

          const targets = [{ url: step.url, filename: step.filename }];
          const screenshots = await this.screenshotService.captureMultipleScreenshots(
            targets,
            outputDir,
            screenshotOptions,
            useTimestamp
          );
          allScreenshots.push(...screenshots);
        }
      }
    }

    return allScreenshots;
  }

  private async compareWithBaselines(
    finalDir: string,
    tempDir: string,
    screenshots: any[],
    changeDetectionConfig: any
  ) {
    const results = [];

    for (const screenshot of screenshots) {
      try {
        // Generate the consistent baseline filename
        const baselineFilename = screenshot.filename
          .replace(/-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z/, '') // Remove timestamp
          .replace(/\.(png|jpg|jpeg)$/, `.${screenshot.format}`); // Ensure correct extension
        
        const baselinePath = path.join(finalDir, baselineFilename);
        const currentPath = screenshot.path;

        // Check if baseline exists
        try {
          await fs.access(baselinePath);
          
          // Compare with baseline
          const result = await this.changeDetector.compareImages(
            baselinePath,
            currentPath,
            changeDetectionConfig
          );
          results.push(result);
        } catch {
          // Baseline doesn't exist - treat as new/changed
          results.push({
            filename: baselineFilename,
            baselinePath,
            currentPath,
            pixelDifference: 0,
            percentageDifference: 100,
            hasChanged: true,
            timestamp: new Date(),
          });
        }
      } catch (error) {
        console.error(`Error comparing screenshot ${screenshot.filename}:`, error);
      }
    }

    const changedImages = results.filter(r => r.hasChanged).length;
    const unchangedImages = results.length - changedImages;
    const averageChange = results.length > 0 
      ? Math.round((results.reduce((sum, r) => sum + r.percentageDifference, 0) / results.length) * 100) / 100
      : 0;

    return {
      totalImages: results.length,
      changedImages,
      unchangedImages,
      results,
      averageChange,
      timestamp: new Date(),
    };
  }
}