/**
 * Image Diff Module
 * Compares before/after screenshots and generates visual diff images
 */

import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { DiffResult } from './types';

/**
 * Options for image comparison
 */
export interface CompareOptions {
  /** Matching threshold (0-1). Lower = more sensitive. Default: 0.1 */
  threshold?: number;
  /** Color for different pixels [R, G, B]. Default: [255, 0, 0] (red) */
  diffColor?: [number, number, number];
  /** Blending factor for unchanged pixels (0-1). Default: 0.1 */
  alpha?: number;
  /** If true, only show diff on transparent background */
  diffMask?: boolean;
}

const DEFAULT_OPTIONS: Required<CompareOptions> = {
  threshold: 0.1,
  diffColor: [255, 0, 0],
  alpha: 0.1,
  diffMask: false,
};

/**
 * Read a PNG file and return the PNG object
 */
function readPng(filePath: string): PNG {
  const buffer = fs.readFileSync(filePath);
  return PNG.sync.read(buffer);
}

/**
 * Write a PNG object to a file
 */
function writePng(png: PNG, filePath: string): void {
  const buffer = PNG.sync.write(png);
  fs.writeFileSync(filePath, buffer);
}

/**
 * Pad an image to match target dimensions (adds white space at bottom/right)
 */
function padImage(png: PNG, targetWidth: number, targetHeight: number): PNG {
  if (png.width === targetWidth && png.height === targetHeight) {
    return png;
  }

  const padded = new PNG({ width: targetWidth, height: targetHeight });
  
  // Fill with white background
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const idx = (targetWidth * y + x) * 4;
      padded.data[idx] = 255;     // R
      padded.data[idx + 1] = 255; // G
      padded.data[idx + 2] = 255; // B
      padded.data[idx + 3] = 255; // A
    }
  }

  // Copy original image data
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const srcIdx = (png.width * y + x) * 4;
      const dstIdx = (targetWidth * y + x) * 4;
      padded.data[dstIdx] = png.data[srcIdx];
      padded.data[dstIdx + 1] = png.data[srcIdx + 1];
      padded.data[dstIdx + 2] = png.data[srcIdx + 2];
      padded.data[dstIdx + 3] = png.data[srcIdx + 3];
    }
  }

  return padded;
}

/**
 * Compare two screenshots and generate a diff image
 * 
 * @param beforePath - Path to the "before" screenshot
 * @param afterPath - Path to the "after" screenshot
 * @param diffPath - Path where the diff image will be saved
 * @param options - Comparison options
 * @returns DiffResult with comparison statistics
 */
export function compareScreenshots(
  beforePath: string,
  afterPath: string,
  diffPath: string,
  options: CompareOptions = {}
): DiffResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Check if files exist
  if (!fs.existsSync(beforePath)) {
    throw new Error(`Before screenshot not found: ${beforePath}`);
  }
  if (!fs.existsSync(afterPath)) {
    throw new Error(`After screenshot not found: ${afterPath}`);
  }

  // Read images
  let img1 = readPng(beforePath);
  let img2 = readPng(afterPath);

  // Handle different dimensions
  const width = Math.max(img1.width, img2.width);
  const height = Math.max(img1.height, img2.height);
  const dimensionsDiffer = img1.width !== img2.width || img1.height !== img2.height;

  if (dimensionsDiffer) {
    console.log(`  Note: Image dimensions differ. Before: ${img1.width}x${img1.height}, After: ${img2.width}x${img2.height}`);
    img1 = padImage(img1, width, height);
    img2 = padImage(img2, width, height);
  }

  // Create diff image
  const diff = new PNG({ width, height });

  // Run pixelmatch comparison
  const diffPixels = pixelmatch(
    img1.data,
    img2.data,
    diff.data,
    width,
    height,
    {
      threshold: opts.threshold,
      diffColor: opts.diffColor,
      alpha: opts.alpha,
      diffMask: opts.diffMask,
    }
  );

  // Calculate statistics
  const totalPixels = width * height;
  const diffPercentage = (diffPixels / totalPixels) * 100;

  // Ensure diff directory exists
  const diffDir = path.dirname(diffPath);
  if (!fs.existsSync(diffDir)) {
    fs.mkdirSync(diffDir, { recursive: true });
  }

  // Write diff image
  writePng(diff, diffPath);

  return {
    diffPixels,
    totalPixels,
    diffPercentage,
    diffPath,
    dimensionsDiffer,
    beforeDimensions: { width: img1.width, height: img1.height },
    afterDimensions: { width: img2.width, height: img2.height },
  };
}

/**
 * Compare all before/after screenshot pairs for a given phase
 * 
 * @param beforeScreenshots - Array of before screenshot paths (desktop, mobile)
 * @param afterScreenshots - Array of after screenshot paths (desktop, mobile)
 * @param diffFolder - Folder to save diff images
 * @returns Object with desktop and mobile diff results
 */
export function compareAllScreenshots(
  beforeDesktopPath: string,
  beforeMobilePath: string,
  afterDesktopPath: string,
  afterMobilePath: string,
  diffFolder: string,
  slug: string
): { desktop: DiffResult; mobile: DiffResult } {
  const desktopDiffPath = path.join(diffFolder, `${slug}-desktop-diff.png`);
  const mobileDiffPath = path.join(diffFolder, `${slug}-mobile-diff.png`);

  console.log(`  Comparing desktop screenshots...`);
  const desktop = compareScreenshots(beforeDesktopPath, afterDesktopPath, desktopDiffPath);

  console.log(`  Comparing mobile screenshots...`);
  const mobile = compareScreenshots(beforeMobilePath, afterMobilePath, mobileDiffPath);

  return { desktop, mobile };
}
