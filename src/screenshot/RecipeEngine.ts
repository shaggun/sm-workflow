import {
  ScreenshotService,
  ScreenshotResult,
  ScreenshotOptions,
} from './ScreenshotService.js';

export interface RecipeStep {
  type: 'navigate' | 'click' | 'wait' | 'scroll';
  url?: string;
  filename?: string;
  selector?: string;
  duration?: number;
  position?: { x: number; y: number };
}

export interface Recipe {
  name: string;
  description?: string;
  steps: RecipeStep[];
}

export interface RecipeExecutionResult {
  recipe: Recipe;
  screenshots: ScreenshotResult[];
  executionTime: number;
  success: boolean;
  errors: string[];
}

export class RecipeEngine {
  constructor(private readonly screenshotService: ScreenshotService) {}

  async executeRecipe(
    recipe: Recipe,
    outputDir: string,
    options: ScreenshotOptions = {},
    useTimestamp = true
  ): Promise<RecipeExecutionResult> {
    const startTime = Date.now();
    const screenshots: ScreenshotResult[] = [];
    const errors: string[] = [];

    try {
      for (const step of recipe.steps) {
        try {
          await this.executeStep(
            step,
            outputDir,
            screenshots,
            options,
            useTimestamp
          );
        } catch (error) {
          const errorMessage = `Failed to execute step ${step.type}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMessage);
          // Error logging handled by calling code
        }
      }

      return {
        recipe,
        screenshots,
        executionTime: Date.now() - startTime,
        success: errors.length === 0,
        errors,
      };
    } catch (error) {
      errors.push(
        `Recipe execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );

      return {
        recipe,
        screenshots,
        executionTime: Date.now() - startTime,
        success: false,
        errors,
      };
    }
  }

  async executeMultipleRecipes(
    recipes: Recipe[],
    outputDir: string,
    options: ScreenshotOptions = {},
    useTimestamp = true
  ): Promise<RecipeExecutionResult[]> {
    const results: RecipeExecutionResult[] = [];

    for (const recipe of recipes) {
      try {
        const result = await this.executeRecipe(
          recipe,
          outputDir,
          options,
          useTimestamp
        );
        results.push(result);
      } catch (error) {
        results.push({
          recipe,
          screenshots: [],
          executionTime: 0,
          success: false,
          errors: [
            `Recipe execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ],
        });
      }
    }

    return results;
  }

  private async executeStep(
    step: RecipeStep,
    outputDir: string,
    screenshots: ScreenshotResult[],
    options: ScreenshotOptions,
    useTimestamp = true
  ): Promise<void> {
    switch (step.type) {
      case 'navigate': {
        if (!step.url || !step.filename) {
          throw new Error('Navigate step requires url and filename');
        }

        const isAccessible = await this.screenshotService.isUrlAccessible(
          step.url
        );
        if (!isAccessible) {
          throw new Error(`URL ${step.url} is not accessible`);
        }

        const viewports = options.viewports || [
          { width: 1920, height: 1080, name: 'desktop' },
          { width: 390, height: 844, name: 'mobile' },
        ];

        for (const viewport of viewports) {
          const results = await this.screenshotService.captureScreenshot(
            step.url,
            step.filename,
            outputDir,
            viewport,
            options,
            useTimestamp
          );
          screenshots.push(...results);
        }
        break;
      }

      case 'wait': {
        if (step.duration) {
          await new Promise(resolve => setTimeout(resolve, step.duration));
        }
        break;
      }

      case 'click':
      case 'scroll': {
        // Step type not implemented - silently skip
        break;
      }

      default:
        throw new Error(`Unknown step type: ${String(step.type)}`);
    }
  }

  validateRecipe(recipe: Recipe): string[] {
    const errors: string[] = [];

    if (!recipe.name) {
      errors.push('Recipe must have a name');
    }

    if (!recipe.steps || recipe.steps.length === 0) {
      errors.push('Recipe must have at least one step');
    }

    recipe.steps.forEach((step, index) => {
      switch (step.type) {
        case 'navigate':
          if (!step.url) {
            errors.push(`Step ${index}: Navigate step requires url`);
          }
          if (!step.filename) {
            errors.push(`Step ${index}: Navigate step requires filename`);
          }
          break;

        case 'wait':
          if (!step.duration || step.duration <= 0) {
            errors.push(`Step ${index}: Wait step requires positive duration`);
          }
          break;

        case 'click':
          if (!step.selector) {
            errors.push(`Step ${index}: Click step requires selector`);
          }
          break;

        case 'scroll':
          if (!step.position) {
            errors.push(`Step ${index}: Scroll step requires position`);
          }
          break;

        default:
          errors.push(
            `Step ${index}: Unknown step type '${String(step.type)}'`
          );
      }
    });

    return errors;
  }
}
