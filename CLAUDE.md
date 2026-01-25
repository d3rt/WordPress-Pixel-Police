# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Node.js CLI tool that captures before/after screenshots of WordPress websites to track visual changes during updates. Built with TypeScript and Playwright.

## Commands

```bash
# Run the application
npm start
# or
npm run dev

# Build TypeScript to JavaScript
npm run build

# Type checking
npx tsc --noEmit

# Install Playwright browser (required first time)
npx playwright install chromium
```

## Architecture

The tool follows a sequential workflow orchestrated by `src/index.ts`:

1. **URL Discovery** (`wordpress-api.ts`) - Queries WordPress REST API to discover public post types and their posts, building a list of URLs to screenshot
2. **Screenshot Capture** (`screenshot.ts`) - Uses Playwright to take full-page screenshots at desktop (1920x1080) and mobile (390x844) viewports, scrolling through pages to trigger lazy-loaded content
3. **Image Comparison** (`diff.ts`) - Uses pixelmatch to compare before/after screenshots, handling different image dimensions by padding with white
4. **Report Generation** (`report.ts`) - Generates a static HTML report with sidebar navigation, viewport tabs, and lightbox for image viewing

**Data Flow:**
- All types are centralized in `types.ts` with `WP` prefix for WordPress types
- `ProjectConfig` is the main state object passed through the workflow
- Screenshots are stored as `output/{date}_{domain}/{before|after|diff}/`

## Key Patterns

- Use `* as` for Node.js module imports: `import * as fs from 'fs'`
- Always type-check caught errors: `error instanceof Error ? error.message : String(error)`
- Use `networkidle` wait state and 60s timeout for Playwright page loads
- Date formatting uses German locale (`de-DE`)
- Use `path.join` for all path construction; check existence with `fs.existsSync` before operations

## WordPress API

The tool excludes system post types (attachment, nav_menu_item, wp_block, etc.) and REST bases (media, blocks, templates, etc.) that don't have public URLs. Posts are randomly sampled when there are more than needed.
