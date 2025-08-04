import { BaseState, StateContext } from '../../state-machine/State.js';
import { Event, EventBuilder } from '../../state-machine/Event.js';
import { Transition, TransitionBuilder } from '../../state-machine/Transition.js';
import { ScreenshotService, ScreenshotOptions } from '../../screenshot/ScreenshotService.js';
import { RecipeEngine, Recipe } from '../../screenshot/RecipeEngine.js';
import { WorkflowState } from '../../types/WorkflowState.js';
import { WorkflowEvent } from '../../types/WorkflowEvent.js';

export class RecipeExecutionState extends BaseState {
  private screenshotService: ScreenshotService;
  private recipeEngine: RecipeEngine;
  private retryCount = 0;
  private readonly maxRetries = 2;

  constructor() {
    super(WorkflowState.RECIPE_EXECUTION);
    this.screenshotService = new ScreenshotService();
    this.recipeEngine = new RecipeEngine(this.screenshotService);
  }

  async enter(context: StateContext): Promise<void> {
    await super.enter(context);
    await this.screenshotService.initialize();
  }

  async execute(context: StateContext): Promise<Event | null> {
    try {
      const config = context.config as {
        recipes?: Recipe[];
        screenshots?: ScreenshotOptions;
      };

      const recipes = config.recipes || [];
      if (recipes.length === 0) {
        context.logger.error('No recipes configured for execution');
        return EventBuilder.executionFailed(new Error('No recipes configured'));
      }

      // Validate recipes before execution
      const validationErrors = this.validateRecipes(recipes);
      if (validationErrors.length > 0) {
        context.logger.error(`Recipe validation failed: ${validationErrors.join(', ')}`);
        return EventBuilder.executionFailed(new Error(`Invalid recipes: ${validationErrors.join(', ')}`));
      }

      // Determine output directory and naming strategy based on whether this is initial run
      const isInitialRun = context.data.isInitialRun as boolean;
      const outputDir = isInitialRun ? './output/final' : './output/temp';
      const useTimestamp = !isInitialRun; // Use consistent names for initial/final, timestamps for temp
      const screenshotOptions = config.screenshots || {};
      
      context.logger.info(`Executing ${recipes.length} recipes, outputting to ${outputDir} (${useTimestamp ? 'timestamped' : 'consistent naming'})`);

      // Execute all recipes
      const results = await this.recipeEngine.executeMultipleRecipes(
        recipes,
        outputDir,
        screenshotOptions,
        useTimestamp
      );

      // Check if all recipes executed successfully
      const failedRecipes = results.filter(result => !result.success);
      const successfulRecipes = results.filter(result => result.success);

      if (failedRecipes.length > 0 && this.retryCount < this.maxRetries) {
        this.retryCount++;
        context.logger.info(`${failedRecipes.length} recipes failed, retrying (attempt ${this.retryCount}/${this.maxRetries})`);
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
        return null; // Stay in current state to retry
      }

      if (successfulRecipes.length === 0) {
        context.logger.error('All recipe executions failed');
        return EventBuilder.executionFailed(new Error('All recipe executions failed'));
      }

      // Collect all screenshots from successful executions
      const allScreenshots = successfulRecipes.flatMap(result => result.screenshots);
      
      context.data.capturedScreenshots = allScreenshots;
      context.data.recipeResults = results;
      this.retryCount = 0; // Reset retry count for next time

      if (failedRecipes.length > 0) {
        context.logger.info(`${successfulRecipes.length} recipes succeeded, ${failedRecipes.length} failed`);
      } else {
        context.logger.info(`All ${recipes.length} recipes executed successfully`);
      }

      return EventBuilder.screenshotsCaptured(allScreenshots);

    } catch (error) {
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        context.logger.error(`Recipe execution error (attempt ${this.retryCount}/${this.maxRetries}): ${error instanceof Error ? error.message : 'Unknown error'}`);
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
        return null; // Stay in current state to retry
      }

      context.logger.error(`Recipe execution failed after ${this.maxRetries} retries: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.retryCount = 0;
      return EventBuilder.executionFailed(error instanceof Error ? error : new Error('Unknown error'));
    }
  }

  async exit(context: StateContext): Promise<void> {
    await this.screenshotService.cleanup();
    await super.exit(context);
  }

  getTransitions(): Transition[] {
    return [
      TransitionBuilder.on(WorkflowEvent.SCREENSHOTS_CAPTURED).goTo(WorkflowState.QUALITY_AUDIT),
      TransitionBuilder.on(WorkflowEvent.EXECUTION_FAILED).goToIf(WorkflowState.MONITORING, (event, context) => {
        // Go back to monitoring if we've exhausted retries or it's a critical error
        return this.retryCount >= this.maxRetries;
      }),
    ];
  }

  private validateRecipes(recipes: Recipe[]): string[] {
    const errors: string[] = [];

    for (const recipe of recipes) {
      const recipeErrors = this.recipeEngine.validateRecipe(recipe);
      if (recipeErrors.length > 0) {
        errors.push(`Recipe '${recipe.name}': ${recipeErrors.join(', ')}`);
      }
    }

    return errors;
  }

  getRetryStatus(): { count: number; max: number } {
    return {
      count: this.retryCount,
      max: this.maxRetries,
    };
  }
}