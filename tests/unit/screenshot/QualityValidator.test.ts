import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QualityValidator, QualityConfig } from '../../../src/screenshot/QualityValidator.js';
import { ScreenshotResult } from '../../../src/screenshot/ScreenshotService.js';
import sharp from 'sharp';
import { promises as fs } from 'fs';

// Mock dependencies
vi.mock('sharp');
vi.mock('fs', async () => ({
  promises: {
    stat: vi.fn(),
  }
}));

describe('QualityValidator', () => {
  let validator: QualityValidator;
  let mockScreenshot: ScreenshotResult;
  let mockConfig: QualityConfig;

  beforeEach(() => {
    validator = new QualityValidator();
    
    mockScreenshot = {
      url: 'http://example.com',
      filename: 'test.png',
      viewport: { width: 1920, height: 1080, name: 'desktop' },
      format: 'png',
      path: '/test/test.png',
      timestamp: new Date(),
      size: 1024 * 100, // 100KB
    };

    mockConfig = {
      minWidth: 320,
      maxWidth: 3840,
      minHeight: 240,
      maxHeight: 2160,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      minFileSize: 1024, // 1KB
      requiredFormats: ['png'],
      qualityThreshold: 85, // Higher threshold so single failures will fail
    };

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('validateScreenshot', () => {
    it('should pass validation for valid screenshot', async () => {
      // Mock file stats
      (fs.stat as any).mockResolvedValue({
        size: mockScreenshot.size,
      });

      // Mock sharp metadata
      const mockSharp = {
        metadata: vi.fn().mockResolvedValue({
          width: 1920,
          height: 1080,
          format: 'png',
        }),
      };
      (sharp as any).mockReturnValue(mockSharp);

      const report = await validator.validateScreenshot(mockScreenshot, mockConfig);

      expect(report.passed).toBe(true);
      expect(report.overallScore).toBeGreaterThanOrEqual(85);
      expect(report.checks.length).toBeGreaterThan(0);
      expect(report.checks.every(check => check.passed)).toBe(true);
    });

    it('should fail validation for oversized file', async () => {
      // Mock oversized file
      (fs.stat as any).mockResolvedValue({
        size: 15 * 1024 * 1024, // 15MB
      });

      const mockSharp = {
        metadata: vi.fn().mockResolvedValue({
          width: 1920,
          height: 1080,
          format: 'png',
        }),
      };
      (sharp as any).mockReturnValue(mockSharp);

      const report = await validator.validateScreenshot(mockScreenshot, mockConfig);

      expect(report.passed).toBe(false);
      expect(report.overallScore).toBeLessThan(85);
      
      const fileSizeCheck = report.checks.find(check => check.name === 'File Size');
      expect(fileSizeCheck?.passed).toBe(false);
    });

    it('should fail validation for undersized file', async () => {
      // Mock undersized file
      (fs.stat as any).mockResolvedValue({
        size: 500, // 500 bytes
      });

      const mockSharp = {
        metadata: vi.fn().mockResolvedValue({
          width: 1920,
          height: 1080,
          format: 'png',
        }),
      };
      (sharp as any).mockReturnValue(mockSharp);

      const report = await validator.validateScreenshot(mockScreenshot, mockConfig);

      expect(report.passed).toBe(false);
      
      const fileSizeCheck = report.checks.find(check => check.name === 'File Size');
      expect(fileSizeCheck?.passed).toBe(false);
      expect(fileSizeCheck?.message).toContain('too small');
    });

    it('should fail validation for invalid dimensions', async () => {
      (fs.stat as any).mockResolvedValue({
        size: mockScreenshot.size,
      });

      // Mock invalid dimensions
      const mockSharp = {
        metadata: vi.fn().mockResolvedValue({
          width: 100, // Too small
          height: 50,  // Too small
          format: 'png',
        }),
      };
      (sharp as any).mockReturnValue(mockSharp);

      const report = await validator.validateScreenshot(mockScreenshot, mockConfig);

      expect(report.passed).toBe(false);
      
      const widthCheck = report.checks.find(check => check.name === 'Image Width');
      const heightCheck = report.checks.find(check => check.name === 'Image Height');
      
      expect(widthCheck?.passed).toBe(false);
      expect(heightCheck?.passed).toBe(false);
    });

    it('should fail validation for unsupported format', async () => {
      (fs.stat as any).mockResolvedValue({
        size: mockScreenshot.size,
      });

      const mockSharp = {
        metadata: vi.fn().mockResolvedValue({
          width: 1920,
          height: 1080,
          format: 'png',
        }),
      };
      (sharp as any).mockReturnValue(mockSharp);

      // Test with unsupported format
      const bmpScreenshot = { ...mockScreenshot, format: 'bmp' };
      
      const report = await validator.validateScreenshot(bmpScreenshot, mockConfig);

      expect(report.passed).toBe(false);
      
      const formatCheck = report.checks.find(check => check.name === 'Image Format');
      expect(formatCheck?.passed).toBe(false);
      expect(formatCheck?.message).toContain('Unsupported format');
    });

    it('should fail validation for viewport mismatch', async () => {
      (fs.stat as any).mockResolvedValue({
        size: mockScreenshot.size,
      });

      // Mock different dimensions than expected
      const mockSharp = {
        metadata: vi.fn().mockResolvedValue({
          width: 1600, // Different from expected 1920
          height: 1080,
          format: 'png',
        }),
      };
      (sharp as any).mockReturnValue(mockSharp);

      const report = await validator.validateScreenshot(mockScreenshot, mockConfig);

      const viewportCheck = report.checks.find(check => check.name === 'Viewport Match');
      expect(viewportCheck?.passed).toBe(false);
      expect(viewportCheck?.message).toContain('Viewport mismatch');
    });

    it('should handle file access errors', async () => {
      // Mock file access error
      (fs.stat as any).mockRejectedValue(new Error('File not found'));

      const report = await validator.validateScreenshot(mockScreenshot, mockConfig);

      expect(report.passed).toBe(false);
      expect(report.overallScore).toBe(0);
      
      const fileCheck = report.checks.find(check => check.name === 'File Access');
      expect(fileCheck?.passed).toBe(false);
      expect(fileCheck?.message).toContain('Failed to access screenshot file');
    });
  });

  describe('validateMultipleScreenshots', () => {
    it('should validate multiple screenshots', async () => {
      const screenshots = [mockScreenshot, { ...mockScreenshot, filename: 'test2.png' }];

      (fs.stat as any).mockResolvedValue({
        size: mockScreenshot.size,
      });

      const mockSharp = {
        metadata: vi.fn().mockResolvedValue({
          width: 1920,
          height: 1080,
          format: 'png',
        }),
      };
      (sharp as any).mockReturnValue(mockSharp);

      const reports = await validator.validateMultipleScreenshots(screenshots, mockConfig);

      expect(reports.length).toBe(2);
      expect(reports.every(report => report.passed)).toBe(true);
    });

    it('should handle validation errors for individual screenshots', async () => {
      const screenshots = [mockScreenshot];

      (fs.stat as any).mockRejectedValue(new Error('Validation error'));

      const reports = await validator.validateMultipleScreenshots(screenshots, mockConfig);

      expect(reports.length).toBe(1);
      expect(reports[0].passed).toBe(false);
      expect(reports[0].checks[0].name).toBe('File Access');
    });
  });

});