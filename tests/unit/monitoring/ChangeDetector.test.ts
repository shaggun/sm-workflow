import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChangeDetector, ChangeDetectionOptions } from '../../../src/monitoring/ChangeDetector.js';
import { promises as fs } from 'fs';
import sharp from 'sharp';
import pixelmatch from 'pixelmatch';

// Mock dependencies
vi.mock('fs', async () => ({
  promises: {
    access: vi.fn(),
    readdir: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    copyFile: vi.fn(),
    unlink: vi.fn(),
  }
}));
vi.mock('sharp');
vi.mock('pixelmatch');

describe('ChangeDetector', () => {
  let changeDetector: ChangeDetector;
  let mockOptions: ChangeDetectionOptions;

  beforeEach(() => {
    changeDetector = new ChangeDetector();
    
    mockOptions = {
      threshold: 0.1,
      includeAA: false,
      alpha: 0.1,
      diffOutputDir: './output/diffs',
    };

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('compareImages', () => {
    it('should detect no changes in identical images', async () => {
      // Mock file access
      (fs.access as any).mockResolvedValue(undefined);

      // Mock sharp processing with metadata
      const mockBuffer = Buffer.alloc(1920 * 1080 * 4);
      const mockSharp = {
        metadata: vi.fn().mockResolvedValue({ width: 1920, height: 1080 }),
        resize: vi.fn().mockReturnThis(),
        ensureAlpha: vi.fn().mockReturnThis(),
        raw: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(mockBuffer),
      };
      (sharp as any).mockReturnValue(mockSharp);

      // Mock pixelmatch (no differences)
      (pixelmatch as any).mockReturnValue(0);

      const result = await changeDetector.compareImages(
        '/baseline/test.png',
        '/current/test.png',
        mockOptions
      );

      expect(result.hasChanged).toBe(false);
      expect(result.pixelDifference).toBe(0);
      expect(result.percentageDifference).toBe(0);
      expect(result.baselinePath).toBe('/baseline/test.png');
      expect(result.currentPath).toBe('/current/test.png');
    });

    it('should detect changes in different images', async () => {
      // Mock file access
      (fs.access as any).mockResolvedValue(undefined);

      // Mock sharp processing with metadata
      const mockBuffer = Buffer.alloc(1920 * 1080 * 4);
      const mockSharp = {
        metadata: vi.fn().mockResolvedValue({ width: 1920, height: 1080 }),
        resize: vi.fn().mockReturnThis(),
        ensureAlpha: vi.fn().mockReturnThis(),
        raw: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(mockBuffer),
      };
      (sharp as any).mockReturnValue(mockSharp);

      // Mock pixelmatch (with differences above threshold)
      const totalPixels = 1920 * 1080;
      const differentPixels = Math.floor(totalPixels * 0.15); // 15% difference - well above 0.1% threshold
      (pixelmatch as any).mockReturnValue(differentPixels);

      // Mock fs.mkdir for diff output
      (fs.mkdir as any).mockResolvedValue(undefined);
      (fs.writeFile as any).mockResolvedValue(undefined);

      const result = await changeDetector.compareImages(
        '/baseline/test.png',
        '/current/test.png',
        mockOptions
      );

      expect(result.hasChanged).toBe(true);
      expect(result.pixelDifference).toBe(differentPixels);
      expect(result.percentageDifference).toBe(15);
      expect(result.diffPath).toContain('diff-test.png');
    });

    it('should handle missing baseline file', async () => {
      // Mock file access error for baseline
      (fs.access as any).mockRejectedValueOnce(new Error('File not found'));

      const result = await changeDetector.compareImages(
        '/baseline/missing.png',
        '/current/test.png',
        mockOptions
      );

      expect(result.hasChanged).toBe(false);
      expect(result.pixelDifference).toBe(0);
      expect(result.percentageDifference).toBe(0);
    });

    it('should handle image processing errors', async () => {
      // Mock file access
      (fs.access as any).mockResolvedValue(undefined);

      // Mock sharp error
      (sharp as any).mockImplementation(() => {
        throw new Error('Sharp processing error');
      });

      const result = await changeDetector.compareImages(
        '/baseline/test.png',
        '/current/test.png',
        mockOptions
      );

      expect(result.hasChanged).toBe(false);
      expect(result.pixelDifference).toBe(0);
    });
  });

  describe('compareDirectories', () => {
    it('should compare all images in directories', async () => {
      // Mock readdir
      (fs.readdir as any).mockResolvedValue(['test1.png', 'test2.jpg', 'readme.txt']);

      // Mock file access for baselines
      (fs.access as any).mockResolvedValue(undefined);

      // Mock sharp processing with metadata
      const mockBuffer = Buffer.alloc(100 * 100 * 4);
      const mockSharp = {
        metadata: vi.fn().mockResolvedValue({ width: 100, height: 100 }),
        resize: vi.fn().mockReturnThis(),
        ensureAlpha: vi.fn().mockReturnThis(),
        raw: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(mockBuffer),
      };
      (sharp as any).mockReturnValue(mockSharp);

      // Mock pixelmatch (no changes)
      (pixelmatch as any).mockReturnValue(0);

      const summary = await changeDetector.compareDirectories(
        '/baseline',
        '/current',
        mockOptions
      );

      expect(summary.totalImages).toBe(2); // Only image files
      expect(summary.changedImages).toBe(0);
      expect(summary.unchangedImages).toBe(2);
      expect(summary.results.length).toBe(2);
    });

    it('should handle missing baseline files as changes', async () => {
      // Mock readdir
      (fs.readdir as any).mockResolvedValue(['new-file.png']);

      // Mock file access error for baseline (file doesn't exist)
      (fs.access as any).mockRejectedValue(new Error('File not found'));

      const summary = await changeDetector.compareDirectories(
        '/baseline',
        '/current',
        mockOptions
      );

      expect(summary.totalImages).toBe(1);
      expect(summary.changedImages).toBe(1);
      expect(summary.results[0].hasChanged).toBe(true);
      expect(summary.results[0].percentageDifference).toBe(100);
    });

    it('should handle directory read errors', async () => {
      // Mock readdir error
      (fs.readdir as any).mockRejectedValue(new Error('Directory not found'));

      const summary = await changeDetector.compareDirectories(
        '/baseline',
        '/current',
        mockOptions
      );

      expect(summary.totalImages).toBe(0);
      expect(summary.changedImages).toBe(0);
      expect(summary.results.length).toBe(0);
    });
  });

  describe('updateBaselines', () => {
    it('should update baseline files with changed files', async () => {
      // Mock mkdir
      (fs.mkdir as any).mockResolvedValue(undefined);

      // Mock readdir
      (fs.readdir as any).mockResolvedValue(['file1.png', 'file2.png', 'file3.png']);

      // Mock fs operations
      (fs.access as any).mockResolvedValue(undefined);
      (fs.copyFile as any).mockResolvedValue(undefined);

      const changedFiles = ['file1.png', 'file2.png'];

      await changeDetector.updateBaselines('/temp', '/final', changedFiles);

      expect(fs.copyFile).toHaveBeenCalledTimes(2);
      expect(fs.copyFile).toHaveBeenCalledWith('/temp/file1.png', '/final/file1.png');
      expect(fs.copyFile).toHaveBeenCalledWith('/temp/file2.png', '/final/file2.png');
    });

    it('should update all files when no specific files provided', async () => {
      // Mock mkdir
      (fs.mkdir as any).mockResolvedValue(undefined);

      // Mock readdir
      (fs.readdir as any).mockResolvedValue(['file1.png', 'file2.png']);

      // Mock fs operations
      (fs.access as any).mockResolvedValue(undefined);
      (fs.copyFile as any).mockResolvedValue(undefined);

      await changeDetector.updateBaselines('/temp', '/final');

      expect(fs.copyFile).toHaveBeenCalledTimes(2);
    });

    it('should handle copy errors gracefully', async () => {
      // Mock mkdir
      (fs.mkdir as any).mockResolvedValue(undefined);

      // Mock readdir
      (fs.readdir as any).mockResolvedValue(['file1.png']);

      // Mock access success but copy failure
      (fs.access as any).mockResolvedValue(undefined);
      (fs.copyFile as any).mockRejectedValue(new Error('Copy failed'));

      // Should not throw
      await expect(changeDetector.updateBaselines('/temp', '/final')).resolves.toBeUndefined();
    });
  });

  describe('cleanupTempFiles', () => {
    it('should clean up all files in temp directory', async () => {
      // Mock readdir
      (fs.readdir as any).mockResolvedValue(['temp1.png', 'temp2.png']);

      // Mock unlink
      (fs.unlink as any).mockResolvedValue(undefined);

      await changeDetector.cleanupTempFiles('/temp');

      expect(fs.unlink).toHaveBeenCalledTimes(2);
      expect(fs.unlink).toHaveBeenCalledWith('/temp/temp1.png');
      expect(fs.unlink).toHaveBeenCalledWith('/temp/temp2.png');
    });

    it('should handle cleanup errors gracefully', async () => {
      // Mock readdir error
      (fs.readdir as any).mockRejectedValue(new Error('Directory not found'));

      // Should not throw
      await expect(changeDetector.cleanupTempFiles('/temp')).resolves.toBeUndefined();
    });
  });

});