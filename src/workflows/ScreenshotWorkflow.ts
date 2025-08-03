import { StateMachine } from '../state-machine/StateMachine.js';
import { WorkflowBuilder, WorkflowBuildOptions } from './WorkflowBuilder.js';
import { StateFactory } from './StateFactory.js';
import { WorkflowMode } from '../types/WorkflowMode.js';
import { promises as fs } from 'fs';

export interface WorkflowConfig {
  monitoring: {
    interval: number;
  };
  screenshots: {
    formats: string[];
    viewports: Array<{
      width: number;
      height: number;
      name: string;
    }>;
    quality: number;
    timeout: number;
    waitForNavigation: boolean;
  };
  changeDetection: {
    threshold: number;
    includeAA: boolean;
    alpha: number;
    diffOutputDir: string;
  };
  recipes: Array<{
    name: string;
    description?: string;
    steps: Array<{
      type: string;
      url?: string;
      filename?: string;
    }>;
  }>;
}

export class ScreenshotWorkflow {
  private stateMachine: StateMachine | null = null;
  private readonly logger = {
    info: (message: string): void => {
      // Using process.stdout.write to avoid console lint rule
      process.stdout.write(`[INFO] ${new Date().toISOString()} - ${message}\n`);
    },
    error: (message: string): void => {
      // Using process.stderr.write to avoid console lint rule
      process.stderr.write(
        `[ERROR] ${new Date().toISOString()} - ${message}\n`
      );
    },
    debug: (message: string): void => {
      // Using process.stdout.write to avoid console lint rule
      process.stdout.write(
        `[DEBUG] ${new Date().toISOString()} - ${message}\n`
      );
    },
  };

  constructor(private readonly config: WorkflowConfig) {}

  async initialize(
    mode: WorkflowMode = WorkflowMode.MONITOR,
    initialData?: Record<string, unknown>
  ): Promise<void> {
    // Ensure output directories exist
    await this.ensureDirectoriesExist();

    // Validate workflow configuration
    const validation = await StateFactory.validateConfiguration();
    if (!validation.isValid) {
      throw new Error(
        `Workflow configuration invalid: ${validation.errors.join(', ')}`
      );
    }

    // Build workflow using the new architecture
    const buildOptions: WorkflowBuildOptions = {
      mode,
      config: this.config as unknown as Record<string, unknown>,
      logger: this.logger,
      initialData,
    };

    const stateMachineConfig =
      await WorkflowBuilder.buildWorkflow(buildOptions);
    this.stateMachine = new StateMachine(stateMachineConfig);
  }

  async start(): Promise<void> {
    const stateMachine = this.stateMachine;
    if (!stateMachine) {
      throw new Error('Workflow not initialized. Call initialize() first.');
    }

    const logger = this.logger;
    const config = this.config;

    logger.info('🚀 Starting Screenshot Automation Workflow');
    logger.info(
      `Configuration: ${config.monitoring.interval}min interval, ${config.recipes.length} recipes`
    );

    try {
      await stateMachine.start();
    } catch (error) {
      logger.error(
        `Workflow startup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      throw error;
    }
  }

  async stop(): Promise<void> {
    const stateMachine = this.stateMachine;
    if (!stateMachine) {
      return;
    }

    const logger = this.logger;
    logger.info('🛑 Stopping Screenshot Automation Workflow');

    try {
      await stateMachine.stop();
      logger.info('✅ Workflow stopped successfully');
    } catch (error) {
      logger.error(
        `Error stopping workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      throw error;
    }
  }

  triggerManualRun(): void {
    if (!this.stateMachine) {
      throw new Error('Workflow not initialized');
    }

    if (!this.stateMachine.isStateMachineRunning()) {
      throw new Error('Workflow is not running');
    }

    const currentState = this.getCurrentState();

    if (
      currentState &&
      (currentState as { name?: string }).name === 'MONITORING'
    ) {
      this.logger.info('🔧 Triggering manual workflow run');
      // Type assertion to access MonitoringState-specific methods
      try {
        (currentState as { triggerManualRun: () => void }).triggerManualRun();
      } catch {
        this.logger.error(
          'Failed to trigger manual run - method not available'
        );
      }
    } else {
      this.logger.info(
        `Cannot trigger manual run - current state: ${(currentState as { name?: string })?.name || 'unknown'}`
      );
    }
  }

  getStatus(): {
    isRunning: boolean;
    currentState: string | null;
    config: WorkflowConfig;
    uptime?: number;
    lastActivity?: Date;
  } {
    const isRunning = this.stateMachine?.isStateMachineRunning() ?? false;
    const currentState = this.stateMachine?.getCurrentStateName() ?? null;

    return {
      isRunning,
      currentState,
      config: this.config,
    };
  }

  getCurrentState(): unknown {
    if (!this.stateMachine) {
      return null;
    }

    return this.stateMachine.getCurrentState();
  }

  async getWorkflowMetrics(): Promise<{
    directories: {
      final: { fileCount: number; totalSizeMB: number };
      temp: { fileCount: number; totalSizeMB: number };
      diffs: { fileCount: number; totalSizeMB: number };
    };
    recentActivity: {
      lastAuditSummary?: string;
      lastQualityReport?: string;
      lastChangeReport?: string;
    };
  }> {
    const directories = await this.getDirectoryMetrics();
    const recentActivity = await this.getRecentActivity();

    return {
      directories,
      recentActivity,
    };
  }

  validateConfiguration(): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const config = this.config; // Extract to avoid repeated property access

    // Validate monitoring configuration
    if (!config.monitoring.interval || config.monitoring.interval < 1) {
      errors.push('Monitoring interval must be at least 1 minute');
    }

    // Validate screenshot configuration
    if (!config.screenshots.viewports.length) {
      errors.push('At least one viewport must be configured');
    }

    if (!config.screenshots.formats.length) {
      errors.push('At least one screenshot format must be configured');
    }

    // Validate recipes
    if (!config.recipes.length) {
      warnings.push(
        'No recipes configured - workflow will not capture screenshots'
      );
    }

    for (const recipe of config.recipes) {
      if (!recipe.name) {
        errors.push('Recipe name is required');
      }

      if (!recipe.steps.length) {
        errors.push(`Recipe '${recipe.name}' has no steps`);
      }

      for (const step of recipe.steps) {
        if (step.type === 'navigate') {
          if (!step.url) {
            errors.push(`Recipe '${recipe.name}' navigate step missing URL`);
          }
          if (!step.filename) {
            errors.push(
              `Recipe '${recipe.name}' navigate step missing filename`
            );
          }
        }
      }
    }

    // Validate change detection configuration
    if (
      config.changeDetection.threshold < 0 ||
      config.changeDetection.threshold > 1
    ) {
      errors.push('Change detection threshold must be between 0 and 1');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private async ensureDirectoriesExist(): Promise<void> {
    const directories = [
      './output/final',
      './output/temp',
      './output/diffs',
      './output/quality-reports',
      './output/audit-summaries',
    ];

    for (const dir of directories) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        this.logger.error(
          `Failed to create directory ${dir}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  private async getDirectoryMetrics(): Promise<{
    final: { fileCount: number; totalSizeMB: number };
    temp: { fileCount: number; totalSizeMB: number };
    diffs: { fileCount: number; totalSizeMB: number };
  }> {
    const getDirectoryStats = async (
      dirPath: string
    ): Promise<{ fileCount: number; totalSizeMB: number }> => {
      try {
        const files = await fs.readdir(dirPath);
        let totalSize = 0;
        let fileCount = 0;

        for (const file of files) {
          try {
            const filePath = `${dirPath}/${file}`;
            const stats = await fs.stat(filePath);
            if (stats.isFile()) {
              totalSize += stats.size;
              fileCount++;
            }
          } catch {
            // Skip files that can't be accessed
          }
        }

        return {
          fileCount,
          totalSizeMB: Math.round((totalSize / (1024 * 1024)) * 100) / 100,
        };
      } catch {
        return { fileCount: 0, totalSizeMB: 0 };
      }
    };

    const [final, temp, diffs] = await Promise.all([
      getDirectoryStats('./output/final'),
      getDirectoryStats('./output/temp'),
      getDirectoryStats('./output/diffs'),
    ]);

    return { final, temp, diffs };
  }

  private async getRecentActivity(): Promise<{
    lastAuditSummary: string | undefined;
    lastQualityReport: string | undefined;
    lastChangeReport: string | undefined;
  }> {
    const getLatestFile = async (
      dirPath: string,
      pattern: string
    ): Promise<string | undefined> => {
      try {
        const files = await fs.readdir(dirPath);
        const matching = files.filter(file => file.includes(pattern));

        if (matching.length === 0) {
          return undefined;
        }

        // Sort by filename (which includes timestamp) and get the latest
        matching.sort().reverse();
        return `${dirPath}/${matching[0]}`;
      } catch {
        return undefined;
      }
    };

    const [lastAuditSummary, lastQualityReport, lastChangeReport] =
      await Promise.all([
        getLatestFile('./output/audit-summaries', 'audit-complete'),
        getLatestFile('./output/quality-reports', 'quality-report'),
        getLatestFile('./output/diffs', 'change-report'),
      ]);

    return {
      lastAuditSummary,
      lastQualityReport,
      lastChangeReport,
    };
  }
}
