#!/usr/bin/env node

/**
 * WordPress Screenshot Diff Tool
 * Main CLI entry point
 *
 * Captures before/after screenshots of WordPress sites to track visual changes during updates.
 */

import { input, confirm, checkbox, select } from "@inquirer/prompts";
import {
  buildUrlList,
  normalizeUrl,
  extractDomain,
  checkApiAccess,
  fetchPostTypesWithDetails,
} from "./wordpress-api";
import { ScreenshotManager, createProjectFolder } from "./screenshot";
import { saveReport } from "./report";
import { ProjectConfig, WPPostType, ComparisonResult, CookieConfig } from "./types";
import { compareScreenshots } from "./diff";
import { exec } from "child_process";
import * as path from "path";
import * as fs from "fs";

/**
 * Display welcome banner
 */
function showBanner(): void {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║       WordPress Update Screenshot Diff Tool               ║
║                                                           ║
║  Capture before/after screenshots to track visual         ║
║  changes during WordPress updates.                        ║
╚═══════════════════════════════════════════════════════════╝
`);
}

/**
 * Local development domain patterns that use self-signed certificates
 */
const LOCAL_DEV_DOMAINS = [
  ".ddev.site",
  ".local",
  ".test",
  ".localhost",
  ".lndo.site", // Lando
  ".wpe.dev", // WP Engine local
];

/**
 * Check if URL is a local development site and enable SSL bypass if needed
 */
function enableSslBypassForLocalDev(siteUrl: string): boolean {
  try {
    const hostname = new URL(siteUrl).hostname;
    const isLocalDev =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      LOCAL_DEV_DOMAINS.some((domain) => hostname.endsWith(domain));

    if (isLocalDev) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      console.log(
        `Local development site detected (${hostname}). SSL certificate validation disabled.`,
      );
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Open file in default browser (cross-platform)
 */
function openInBrowser(filePath: string): void {
  const command =
    process.platform === "darwin"
      ? `open "${filePath}"`
      : process.platform === "win32"
        ? `start "" "${filePath}"`
        : `xdg-open "${filePath}"`;

  exec(command, (error) => {
    if (error) {
      console.log(
        `Could not open browser automatically. Open manually: ${filePath}`,
      );
    }
  });
}

/**
 * Let user select which post types to include
 */
async function selectPostTypes(postTypes: WPPostType[]): Promise<WPPostType[]> {
  if (postTypes.length === 0) {
    return [];
  }

  console.log("\n");

  const choices = postTypes.map((pt) => ({
    name: `${pt.name} (${pt.slug})`,
    value: pt.slug,
    checked: true, // All selected by default
  }));

  const selectedSlugs = await checkbox({
    message:
      "Select post types to include (use space to toggle, enter to confirm):",
    choices,
  });

  // Filter to only selected post types
  const selectedTypes = postTypes.filter((pt) =>
    selectedSlugs.includes(pt.slug),
  );

  // Show what was excluded by user
  const userExcluded = postTypes.filter(
    (pt) => !selectedSlugs.includes(pt.slug),
  );
  if (userExcluded.length > 0) {
    console.log(
      `\nExcluded by user: ${userExcluded.map((pt) => pt.slug).join(", ")}`,
    );
  }

  return selectedTypes;
}

/**
 * Generate diff comparisons for all before/after screenshot pairs
 */
function generateDiffComparisons(config: ProjectConfig): ComparisonResult[] {
  const comparisons: ComparisonResult[] = [];
  const diffFolder = path.join(config.projectFolder, "diff");

  // Ensure diff folder exists
  if (!fs.existsSync(diffFolder)) {
    fs.mkdirSync(diffFolder, { recursive: true });
  }

  console.log("\nGenerating visual diff comparisons...\n");

  for (const before of config.beforeScreenshots) {
    const after = config.afterScreenshots.find(
      (a) => a.slug === before.slug && a.postType === before.postType,
    );

    if (!after) {
      console.log(`  Skipping ${before.slug}: no "after" screenshot found`);
      continue;
    }

    console.log(`  Comparing: ${before.title}`);

    try {
      // Generate desktop diff
      const beforeDesktopPath = path.join(
        config.projectFolder,
        before.desktopPath,
      );
      const afterDesktopPath = path.join(
        config.projectFolder,
        after.desktopPath,
      );
      const desktopDiffPath = path.join(
        diffFolder,
        `${before.postType}-${before.slug}-desktop-diff.png`,
      );
      const desktopDiff = compareScreenshots(
        beforeDesktopPath,
        afterDesktopPath,
        desktopDiffPath,
      );

      // Generate mobile diff
      const beforeMobilePath = path.join(
        config.projectFolder,
        before.mobilePath,
      );
      const afterMobilePath = path.join(config.projectFolder, after.mobilePath);
      const mobileDiffPath = path.join(
        diffFolder,
        `${before.postType}-${before.slug}-mobile-diff.png`,
      );
      const mobileDiff = compareScreenshots(
        beforeMobilePath,
        afterMobilePath,
        mobileDiffPath,
      );

      comparisons.push({
        url: before.url,
        slug: before.slug,
        postType: before.postType,
        title: before.title,
        before: {
          desktopPath: before.desktopPath,
          mobilePath: before.mobilePath,
        },
        after: {
          desktopPath: after.desktopPath,
          mobilePath: after.mobilePath,
        },
        diff: {
          desktop: desktopDiff,
          mobile: mobileDiff,
        },
      });

      // Show diff summary
      const desktopChanged = desktopDiff.diffPercentage > 0;
      const mobileChanged = mobileDiff.diffPercentage > 0;

      if (desktopChanged || mobileChanged) {
        console.log(
          `    Desktop: ${desktopDiff.diffPixels.toLocaleString()} pixels changed (${desktopDiff.diffPercentage.toFixed(2)}%)`,
        );
        console.log(
          `    Mobile:  ${mobileDiff.diffPixels.toLocaleString()} pixels changed (${mobileDiff.diffPercentage.toFixed(2)}%)`,
        );
      } else {
        console.log(`    No visual changes detected`);
      }
    } catch (error) {
      console.error(
        `    Error comparing ${before.slug}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return comparisons;
}

/**
 * Main application flow
 */
async function main(): Promise<void> {
  showBanner();

  try {
    // Step 1: Get WordPress URL
    const siteUrlInput = await input({
      message: "Enter the WordPress website URL:",
      validate: (value) => {
        if (!value.trim()) return "Please enter a URL";
        try {
          new URL(value.startsWith("http") ? value : `https://${value}`);
          return true;
        } catch {
          return "Please enter a valid URL";
        }
      },
    });

    const siteUrl = normalizeUrl(siteUrlInput);
    const domain = extractDomain(siteUrl);

    console.log(`\nTarget site: ${siteUrl}`);

    // Enable SSL bypass for local development sites
    enableSslBypassForLocalDev(siteUrl);

    // Step 2: Check API access
    console.log("\nChecking WordPress REST API access...");
    const apiAccessible = await checkApiAccess(siteUrl);

    if (!apiAccessible) {
      console.log("REST API not accessible. Will only screenshot homepage.");
    } else {
      console.log("REST API is accessible!");
    }

    // Step 3: Fetch and select post types
    let selectedPostTypes: WPPostType[] | undefined;

    if (apiAccessible) {
      console.log("\nFetching available post types...");
      const { included } = await fetchPostTypesWithDetails(siteUrl);

      if (included.length > 0) {
        selectedPostTypes = await selectPostTypes(included);

        if (selectedPostTypes.length === 0) {
          console.log(
            "\nNo post types selected. Will only screenshot homepage.",
          );
        } else {
          console.log(
            `\nSelected ${selectedPostTypes.length} post types: ${selectedPostTypes.map((pt) => pt.slug).join(", ")}`,
          );
        }
      }
    }

    // Step 4: Create project folder
    const projectFolder = createProjectFolder(domain);

    // Step 5: Configure cookie handling
    console.log("");
    console.log("We will try to click buttons with the following text if 'Auto-detect' is selected:");
    console.log([
        'Alle akzeptieren',
        'Alles akzeptieren',
        'Akzeptieren',
        'Zustimmen',
        'OK',
        'Einverstanden',
        'Verstanden',
        'Alle Cookies akzeptieren',
        'Accept',
        'Accept All',
        'Accept all cookies',
        'Agree',
        'I Agree',
        'Allow',
        'Allow all',
        'Okay',
        'Got it'
      ].join(", "));
    console.log("");

    const cookieMode = await select({
      message: "How should we handle cookie banners?",
      choices: [
        {
          name: "Auto-detect (Try common English/German buttons)",
          value: "auto",
        },
        {
          name: "Manual (I will provide the button text)",
          value: "custom",
        },
        {
          name: "Do nothing (Ignore banner)",
          value: "none",
        },
      ],
    });

    const cookieConfig: CookieConfig = {
      mode: cookieMode as "auto" | "custom" | "none",
    };

    if (cookieMode === "custom") {
      cookieConfig.customText = await input({
        message: "Enter the exact text of the cookie banner button:",
        validate: (value) => (value.trim() ? true : "Please enter the text"),
      });
    }

    // Step 6: Build URL list
    console.log("\nFetching URLs to screenshot...");
    const urls = await buildUrlList(siteUrl, 5, selectedPostTypes);

    if (urls.length === 0) {
      console.error("No URLs found to screenshot. Exiting.");
      process.exit(1);
    }

    // Display URLs that will be captured
    console.log("\nURLs to capture:");
    for (const url of urls) {
      console.log(`  - [${url.postType}] ${url.title}`);
    }

    // Initialize project config
    const config: ProjectConfig = {
      siteUrl,
      projectFolder,
      cookieConfig,
      startTime: new Date(),
      urls,
      beforeScreenshots: [],
      afterScreenshots: [],
    };

    // Step 7: Take BEFORE screenshots
    const screenshotManager = new ScreenshotManager(projectFolder, cookieConfig);
    await screenshotManager.init();

    config.beforeScreenshots = await screenshotManager.screenshotAll(
      urls,
      "before",
    );

    // Generate initial report (before only)
    saveReport(config);

    console.log("\n" + "═".repeat(60));
    console.log("  BEFORE screenshots complete!");
    console.log("═".repeat(60));
    console.log("\n  You can now perform your WordPress update.");
    console.log("  The current report is available at:");
    console.log(`  ${path.join(projectFolder, "report.html")}`);
    console.log("\n" + "═".repeat(60) + "\n");

    // Step 8: Wait for user to complete update
    const continueToAfter = await confirm({
      message:
        "Have you completed the WordPress update? Ready to take AFTER screenshots?",
      default: true,
    });

    if (!continueToAfter) {
      console.log(
        "\nExiting. You can view the BEFORE screenshots in the report.",
      );
      await screenshotManager.close();
      openInBrowser(path.join(projectFolder, "report.html"));
      return;
    }

    // Step 9: Take AFTER screenshots
    config.afterScreenshots = await screenshotManager.screenshotAll(
      urls,
      "after",
    );
    config.endTime = new Date();

    // Close browser
    await screenshotManager.close();

    // Step 10: Generate diff comparisons
    config.comparisons = generateDiffComparisons(config);

    // Show summary of changes
    const totalChanges = config.comparisons.reduce((acc, c) => {
      return (
        acc +
        (c.diff.desktop.diffPixels > 0 || c.diff.mobile.diffPixels > 0 ? 1 : 0)
      );
    }, 0);

    console.log(
      `\n${totalChanges} of ${config.comparisons.length} pages have visual changes.`,
    );

    // Step 11: Generate final report
    const reportPath = saveReport(config);

    console.log("\n" + "═".repeat(60));
    console.log("  Screenshot comparison complete!");
    console.log("═".repeat(60));
    console.log(`\n  Report: ${reportPath}`);
    console.log(`  Before: ${config.beforeScreenshots.length} screenshots`);
    console.log(`  After:  ${config.afterScreenshots.length} screenshots`);
    console.log("\n" + "═".repeat(60) + "\n");

    // Open report in browser
    const openReport = await confirm({
      message: "Open report in browser?",
      default: true,
    });

    if (openReport) {
      openInBrowser(reportPath);
    }

    console.log("\nDone! Thank you for using WordPress Pixel Police.");
  } catch (error) {
    if (error instanceof Error && error.name === "ExitPromptError") {
      console.log("\nOperation cancelled by user.");
      process.exit(0);
    }

    console.error("\nAn error occurred:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the application
main();
