# AGENTS.md - WordPress Pixel Police

This document provides guidelines for AI coding agents working in this repository.

## Project Overview

A Node.js CLI tool that captures before/after screenshots of WordPress websites to track visual changes during updates. Built with TypeScript and Playwright.

**Key Dependencies:**

- `playwright` - Browser automation for screenshots
- `pixelmatch` - Pixel-level image comparison
- `pngjs` - PNG image processing
- `@inquirer/prompts` - Interactive CLI prompts

## Build, Run, and Test Commands

### Development

```bash
# Run the application in development mode
npm start
# or
npm run dev

# Build TypeScript to JavaScript
npm run build
```

### Testing

No test framework is currently configured. When adding tests:

- Consider using Vitest or Jest
- Place tests in a `tests/` or `__tests__/` directory
- Add test scripts to package.json

### Type Checking

```bash
# Run TypeScript compiler for type checking (no emit)
npx tsc --noEmit

# Build with type checking
npm run build
```

### Installing Dependencies

```bash
# Install all dependencies
npm install

# Install Playwright browsers (required for screenshots)
npx playwright install chromium
```

## Project Structure

```
src/
  index.ts          # Main CLI entry point and workflow
  types.ts          # All TypeScript interfaces and types
  screenshot.ts     # Playwright screenshot manager
  diff.ts           # Image comparison using pixelmatch
  report.ts         # HTML report generator
  wordpress-api.ts  # WordPress REST API client
dist/               # Compiled JavaScript output (generated)
output/             # Screenshot output folders (gitignored)
```

## Code Style Guidelines

### TypeScript Configuration

The project uses strict TypeScript (ES2022 target, CommonJS modules):

- `strict: true` - All strict type checking enabled
- `esModuleInterop: true` - CommonJS/ES module interop
- `skipLibCheck: true` - Skip library type checking
- Source maps and declaration files are generated

### Imports

**Order imports as follows:**

1. Node.js built-in modules (`fs`, `path`, `child_process`)
2. External packages (`playwright`, `pngjs`, `pixelmatch`)
3. Internal modules (`./types`, `./screenshot`)

**Use `* as` for Node.js modules:**

```typescript
import * as fs from "fs"; // Correct
import fs from "fs"; // Avoid
```

### Types and Interfaces

**All types are centralized in `src/types.ts`:**

- Export interfaces from `types.ts` and import where needed
- Use descriptive interface names with `WP` prefix for WordPress types
- Use JSDoc comments for complex properties

**Prefer interfaces over type aliases for object shapes.**

### Naming Conventions

| Element    | Convention           | Example                              |
| ---------- | -------------------- | ------------------------------------ |
| Interfaces | PascalCase           | `ScreenshotResult`, `WPPostType`     |
| Functions  | camelCase            | `compareScreenshots`, `buildUrlList` |
| Constants  | SCREAMING_SNAKE_CASE | `VIEWPORTS`, `EXCLUDED_POST_TYPES`   |
| Variables  | camelCase            | `diffPixels`, `projectFolder`        |
| Classes    | PascalCase           | `ScreenshotManager`                  |
| Files      | kebab-case           | `wordpress-api.ts`, `screenshot.ts`  |

### Functions

**Use JSDoc-style module and function comments:**

```typescript
/**
 * Compare two screenshots and generate a diff image
 * @param beforePath - Path to the "before" screenshot
 * @param afterPath - Path to the "after" screenshot
 * @returns DiffResult with comparison statistics
 */
export function compareScreenshots(beforePath: string, afterPath: string): DiffResult {
```

**Use explicit return types for exported functions.**

### Async/Await

Use async/await pattern consistently:

```typescript
async function screenshotUrl(url: string): Promise<ScreenshotResult> {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
```

### Error Handling

**Use try/catch blocks for operations that can fail:**

```typescript
try {
  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error(`Failed: ${response.status} ${response.statusText}`);
  }
  return await response.json();
} catch (error) {
  console.error(
    `Error: ${error instanceof Error ? error.message : String(error)}`,
  );
  return [];
}
```

**Always type-check caught errors** - use `error instanceof Error ? error.message : String(error)`.

### Console Output

Use consistent console output patterns:

- `console.log('\nMessage...')` - Progress messages
- `console.log('  - detail')` - Indented details
- `console.warn('Warning: ...')` - Warnings
- `console.error('\nError: ...')` - Errors
- `process.stdout.write('Processing... ')` - Inline progress (no newline)

### File System Operations

**Always check existence before operations:**

```typescript
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}
```

**Use path.join for all path construction.**

### Class Pattern

Use class-based patterns for stateful modules (like `ScreenshotManager`):

- Initialize resources in `async init()`
- Clean up in `async close()`
- Use private properties for internal state

### Constants

Define configuration constants as `const` objects:

```typescript
export const VIEWPORTS = {
  desktop: { width: 1920, height: 1080 },
  mobile: { width: 390, height: 844 },
} as const;

export type ViewportType = keyof typeof VIEWPORTS;
```

### ESLint Disable Comments

When necessary, use targeted eslint-disable comments with the specific rule:

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
```

## HTML Report Generation

The report module (`src/report.ts`) generates static HTML:

- Uses template literals for HTML generation
- Always escape user content with `escapeHtml()`
- Date formatting uses German locale (`de-DE`)
- Inline CSS and JavaScript (no external dependencies)

## Playwright Usage

Key patterns for Playwright:

- Use `networkidle` wait state for page loads
- Scroll through pages to trigger lazy-loaded content
- Set appropriate timeouts (60 seconds for navigation)
- Use headless mode in production

```typescript
await page.goto(url, {
  waitUntil: "networkidle",
  timeout: 60000,
});
```
