#!/usr/bin/env node

import { WorkflowValidator } from './WorkflowValidator.js';
import { isValidWorkflowMode } from '../types/WorkflowMode.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  try {
    if (args.length > 0) {
      // Validate specific mode
      const modeArg = args[0];
      if (!isValidWorkflowMode(modeArg)) {
        process.stderr.write(`❌ Invalid workflow mode: ${modeArg}\n`);
        process.exit(1);
      }
      const mode = modeArg;
      const result = await WorkflowValidator.validateMode(mode);

      if (result.isValid) {
        process.stdout.write(`✅ Workflow mode '${mode}' is valid!\n`);
        if (result.summary) {
          process.stdout.write('\n📊 Summary:\n');
          process.stdout.write(`   Initial: ${result.summary.initialState}\n`);
          process.stdout.write(
            `   Completion: ${result.summary.completionState}\n`
          );
          process.stdout.write(
            `   States: ${result.summary.stateCount} (${result.summary.states.join(' → ')})\n`
          );
        }
      } else {
        process.stderr.write(`❌ Workflow mode '${mode}' validation failed!\n`);
        result.errors.forEach(error => {
          process.stderr.write(`   ❌ ${error}\n`);
        });
        process.exit(1);
      }
    } else {
      // Validate all workflows
      const results = await WorkflowValidator.validateAll();
      WorkflowValidator.printValidationResults(results);

      if (!results.isValid) {
        process.exit(1);
      }
    }
  } catch (error) {
    process.stderr.write(
      `❌ Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`
    );
    process.exit(1);
  }
}

main().catch(error => {
  process.stderr.write(
    `❌ Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}\n`
  );
  process.exit(1);
});
