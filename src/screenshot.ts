/**
 * Screenshot Module
 * Uses Playwright to capture full-page screenshots
 */

import { chromium, Browser, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { UrlToScreenshot, ScreenshotResult, VIEWPORTS, ViewportType, CookieConfig } from './types';

/**
 * Common cookie banner button texts (German and English)
 */
const COMMON_COOKIE_TEXTS = [
  // German
  'Alle akzeptieren',
  'Alles akzeptieren',
  'Akzeptieren',
  'Zustimmen',
  'OK',
  'Einverstanden',
  'Verstanden',
  'Alle Cookies akzeptieren',
  
  // English
  'Accept',
  'Accept All',
  'Accept all cookies',
  'Agree',
  'I Agree',
  'Allow',
  'Allow all',
  'Okay',
  'Got it'
];

/**
 * Sanitize filename to remove invalid characters
 */
function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50); // Limit length
}

/**
 * Screenshot manager class
 */
export class ScreenshotManager {
  private browser: Browser | null = null;
  private projectFolder: string;
  private cookieConfig: CookieConfig;

  constructor(projectFolder: string, cookieConfig: CookieConfig) {
    this.projectFolder = projectFolder;
    this.cookieConfig = cookieConfig;
  }

  /**
   * Initialize browser
   */
  async init(): Promise<void> {
    console.log('Launching browser...');
    this.browser = await chromium.launch({
      headless: true,
    });
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Ensure directory exists
   */
  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Handle cookie banner based on configuration
   */
  private async handleCookieBanner(page: Page): Promise<void> {
    if (this.cookieConfig.mode === 'none') {
      return;
    }

    console.log('    Checking for cookie banner...');

    // Trigger scroll-based banners
    try {
      await page.mouse.wheel(0, 10);
      await page.waitForTimeout(500);
    } catch (e) { /* ignore */ }

    const searchTexts = this.cookieConfig.mode === 'custom' && this.cookieConfig.customText
      ? [this.cookieConfig.customText]
      : COMMON_COOKIE_TEXTS;

    try {
      // Try to find and click the cookie button
      for (const text of searchTexts) {
        console.log(`    Searching for cookie button with text: "${text}"`);
        
        try {
          // Strategy 1: Playwright's specific role locator (most reliable for actual buttons)
          // We use explicit matching to avoid accidental clicks on privacy policy links etc.
          const button = page.getByRole('button', { name: text });
          if (await button.isVisible({ timeout: 500 })) {
             await button.click({ timeout: 1000 });
             console.log(`    Clicked cookie button (role=button): "${text}"`);
             await page.waitForTimeout(1500); // Wait for animation
             return;
          }
        } catch (e) { /* ignore */ }

        try {
          // Strategy 2: Exact text match on common clickable elements
          // specific tags to avoid clicking random paragraphs
          const element = page.locator(`button:text-is("${text}"), a:text-is("${text}"), [role="button"]:text-is("${text}"), input[type="button"][value="${text}"]`);
          if (await element.count() > 0 && await element.first().isVisible({ timeout: 500 })) {
            await element.first().click({ timeout: 1000 });
            console.log(`    Clicked cookie button (exact text): "${text}"`);
            await page.waitForTimeout(1500);
            return;
          }
        } catch (e) { /* ignore */ }

        try {
           // Strategy 3: Loose text match (contains) - high risk of false positives, so we check stricter tags first
           // Use text= syntax which is robust in Playwright
           const textLocator = page.locator(`text=${text}`).first();
           if (await textLocator.isVisible({ timeout: 500 })) {
             // Check if it's clickable or inside a clickable element
             await textLocator.click({ timeout: 1000 });
             console.log(`    Clicked cookie element (text match): "${text}"`);
             await page.waitForTimeout(1500);
             return;
           }
        } catch (e) { /* ignore */ }
      }
      
      if (this.cookieConfig.mode === 'custom') {
        console.warn(`    Warning: Could not find any clickable element containing "${this.cookieConfig.customText}"`);
        // Fallback: Dump visible buttons to help user debug
        try {
           const buttons = await page.getByRole('button').allInnerTexts();
           const visibleButtons = buttons.filter(b => b.trim().length > 0).slice(0, 10);
           if (visibleButtons.length > 0) {
             console.log(`    Visible buttons found on page: ${visibleButtons.join(', ')}`);
           }
        } catch (e) { /* ignore */ }
      }
      
    } catch (error) {
      console.warn(`    Warning: Error handling cookie banner: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Scroll through the entire page to trigger lazy-loaded content
   */
  private async scrollToLoadAllContent(page: Page): Promise<void> {
    await page.evaluate(async () => {
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = (globalThis as any).document;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = (globalThis as any).window;
      
      const scrollHeight = doc.body.scrollHeight;
      const viewportHeight = win.innerHeight;
      const scrollStep = viewportHeight * 0.8; // Scroll 80% of viewport at a time
      
      let currentPosition = 0;
      
      // Scroll down incrementally
      while (currentPosition < scrollHeight) {
        win.scrollTo(0, currentPosition);
        await delay(100); // Small delay to let lazy-load trigger
        currentPosition += scrollStep;
        
        // Re-check scroll height as it might change with lazy content
        const newScrollHeight = doc.body.scrollHeight;
        if (newScrollHeight > scrollHeight) {
          // Page got taller, continue scrolling
        }
      }
      
      // Scroll to absolute bottom
      win.scrollTo(0, doc.body.scrollHeight);
      await delay(200);
      
      // Scroll back to top
      win.scrollTo(0, 0);
      await delay(100);
    });
  }

  /**
   * Take a screenshot at a specific viewport
   */
  private async takeScreenshot(
    page: Page,
    url: string,
    outputPath: string,
    viewport: ViewportType
  ): Promise<void> {
    const { width, height } = VIEWPORTS[viewport];
    
    await page.setViewportSize({ width, height });
    await page.goto(url, { 
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    
    // Handle cookie banner
    await this.handleCookieBanner(page);

    // Scroll through page to trigger all lazy-loaded images
    await this.scrollToLoadAllContent(page);
    
    // Wait for any images that started loading during scroll
    await page.waitForLoadState('networkidle');
    
    // Additional wait for images to render
    await page.waitForTimeout(500);
    
    await page.screenshot({
      path: outputPath,
      fullPage: true,
    });
  }

  /**
   * Take screenshots for a single URL (both desktop and mobile)
   */
  async screenshotUrl(
    urlInfo: UrlToScreenshot,
    phase: 'before' | 'after'
  ): Promise<ScreenshotResult> {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call init() first.');
    }

    const context = await this.browser.newContext();
    const page = await context.newPage();

    const phaseFolder = path.join(this.projectFolder, phase);
    this.ensureDir(phaseFolder);

    const baseFilename = `${sanitizeFilename(urlInfo.postType)}-${sanitizeFilename(urlInfo.slug)}`;
    const desktopPath = path.join(phaseFolder, `${baseFilename}-desktop.png`);
    const mobilePath = path.join(phaseFolder, `${baseFilename}-mobile.png`);

    try {
      console.log(`  Screenshotting: ${urlInfo.title} (${urlInfo.url})`);
      
      // Desktop screenshot
      process.stdout.write('    Desktop... ');
      await this.takeScreenshot(page, urlInfo.url, desktopPath, 'desktop');
      console.log('done');
      
      // Mobile screenshot
      process.stdout.write('    Mobile... ');
      await this.takeScreenshot(page, urlInfo.url, mobilePath, 'mobile');
      console.log('done');

    } catch (error) {
      console.error(`\n    Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await context.close();
    }

    return {
      ...urlInfo,
      desktopPath: path.relative(this.projectFolder, desktopPath),
      mobilePath: path.relative(this.projectFolder, mobilePath),
    };
  }

  /**
   * Take screenshots for all URLs
   */
  async screenshotAll(
    urls: UrlToScreenshot[],
    phase: 'before' | 'after'
  ): Promise<ScreenshotResult[]> {
    console.log(`\nTaking ${phase.toUpperCase()} screenshots (${urls.length} URLs)...\n`);
    
    const results: ScreenshotResult[] = [];
    
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`[${i + 1}/${urls.length}] ${url.postType}: ${url.slug}`);
      const result = await this.screenshotUrl(url, phase);
      results.push(result);
    }
    
    console.log(`\n${phase.toUpperCase()} screenshots complete!`);
    return results;
  }
}

/**
 * Create project folder with date and domain
 */
export function createProjectFolder(domain: string, baseFolder: string = 'output'): string {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const folderName = `${date}_${domain}`;
  const fullPath = path.join(process.cwd(), baseFolder, folderName);
  
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
  
  console.log(`Project folder: ${fullPath}`);
  return fullPath;
}
