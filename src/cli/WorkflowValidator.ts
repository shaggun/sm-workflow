import { StateFactory } from '../workflows/StateFactory.js';
import { WorkflowBuilder } from '../workflows/WorkflowBuilder.js';
import { WorkflowMode } from '../types/WorkflowMode.js';

export class WorkflowValidator {
  /**
   * Validate all workflow configurations
   */
  static async validateAll(): Promise<{
    isValid: boolean;
    configurationErrors: string[];
    workflowErrors: { mode: WorkflowMode; errors: string[] }[];
    summary: Array<{
      mode: WorkflowMode;
      initialState: string;
      completionState: string;
      stateCount: number;
      states: string[];
    }>;
  }> {
    const result = {
      isValid: true,
      configurationErrors: [] as string[],
      workflowErrors: [] as { mode: WorkflowMode; errors: string[] }[],
      summary: [] as Array<{
        mode: WorkflowMode;
        initialState: string;
        completionState: string;
        stateCount: number;
        states: string[];
      }>,
    };

    try {
      // Validate configuration
      const configValidation = await StateFactory.validateConfiguration();
      if (!configValidation.isValid) {
        result.isValid = false;
        result.configurationErrors = configValidation.errors;
      }

      // Get all workflows and validate each
      const workflows = await WorkflowBuilder.listAllWorkflows();
      result.summary = workflows;

      for (const workflow of workflows) {
        const workflowValidation = await WorkflowBuilder.validateWorkflowFlow(
          workflow.mode
        );
        if (!workflowValidation.isValid) {
          result.isValid = false;
          result.workflowErrors.push({
            mode: workflow.mode,
            errors: workflowValidation.errors,
          });
        }
      }
    } catch (error) {
      result.isValid = false;
      result.configurationErrors.push(
        `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    return result;
  }

  /**
   * Print validation results to console
   */
  static printValidationResults(
    results: Awaited<ReturnType<typeof WorkflowValidator.validateAll>>
  ): void {
    process.stdout.write('\n🔍 Workflow Configuration Validation\n\n');

    if (results.isValid) {
      process.stdout.write('✅ All workflows are valid!\n\n');
    } else {
      process.stdout.write('❌ Validation failed!\n\n');
    }

    // Print configuration errors
    if (results.configurationErrors.length > 0) {
      process.stdout.write('📋 Configuration Errors:\n');
      results.configurationErrors.forEach(error => {
        process.stdout.write(`   ❌ ${error}\n`);
      });
      process.stdout.write('\n');
    }

    // Print workflow-specific errors
    if (results.workflowErrors.length > 0) {
      process.stdout.write('🔄 Workflow Errors:\n');
      results.workflowErrors.forEach(({ mode, errors }) => {
        process.stdout.write(`   Mode: ${mode}\n`);
        errors.forEach(error => {
          process.stdout.write(`     ❌ ${error}\n`);
        });
      });
      process.stdout.write('\n');
    }

    // Print summary
    process.stdout.write('📊 Workflow Summary:\n');
    results.summary.forEach(workflow => {
      const status = results.workflowErrors.some(w => w.mode === workflow.mode)
        ? '❌'
        : '✅';
      process.stdout.write(`   ${status} ${workflow.mode}:\n`);
      process.stdout.write(`      Initial: ${workflow.initialState}\n`);
      process.stdout.write(`      Completion: ${workflow.completionState}\n`);
      process.stdout.write(
        `      States: ${workflow.stateCount} (${workflow.states.join(' → ')})\n`
      );
    });
  }

  /**
   * Validate a specific workflow mode
   */
  static async validateMode(mode: WorkflowMode): Promise<{
    isValid: boolean;
    errors: string[];
    summary?: {
      mode: WorkflowMode;
      initialState: string;
      completionState: string;
      stateCount: number;
      states: string[];
    };
  }> {
    try {
      const validation = await WorkflowBuilder.validateWorkflowFlow(mode);
      const summary = await WorkflowBuilder.getWorkflowSummary(mode);

      return {
        isValid: validation.isValid,
        errors: validation.errors,
        summary,
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [
          `Mode validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
      };
    }
  }
}
