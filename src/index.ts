import { ScreenshotWorkflow, WorkflowConfig } from './workflows/ScreenshotWorkflow.js';
import { WorkflowMode, isValidWorkflowMode, getAllWorkflowModeStrings } from './types/WorkflowMode.js';
import { promises as fs } from 'fs';

interface CLIOptions {
  mode: WorkflowMode;
  config?: string;
  verbose?: boolean;
  help?: boolean;
}

class ScreenshotAutomationCLI {
  private workflow: ScreenshotWorkflow | null = null;

  async run(args: string[]): Promise<void> {
    const options = this.parseArguments(args);

    if (options.help) {
      this.showHelp();
      return;
    }

    try {
      // Load configuration
      const config = await this.loadConfiguration(options.config);

      // Validate configuration
      const validation = this.validateConfig(config);
      if (!validation.isValid) {
        console.error('❌ Configuration validation failed:');
        validation.errors.forEach(error => console.error(`   - ${error}`));
        process.exit(1);
      }

      if (validation.warnings.length > 0) {
        console.warn('⚠️  Configuration warnings:');
        validation.warnings.forEach(warning => console.warn(`   - ${warning}`));
      }

      // Create workflow
      this.workflow = new ScreenshotWorkflow(config);
      await this.workflow.initialize();

      // Set up signal handlers
      this.setupSignalHandlers();

      // Execute based on mode
      await this.executeMode(options.mode);

    } catch (error) {
      console.error(`❌ Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  }

  private parseArguments(args: string[]): CLIOptions {
    const options: CLIOptions = {
      mode: WorkflowMode.MONITOR,
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      switch (arg) {
        case '--mode':
        case '-m':
          const mode = args[++i];
          if (isValidWorkflowMode(mode)) {
            options.mode = mode;
          } else {
            const validModes = getAllWorkflowModeStrings().join(', ');
            throw new Error(`Invalid mode: ${mode}. Must be one of: ${validModes}`);
          }
          break;

        case '--config':
        case '-c':
          options.config = args[++i];
          break;

        case '--verbose':
        case '-v':
          options.verbose = true;
          break;

        case '--help':
        case '-h':
          options.help = true;
          break;

        default:
          if (arg.startsWith('--mode=')) {
            const mode = arg.split('=')[1];
            if (isValidWorkflowMode(mode)) {
              options.mode = mode;
            }
          }
          break;
      }
    }

    return options;
  }

  private async loadConfiguration(configPath?: string): Promise<WorkflowConfig> {
    const defaultConfigPath = './config/demo-config.json';
    const finalConfigPath = configPath || defaultConfigPath;

    try {
      const configContent = await fs.readFile(finalConfigPath, 'utf8');
      const config = JSON.parse(configContent) as WorkflowConfig;

      console.log(`📋 Loaded configuration from ${finalConfigPath}`);
      return config;

    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new Error(`Configuration file not found: ${finalConfigPath}`);
      }
      throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private validateConfig(config: WorkflowConfig) {
    const tempWorkflow = new ScreenshotWorkflow(config);
    return tempWorkflow.validateConfiguration();
  }

  private async executeMode(mode: WorkflowMode): Promise<void> {
    if (!this.workflow) {
      throw new Error('Workflow not initialized');
    }

    switch (mode) {
      case WorkflowMode.MONITOR:
        await this.runContinuousMonitoring();
        break;

      case WorkflowMode.TRIGGER:
        await this.runManualTrigger();
        break;

      case WorkflowMode.SCHEDULE:
        await this.runScheduledExecution();
        break;
    }
  }

  private async runContinuousMonitoring(): Promise<void> {
    if (!this.workflow) return;

    console.log('🔄 Starting continuous monitoring mode...');
    console.log('   Press Ctrl+C to stop');

    try {
      // Initialize with monitor mode (default)
      await this.workflow.initialize(WorkflowMode.MONITOR);
      await this.workflow.start();
    } catch (error) {
      console.error(`Monitoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  private async runManualTrigger(): Promise<void> {
    if (!this.workflow) return;

    console.log('🔧 Running manual trigger...');

    try {
      // Initialize with trigger mode
      await this.workflow.initialize(WorkflowMode.TRIGGER);

      // Start the workflow - it will begin at CHANGE_DETECTION
      await this.workflow.start();

      // Wait for completion - the state machine will stop automatically after AUDIT_COMPLETE
      await new Promise<void>((resolve) => {
        const checkStatus = async () => {
          const status = this.workflow?.getStatus();

          // Check if state machine has stopped (not running anymore)
          if (!status?.isRunning) {
            console.log('✅ Manual trigger completed');
            resolve();
          } else {
            setTimeout(checkStatus, 1000);
          }
        };

        checkStatus();
      });

      // No need to explicitly stop - the state machine stops itself

    } catch (error) {
      console.error(`Manual trigger failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  private async runScheduledExecution(): Promise<void> {
    if (!this.workflow) return;

    console.log('📅 Running scheduled execution...');
    console.log('   Will wait for schedule time, then run once and exit');

    try {
      // Initialize with schedule mode
      await this.workflow.initialize(WorkflowMode.SCHEDULE);

      // Start the workflow - it will begin at MONITORING, wait for schedule, then complete
      await this.workflow.start();

      // Wait for completion - the state machine will stop automatically after SCHEDULE_COMPLETE
      await new Promise<void>((resolve) => {
        const checkStatus = async () => {
          const status = this.workflow?.getStatus();

          // Check if state machine has stopped (not running anymore)
          if (!status?.isRunning) {
            console.log('✅ Scheduled execution completed');
            resolve();
          } else {
            setTimeout(checkStatus, 1000);
          }
        };

        checkStatus();
      });

      // No need to explicitly stop - the state machine stops itself

    } catch (error) {
      console.error(`Scheduled execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  private setupSignalHandlers(): void {
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n📤 Received ${signal}, shutting down gracefully...`);

      if (this.workflow) {
        try {
          await this.workflow.stop();
          console.log('✅ Workflow stopped successfully');
        } catch (error) {
          console.error(`Error stopping workflow: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      process.exit(0);
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught exception:', error);
      if (this.workflow) {
        this.workflow.stop().finally(() => process.exit(1));
      } else {
        process.exit(1);
      }
    });

    process.on('unhandledRejection', (reason) => {
      console.error('❌ Unhandled rejection:', reason);
      if (this.workflow) {
        this.workflow.stop().finally(() => process.exit(1));
      } else {
        process.exit(1);
      }
    });
  }

  private showHelp(): void {
    console.log(`
📸 Screenshot Automation State Machine

USAGE:
  npm run demo:monitor              # Continuous monitoring mode
  npm run demo:trigger              # Single manual trigger
  npm run demo:schedule             # Scheduled one-time execution
  tsx src/index.ts [OPTIONS]        # Direct execution

OPTIONS:
  --mode, -m <mode>                 # Execution mode: 'monitor', 'trigger', 'schedule' (default: monitor)
  --config, -c <path>               # Configuration file path (default: ./config/demo-config.json)
  --verbose, -v                     # Enable verbose logging
  --help, -h                        # Show this help message

MODES:
  monitor                           # Continuous monitoring with scheduled intervals
  trigger                           # Manual one-time trigger and exit
  schedule                          # Wait for schedule time, run once, then exit

EXAMPLES:
  tsx src/index.ts --mode=monitor   # Start continuous monitoring
  tsx src/index.ts --mode=trigger   # Run manual trigger once
  tsx src/index.ts --mode=schedule  # Wait for schedule, run once, and exit

For more information, see README.md
    `);
  }
}

// Main execution
async function main() {
  const cli = new ScreenshotAutomationCLI();
  const args = process.argv.slice(2);

  try {
    await cli.run(args);
  } catch (error) {
    console.error(`❌ CLI error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

export { ScreenshotAutomationCLI };