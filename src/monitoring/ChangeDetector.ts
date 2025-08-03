import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export interface ChangeDetectionOptions {
  threshold?: number;
  includeAA?: boolean;
  alpha?: number;
  diffOutputDir?: string;
}

export interface ChangeDetectionResult {
  filename: string;
  baselinePath: string;
  currentPath: string;
  diffPath?: string;
  pixelDifference: number;
  percentageDifference: number;
  hasChanged: boolean;
  timestamp: Date;
}

export interface ChangeDetectionSummary {
  totalImages: number;
  changedImages: number;
  unchangedImages: number;
  results: ChangeDetectionResult[];
  averageChange: number;
  timestamp: Date;
}

export class ChangeDetector {
  private readonly defaultOptions: Required<ChangeDetectionOptions> = {
    threshold: 0.1,
    includeAA: false,
    alpha: 0.1,
    diffOutputDir: './output/diffs',
  };

  async compareImages(
    baselinePath: string,
    currentPath: string,
    options: ChangeDetectionOptions = {}
  ): Promise<ChangeDetectionResult> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    const filename = path.basename(currentPath);

    try {
      // Check if files exist
      await fs.access(baselinePath);
      await fs.access(currentPath);

      // Convert images to PNG if needed and ensure same dimensions
      const { baselineBuffer, currentBuffer, width, height } =
        await this.prepareImages(baselinePath, currentPath);

      // Create diff buffer
      const diffBuffer = Buffer.alloc(width * height * 4);

      // Compare images
      const pixelDifference = pixelmatch(
        baselineBuffer,
        currentBuffer,
        diffBuffer,
        width,
        height,
        {
          threshold: mergedOptions.threshold,
          includeAA: mergedOptions.includeAA,
          alpha: mergedOptions.alpha,
        }
      );

      const totalPixels = width * height;
      const percentageDifference = (pixelDifference / totalPixels) * 100;
      const hasChanged = percentageDifference > mergedOptions.threshold * 100;

      let diffPath: string | undefined;

      // Save diff image if there are changes using consistent naming (no timestamps)
      if (hasChanged && mergedOptions.diffOutputDir) {
        await fs.mkdir(mergedOptions.diffOutputDir, { recursive: true });
        // Use same naming convention as final folder for consistency
        const cleanFilename = filename.replace(
          /-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z/,
          ''
        );
        diffPath = path.join(
          mergedOptions.diffOutputDir,
          `diff-${cleanFilename}`
        );

        const diffPng = new PNG({ width, height });
        diffPng.data = diffBuffer;

        await fs.writeFile(diffPath, PNG.sync.write(diffPng));
      }

      return {
        filename,
        baselinePath,
        currentPath,
        diffPath,
        pixelDifference,
        percentageDifference: Math.round(percentageDifference * 100) / 100,
        hasChanged,
        timestamp: new Date(),
      };
    } catch {
      return {
        filename,
        baselinePath,
        currentPath,
        pixelDifference: 0,
        percentageDifference: 0,
        hasChanged: false,
        timestamp: new Date(),
      };
    }
  }

  async compareDirectories(
    baselineDir: string,
    currentDir: string,
    options: ChangeDetectionOptions = {}
  ): Promise<ChangeDetectionSummary> {
    const results: ChangeDetectionResult[] = [];

    try {
      const currentFiles = await fs.readdir(currentDir);
      const imageFiles = currentFiles.filter(file =>
        /\.(png|jpg|jpeg)$/i.test(file)
      );

      for (const filename of imageFiles) {
        const baselinePath = path.join(baselineDir, filename);
        const currentPath = path.join(currentDir, filename);

        // Check if baseline exists
        try {
          await fs.access(baselinePath);
          const result = await this.compareImages(
            baselinePath,
            currentPath,
            options
          );
          results.push(result);
        } catch {
          // Baseline doesn't exist - this is a new file
          results.push({
            filename,
            baselinePath,
            currentPath,
            pixelDifference: 0,
            percentageDifference: 100,
            hasChanged: true,
            timestamp: new Date(),
          });
        }
      }
    } catch {
      // Log error silently - this is handled by the calling code
    }

    const changedImages = results.filter(r => r.hasChanged).length;
    const unchangedImages = results.length - changedImages;
    const averageChange =
      results.length > 0
        ? Math.round(
            (results.reduce((sum, r) => sum + r.percentageDifference, 0) /
              results.length) *
              100
          ) / 100
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

  async updateBaselines(
    tempDir: string,
    finalDir: string,
    changedFiles?: string[]
  ): Promise<void> {
    await fs.mkdir(finalDir, { recursive: true });

    try {
      const tempFiles = await fs.readdir(tempDir);
      const filesToUpdate = changedFiles || tempFiles;

      for (const filename of filesToUpdate) {
        const tempPath = path.join(tempDir, filename);
        const finalPath = path.join(finalDir, filename);

        try {
          await fs.access(tempPath);
          await fs.copyFile(tempPath, finalPath);
        } catch {
          // Log error silently - this is handled by the calling code
        }
      }
    } catch {
      // Log error silently - this is handled by the calling code
    }
  }

  async cleanupTempFiles(tempDir: string): Promise<void> {
    try {
      const files = await fs.readdir(tempDir);

      for (const file of files) {
        const filePath = path.join(tempDir, file);
        await fs.unlink(filePath);
      }
    } catch {
      // Log error silently - this is handled by the calling code
    }
  }

  private async prepareImages(
    baselinePath: string,
    currentPath: string
  ): Promise<{
    baselineBuffer: Buffer;
    currentBuffer: Buffer;
    width: number;
    height: number;
  }> {
    // Load and process images with Sharp
    const baselineImage = sharp(baselinePath);
    const currentImage = sharp(currentPath);

    // Get metadata to ensure consistent dimensions
    const [baselineMetadata, currentMetadata] = await Promise.all([
      baselineImage.metadata(),
      currentImage.metadata(),
    ]);

    // Use the larger dimensions to ensure both images are the same size
    const width = Math.max(
      baselineMetadata.width || 0,
      currentMetadata.width || 0
    );
    const height = Math.max(
      baselineMetadata.height || 0,
      currentMetadata.height || 0
    );

    // Convert both images to RGBA buffers with consistent dimensions
    const [baselineBuffer, currentBuffer] = await Promise.all([
      baselineImage
        .resize(width, height, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .ensureAlpha()
        .raw()
        .toBuffer(),
      currentImage
        .resize(width, height, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .ensureAlpha()
        .raw()
        .toBuffer(),
    ]);

    return {
      baselineBuffer,
      currentBuffer,
      width,
      height,
    };
  }
}
