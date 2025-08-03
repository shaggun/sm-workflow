import puppeteer, { Browser, Page } from 'puppeteer';
import { promises as fs } from 'fs';
import path from 'path';

export interface Viewport {
  width: number;
  height: number;
  name: string;
}

export interface ScreenshotOptions {
  formats?: string[];
  viewports?: Viewport[];
  quality?: number;
  timeout?: number;
  waitForNavigation?: boolean;
}

export interface ScreenshotResult {
  url: string;
  filename: string;
  viewport: Viewport;
  format: string;
  path: string;
  timestamp: Date;
  size: number;
}

export class ScreenshotService {
  private browser: Browser | null = null;

  async initialize(): Promise<void> {
    if (this.browser) {
      return;
    }

    this.browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async captureScreenshot(
    url: string,
    filename: string,
    outputDir: string,
    viewport: Viewport,
    options: ScreenshotOptions = {},
    useTimestamp = true
  ): Promise<ScreenshotResult[]> {
    if (!this.browser) {
      throw new Error('ScreenshotService not initialized');
    }

    const page = await this.browser.newPage();
    const results: ScreenshotResult[] = [];

    try {
      await page.setViewport({
        width: viewport.width,
        height: viewport.height,
      });

      await page.goto(url, {
        waitUntil: options.waitForNavigation
          ? 'networkidle0'
          : 'domcontentloaded',
        timeout: options.timeout || 30000,
      });

      await page.waitForTimeout(1000);

      await fs.mkdir(outputDir, { recursive: true });

      const formats = options.formats || ['png'];
      const timestamp = new Date();

      for (const format of formats) {
        // Use consistent naming for final screenshots, timestamped for temp
        const screenshotFilename = useTimestamp
          ? `${filename}-${viewport.width}x${viewport.height}-${timestamp.toISOString().replace(/[:.]/g, '-')}.${format}`
          : `${filename}-${viewport.width}x${viewport.height}.${format}`;

        const screenshotPath = path.join(outputDir, screenshotFilename);

        const screenshotOptions: Parameters<Page['screenshot']>[0] = {
          path: screenshotPath,
          fullPage: true,
          type: format as 'png' | 'jpeg' | 'webp',
          ...(format === 'jpeg' && options.quality
            ? { quality: options.quality }
            : {}),
        };

        await page.screenshot(screenshotOptions);

        const stats = await fs.stat(screenshotPath);

        results.push({
          url,
          filename: screenshotFilename,
          viewport,
          format,
          path: screenshotPath,
          timestamp,
          size: stats.size,
        });
      }
    } finally {
      await page.close();
    }

    return results;
  }

  async captureMultipleScreenshots(
    targets: Array<{ url: string; filename: string }>,
    outputDir: string,
    options: ScreenshotOptions = {},
    useTimestamp = true
  ): Promise<ScreenshotResult[]> {
    const viewports = options.viewports || [
      { width: 1920, height: 1080, name: 'desktop' },
      { width: 390, height: 844, name: 'mobile' },
    ];

    const allResults: ScreenshotResult[] = [];

    for (const target of targets) {
      for (const viewport of viewports) {
        try {
          const results = await this.captureScreenshot(
            target.url,
            target.filename,
            outputDir,
            viewport,
            options,
            useTimestamp
          );
          allResults.push(...results);
        } catch {
          // Error logging handled by calling code
        }
      }
    }

    return allResults;
  }

  async isUrlAccessible(url: string): Promise<boolean> {
    if (!this.browser) {
      return false;
    }

    const page = await this.browser.newPage();

    try {
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });

      return response !== null && response.ok();
    } catch {
      return false;
    } finally {
      await page.close();
    }
  }

  /**
   * Generate consistent filename for a given target and viewport
   * This ensures screenshots always have the same name for documentation
   */
  static generateConsistentFilename(
    baseFilename: string,
    viewport: Viewport,
    format: string
  ): string {
    return `${baseFilename}-${viewport.width}x${viewport.height}.${format}`;
  }

  /**
   * Generate timestamped filename for temporary screenshots
   */
  static generateTimestampedFilename(
    baseFilename: string,
    viewport: Viewport,
    format: string,
    timestamp: Date
  ): string {
    return `${baseFilename}-${viewport.width}x${viewport.height}-${timestamp.toISOString().replace(/[:.]/g, '-')}.${format}`;
  }
}
