import { promises as fs } from 'fs';
import sharp from 'sharp';
import { ScreenshotResult } from './ScreenshotService.js';

export interface QualityCheck {
  name: string;
  passed: boolean;
  message: string;
  value?: number | string;
  expected?: number | string;
}

export interface QualityReport {
  screenshot: ScreenshotResult;
  checks: QualityCheck[];
  overallScore: number;
  passed: boolean;
  timestamp: Date;
}

export interface QualityConfig {
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  maxFileSize?: number; // in bytes
  minFileSize?: number; // in bytes
  requiredFormats?: string[];
  qualityThreshold?: number; // 0-100
}

export class QualityValidator {
  private readonly defaultConfig: Required<QualityConfig> = {
    minWidth: 320,
    maxWidth: 3840,
    minHeight: 240,
    maxHeight: 2160,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    minFileSize: 1024, // 1KB
    requiredFormats: ['png'],
    qualityThreshold: 80,
  };

  async validateScreenshot(
    screenshot: ScreenshotResult,
    config: QualityConfig = {}
  ): Promise<QualityReport> {
    const mergedConfig = { ...this.defaultConfig, ...config };
    const checks: QualityCheck[] = [];

    try {
      // File existence check
      const fileStats = await fs.stat(screenshot.path);
      checks.push({
        name: 'File Exists',
        passed: true,
        message: 'Screenshot file exists',
        value: screenshot.path,
      });

      // File size checks
      checks.push(this.validateFileSize(fileStats.size, mergedConfig));

      // Image metadata checks
      const metadata = await sharp(screenshot.path).metadata();
      checks.push(...this.validateImageMetadata(metadata, mergedConfig));

      // Format validation
      checks.push(this.validateFormat(screenshot.format, mergedConfig));

      // Viewport validation
      checks.push(this.validateViewport(screenshot, metadata, mergedConfig));
    } catch (error) {
      checks.push({
        name: 'File Access',
        passed: false,
        message: `Failed to access screenshot file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }

    const passedChecks = checks.filter(check => check.passed).length;
    const overallScore = Math.round((passedChecks / checks.length) * 100);
    const passed = overallScore >= mergedConfig.qualityThreshold;

    return {
      screenshot,
      checks,
      overallScore,
      passed,
      timestamp: new Date(),
    };
  }

  async validateMultipleScreenshots(
    screenshots: ScreenshotResult[],
    config: QualityConfig = {}
  ): Promise<QualityReport[]> {
    const reports: QualityReport[] = [];

    for (const screenshot of screenshots) {
      try {
        const report = await this.validateScreenshot(screenshot, config);
        reports.push(report);
      } catch (error) {
        reports.push({
          screenshot,
          checks: [
            {
              name: 'Validation Error',
              passed: false,
              message: `Failed to validate screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          overallScore: 0,
          passed: false,
          timestamp: new Date(),
        });
      }
    }

    return reports;
  }

  private validateFileSize(
    size: number,
    config: Required<QualityConfig>
  ): QualityCheck {
    if (size < config.minFileSize) {
      return {
        name: 'File Size',
        passed: false,
        message: `File too small: ${Math.round(size / 1024)}KB`,
        value: size,
        expected: `>= ${Math.round(config.minFileSize / 1024)}KB`,
      };
    }

    if (size > config.maxFileSize) {
      return {
        name: 'File Size',
        passed: false,
        message: `File too large: ${Math.round(size / 1024)}KB`,
        value: size,
        expected: `<= ${Math.round(config.maxFileSize / 1024)}KB`,
      };
    }

    return {
      name: 'File Size',
      passed: true,
      message: `File size acceptable: ${Math.round(size / 1024)}KB`,
      value: size,
    };
  }

  private validateImageMetadata(
    metadata: sharp.Metadata,
    config: Required<QualityConfig>
  ): QualityCheck[] {
    const checks: QualityCheck[] = [];

    // Width validation
    if (metadata.width) {
      if (
        metadata.width < config.minWidth ||
        metadata.width > config.maxWidth
      ) {
        checks.push({
          name: 'Image Width',
          passed: false,
          message: `Invalid width: ${metadata.width}px`,
          value: metadata.width,
          expected: `${config.minWidth}-${config.maxWidth}px`,
        });
      } else {
        checks.push({
          name: 'Image Width',
          passed: true,
          message: `Width acceptable: ${metadata.width}px`,
          value: metadata.width,
        });
      }
    }

    // Height validation
    if (metadata.height) {
      if (
        metadata.height < config.minHeight ||
        metadata.height > config.maxHeight
      ) {
        checks.push({
          name: 'Image Height',
          passed: false,
          message: `Invalid height: ${metadata.height}px`,
          value: metadata.height,
          expected: `${config.minHeight}-${config.maxHeight}px`,
        });
      } else {
        checks.push({
          name: 'Image Height',
          passed: true,
          message: `Height acceptable: ${metadata.height}px`,
          value: metadata.height,
        });
      }
    }

    return checks;
  }

  private validateFormat(
    format: string,
    config: Required<QualityConfig>
  ): QualityCheck {
    if (!config.requiredFormats.includes(format)) {
      return {
        name: 'Image Format',
        passed: false,
        message: `Unsupported format: ${format}`,
        value: format,
        expected: config.requiredFormats.join(', '),
      };
    }

    return {
      name: 'Image Format',
      passed: true,
      message: `Format acceptable: ${format}`,
      value: format,
    };
  }

  private validateViewport(
    screenshot: ScreenshotResult,
    metadata: sharp.Metadata,
    _config: Required<QualityConfig>
  ): QualityCheck {
    const expectedWidth = screenshot.viewport.width;
    const actualWidth = metadata.width;

    if (actualWidth && Math.abs(actualWidth - expectedWidth) > 50) {
      return {
        name: 'Viewport Match',
        passed: false,
        message: `Viewport mismatch: expected ${expectedWidth}px, got ${actualWidth}px`,
        value: actualWidth,
        expected: expectedWidth,
      };
    }

    return {
      name: 'Viewport Match',
      passed: true,
      message: `Viewport matches expected dimensions`,
      value: actualWidth,
      expected: expectedWidth,
    };
  }
}
