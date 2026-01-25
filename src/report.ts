/**
 * HTML Report Generator
 * Creates a visual comparison report of before/after screenshots
 */

import * as fs from "fs";
import * as path from "path";
import { ProjectConfig, ScreenshotResult, ComparisonResult } from "./types";

/**
 * Group screenshots by post type
 */
function groupByPostType(
  screenshots: ScreenshotResult[],
): Map<string, ScreenshotResult[]> {
  const grouped = new Map<string, ScreenshotResult[]>();

  for (const screenshot of screenshots) {
    const existing = grouped.get(screenshot.postType) || [];
    existing.push(screenshot);
    grouped.set(screenshot.postType, existing);
  }

  return grouped;
}

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  return date.toLocaleString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Calculate duration between two dates
 */
function formatDuration(start: Date, end: Date): string {
  const diff = end.getTime() - start.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Generate HTML for a single comparison card
 */
function generateComparisonCard(
  before: ScreenshotResult,
  after: ScreenshotResult | undefined,
  cardId: string,
  comparison?: ComparisonResult,
): string {
  const hasAfter = !!after;
  const hasDiff = !!comparison;

  // Diff statistics
  const desktopDiffStats = comparison
    ? formatDiffStats(
        comparison.diff.desktop.diffPixels,
        comparison.diff.desktop.diffPercentage,
      )
    : "";
  const mobileDiffStats = comparison
    ? formatDiffStats(
        comparison.diff.mobile.diffPixels,
        comparison.diff.mobile.diffPercentage,
      )
    : "";

  // Determine if there are changes
  const hasDesktopChanges =
    comparison && comparison.diff.desktop.diffPixels > 0;
  const hasMobileChanges = comparison && comparison.diff.mobile.diffPixels > 0;
  const hasAnyChanges = hasDesktopChanges || hasMobileChanges;

  return `
    <div class="comparison-card ${hasAnyChanges ? "has-changes" : "no-changes"}" id="card-${cardId}">
      <div class="card-header">
        <div class="card-title-row">
          <h3>${escapeHtml(before.title)}</h3>
          ${hasDiff ? `<span class="change-indicator ${hasAnyChanges ? "changed" : "unchanged"}">${hasAnyChanges ? "Changed" : "No Changes"}</span>` : ""}
        </div>
        <a href="${escapeHtml(before.url)}" target="_blank" class="url-link">${escapeHtml(before.url)}</a>
      </div>
      
      <div class="viewport-tabs">
        <button class="tab-btn active" data-viewport="desktop">
          Desktop
          ${hasDiff ? `<span class="tab-diff-indicator ${hasDesktopChanges ? "has-diff" : ""}">${desktopDiffStats}</span>` : ""}
        </button>
        <button class="tab-btn" data-viewport="mobile">
          Mobile
          ${hasDiff ? `<span class="tab-diff-indicator ${hasMobileChanges ? "has-diff" : ""}">${mobileDiffStats}</span>` : ""}
        </button>
      </div>
      
      <div class="comparison-container ${hasDiff ? "three-col" : ""}" data-viewport="desktop">
        <div class="image-wrapper before">
          <span class="label">Before</span>
          <img src="${before.desktopPath}" alt="Before - Desktop" loading="lazy" onclick="openLightbox(this.src)">
        </div>
        ${
          hasAfter
            ? `
        <div class="image-wrapper after">
          <span class="label">After</span>
          <img src="${after.desktopPath}" alt="After - Desktop" loading="lazy" onclick="openLightbox(this.src)">
        </div>
        `
            : '<div class="image-wrapper pending"><span class="label">After</span><div class="pending-msg">Pending...</div></div>'
        }
        ${
          hasDiff
            ? `
        <div class="image-wrapper diff">
          <span class="label">Diff</span>
          <img src="${comparison.diff.desktop.diffPath}" alt="Diff - Desktop" loading="lazy" onclick="openLightbox(this.src)">
          <div class="diff-stats">${comparison.diff.desktop.diffPixels.toLocaleString()} px (${comparison.diff.desktop.diffPercentage.toFixed(2)}%)</div>
        </div>
        `
            : ""
        }
      </div>
      
      <div class="comparison-container hidden ${hasDiff ? "three-col" : ""}" data-viewport="mobile">
        <div class="image-wrapper before">
          <span class="label">Before</span>
          <img src="${before.mobilePath}" alt="Before - Mobile" loading="lazy" onclick="openLightbox(this.src)">
        </div>
        ${
          hasAfter
            ? `
        <div class="image-wrapper after">
          <span class="label">After</span>
          <img src="${after.mobilePath}" alt="After - Mobile" loading="lazy" onclick="openLightbox(this.src)">
        </div>
        `
            : '<div class="image-wrapper pending"><span class="label">After</span><div class="pending-msg">Pending...</div></div>'
        }
        ${
          hasDiff
            ? `
        <div class="image-wrapper diff">
          <span class="label">Diff</span>
          <img src="${comparison.diff.mobile.diffPath}" alt="Diff - Mobile" loading="lazy" onclick="openLightbox(this.src)">
          <div class="diff-stats">${comparison.diff.mobile.diffPixels.toLocaleString()} px (${comparison.diff.mobile.diffPercentage.toFixed(2)}%)</div>
        </div>
        `
            : ""
        }
      </div>
    </div>
  `;
}

/**
 * Format diff statistics for display
 */
function formatDiffStats(pixels: number, percentage: number): string {
  if (pixels === 0) {
    return "No diff";
  }
  return `${percentage.toFixed(1)}%`;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (char) => map[char] || char);
}

/**
 * Generate sidebar navigation HTML with URLs grouped by post type
 */
function generateSidebarNav(
  beforeByType: Map<string, ScreenshotResult[]>,
  comparisons: ComparisonResult[],
): string {
  const postTypes = Array.from(beforeByType.keys());

  return postTypes
    .map((postType) => {
      const screenshots = beforeByType.get(postType) || [];
      const urlItems = screenshots
        .map((s, index) => {
          const itemId = `${postType}-${s.slug}`;
          const title =
            s.title.length > 30 ? s.title.substring(0, 30) + "..." : s.title;
          const comparison = comparisons.find(
            (c) => c.slug === s.slug && c.postType === s.postType,
          );
          const hasChanges =
            comparison &&
            (comparison.diff.desktop.diffPixels > 0 ||
              comparison.diff.mobile.diffPixels > 0);
          const changeClass = comparison
            ? hasChanges
              ? "nav-changed"
              : "nav-unchanged"
            : "";
          return `<a href="#card-${itemId}" class="nav-url ${changeClass}" data-card-id="card-${itemId}">${hasChanges ? '<span class="nav-change-dot"></span>' : ""}${escapeHtml(title)}</a>`;
        })
        .join("\n");

      // Count changes in this post type
      const changesInType = screenshots.filter((s) => {
        const comparison = comparisons.find(
          (c) => c.slug === s.slug && c.postType === s.postType,
        );
        return (
          comparison &&
          (comparison.diff.desktop.diffPixels > 0 ||
            comparison.diff.mobile.diffPixels > 0)
        );
      }).length;

      return `
      <div class="nav-group">
        <div class="nav-group-header" onclick="toggleNavGroup(this)">
          <span class="nav-group-title">${postType.charAt(0).toUpperCase() + postType.slice(1)}</span>
          ${changesInType > 0 ? `<span class="nav-group-changes">${changesInType}</span>` : ""}
          <span class="nav-group-count">${screenshots.length}</span>
          <span class="nav-group-arrow">&#9662;</span>
        </div>
        <div class="nav-group-items">
          ${urlItems}
        </div>
      </div>
    `;
    })
    .join("\n");
}

/**
 * Generate the full HTML report
 */
export function generateReport(config: ProjectConfig): string {
  const beforeByType = groupByPostType(config.beforeScreenshots);
  const afterByType = groupByPostType(config.afterScreenshots);
  const comparisons = config.comparisons || [];

  // Generate sidebar navigation
  const sidebarNav = generateSidebarNav(beforeByType, comparisons);

  // Generate sections for each post type
  const postTypes = Array.from(beforeByType.keys());
  const sections = postTypes
    .map((postType) => {
      const beforeScreenshots = beforeByType.get(postType) || [];
      const afterScreenshots = afterByType.get(postType) || [];

      const cards = beforeScreenshots
        .map((before) => {
          const after = afterScreenshots.find((a) => a.slug === before.slug);
          const comparison = comparisons.find(
            (c) => c.slug === before.slug && c.postType === before.postType,
          );
          const cardId = `${postType}-${before.slug}`;
          return generateComparisonCard(before, after, cardId, comparison);
        })
        .join("\n");

      return `
      <section id="section-${postType}" class="post-type-section">
        <h2>${postType.charAt(0).toUpperCase() + postType.slice(1)}</h2>
        <div class="cards-grid">
          ${cards}
        </div>
      </section>
    `;
    })
    .join("\n");

  const hasAfterScreenshots = config.afterScreenshots.length > 0;
  const hasComparisons = comparisons.length > 0;
  const changedCount = comparisons.filter(
    (c) => c.diff.desktop.diffPixels > 0 || c.diff.mobile.diffPixels > 0,
  ).length;
  const endTimeDisplay = config.endTime
    ? formatDate(config.endTime)
    : "In Progress...";
  const durationDisplay = config.endTime
    ? formatDuration(config.startTime, config.endTime)
    : "Ongoing";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WordPress Update Report - ${escapeHtml(config.siteUrl)}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: #f5f5f5;
      color: #333;
      line-height: 1.6;
    }
    
    /* Layout with sidebar */
    .layout {
      display: flex;
      min-height: 100vh;
    }
    
    /* Sidebar */
    .sidebar {
      width: 280px;
      background: #1e1e1e;
      color: #fff;
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      overflow-y: auto;
      z-index: 100;
    }
    
    .sidebar-header {
      padding: 1.5rem;
      background: linear-gradient(135deg, #0073aa, #00a0d2);
      border-bottom: 1px solid #333;
    }
    
    .sidebar-header h1 {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }
    
    .sidebar-header .site-url {
      font-size: 0.8rem;
      opacity: 0.9;
      word-break: break-all;
    }
    
    .sidebar-meta {
      padding: 1rem 1.5rem;
      background: #2a2a2a;
      border-bottom: 1px solid #333;
      font-size: 0.8rem;
    }
    
    .sidebar-meta-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.5rem;
    }
    
    .sidebar-meta-row:last-child {
      margin-bottom: 0;
    }
    
    .sidebar-meta-label {
      color: #888;
    }
    
    .sidebar-meta-value {
      color: #fff;
      font-weight: 500;
    }
    
    .status-badge {
      display: inline-block;
      padding: 0.15rem 0.5rem;
      border-radius: 3px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    
    .status-complete {
      background: #00a32a;
      color: white;
    }
    
    .status-pending {
      background: #dba617;
      color: #1e1e1e;
    }
    
    .sidebar-nav {
      padding: 1rem 0;
    }
    
    .nav-group {
      border-bottom: 1px solid #333;
    }
    
    .nav-group-header {
      display: flex;
      align-items: center;
      padding: 0.75rem 1.5rem;
      cursor: pointer;
      transition: background 0.2s;
    }
    
    .nav-group-header:hover {
      background: #2a2a2a;
    }
    
    .nav-group-title {
      flex: 1;
      font-weight: 600;
      font-size: 0.9rem;
    }
    
    .nav-group-count {
      background: #444;
      color: #aaa;
      padding: 0.1rem 0.5rem;
      border-radius: 10px;
      font-size: 0.75rem;
      margin-right: 0.5rem;
    }
    
    .nav-group-arrow {
      color: #666;
      transition: transform 0.2s;
    }
    
    .nav-group.collapsed .nav-group-arrow {
      transform: rotate(-90deg);
    }
    
    .nav-group.collapsed .nav-group-items {
      display: none;
    }
    
    .nav-group-items {
      background: #252525;
    }
    
    .nav-url {
      display: block;
      padding: 0.5rem 1.5rem 0.5rem 2rem;
      color: #aaa;
      text-decoration: none;
      font-size: 0.85rem;
      transition: all 0.2s;
      border-left: 3px solid transparent;
    }
    
    .nav-url:hover {
      background: #333;
      color: #fff;
      border-left-color: #0073aa;
    }
    
    .nav-url.active {
      background: #333;
      color: #fff;
      border-left-color: #00a0d2;
    }
    
    /* Main content */
    .main-content {
      flex: 1;
      margin-left: 280px;
      padding: 2rem;
    }
    
    .post-type-section {
      margin-bottom: 3rem;
    }
    
    .post-type-section h2 {
      font-size: 1.5rem;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid #0073aa;
    }
    
    .cards-grid {
      display: grid;
      gap: 2rem;
    }
    
    .comparison-card {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
      scroll-margin-top: 1rem;
    }
    
    .comparison-card:target {
      box-shadow: 0 0 0 3px #0073aa, 0 2px 8px rgba(0,0,0,0.1);
    }
    
    .card-header {
      padding: 1rem;
      border-bottom: 1px solid #eee;
    }
    
    .card-header h3 {
      font-size: 1.1rem;
      margin-bottom: 0.25rem;
    }
    
    .url-link {
      font-size: 0.85rem;
      color: #666;
      text-decoration: none;
    }
    
    .url-link:hover {
      color: #0073aa;
      text-decoration: underline;
    }
    
    .viewport-tabs {
      display: flex;
      border-bottom: 1px solid #eee;
    }
    
    .tab-btn {
      flex: 1;
      padding: 0.75rem;
      border: none;
      background: #f9f9f9;
      cursor: pointer;
      font-size: 0.9rem;
      transition: all 0.2s;
    }
    
    .tab-btn:hover {
      background: #eee;
    }
    
    .tab-btn.active {
      background: #0073aa;
      color: white;
    }
    
    .comparison-container {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      padding: 1rem;
    }
    
    .comparison-container.hidden {
      display: none;
    }
    
    .image-wrapper {
      position: relative;
      border: 1px solid #ddd;
      border-radius: 4px;
      overflow: hidden;
    }
    
    .image-wrapper .label {
      position: absolute;
      top: 0.5rem;
      left: 0.5rem;
      background: rgba(0,0,0,0.7);
      color: white;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      z-index: 10;
    }
    
    .image-wrapper.before .label {
      background: #d63638;
    }
    
    .image-wrapper.after .label {
      background: #00a32a;
    }
    
    .image-wrapper img {
      width: 100%;
      height: auto;
      display: block;
      cursor: pointer;
    }
    
    .pending-msg {
      padding: 4rem 2rem;
      text-align: center;
      color: #666;
      font-style: italic;
    }
    
    /* Diff-specific styles */
    .comparison-container.three-col {
      grid-template-columns: 1fr 1fr 1fr;
    }
    
    .image-wrapper.diff .label {
      background: #9333ea;
    }
    
    .diff-stats {
      position: absolute;
      bottom: 0.5rem;
      left: 0.5rem;
      background: rgba(0,0,0,0.7);
      color: white;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.7rem;
    }
    
    .card-title-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    
    .change-indicator {
      font-size: 0.7rem;
      padding: 0.2rem 0.5rem;
      border-radius: 3px;
      font-weight: 600;
    }
    
    .change-indicator.changed {
      background: #fee2e2;
      color: #dc2626;
    }
    
    .change-indicator.unchanged {
      background: #dcfce7;
      color: #16a34a;
    }
    
    .tab-diff-indicator {
      font-size: 0.7rem;
      margin-left: 0.5rem;
      padding: 0.1rem 0.4rem;
      border-radius: 3px;
      background: rgba(255,255,255,0.2);
    }
    
    .tab-diff-indicator.has-diff {
      background: #fee2e2;
      color: #dc2626;
    }
    
    .tab-btn.active .tab-diff-indicator.has-diff {
      background: rgba(220, 38, 38, 0.3);
      color: #fff;
    }
    
    .comparison-card.has-changes {
      border-left: 4px solid #dc2626;
    }
    
    .comparison-card.no-changes {
      border-left: 4px solid #16a34a;
    }
    
    /* Sidebar change indicators */
    .nav-group-changes {
      background: #dc2626;
      color: white;
      padding: 0.1rem 0.4rem;
      border-radius: 10px;
      font-size: 0.7rem;
      margin-right: 0.25rem;
    }
    
    .nav-change-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      background: #dc2626;
      border-radius: 50%;
      margin-right: 0.5rem;
    }
    
    .nav-url.nav-unchanged {
      opacity: 0.6;
    }
    
    .sidebar-meta-value.has-changes {
      color: #f87171;
    }
    
    /* Lightbox */
    .lightbox {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.9);
      z-index: 1000;
      cursor: pointer;
      overflow: auto;
      padding: 2rem;
    }
    
    .lightbox.active {
      display: flex;
      align-items: flex-start;
      justify-content: center;
    }
    
    .lightbox img {
      max-width: 100%;
      height: auto;
    }
    
    .lightbox-close {
      position: fixed;
      top: 1rem;
      right: 1rem;
      background: white;
      border: none;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      font-size: 1.5rem;
      cursor: pointer;
      z-index: 1001;
    }
    
    footer {
      text-align: center;
      padding: 2rem;
      color: #666;
      font-size: 0.9rem;
    }
    
    /* Mobile toggle */
    .sidebar-toggle {
      display: none;
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: #0073aa;
      color: white;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      z-index: 101;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    
    @media (max-width: 1400px) {
      .comparison-container.three-col {
        grid-template-columns: 1fr 1fr;
      }
      
      .comparison-container.three-col .image-wrapper.diff {
        grid-column: span 2;
      }
    }
    
    @media (max-width: 1024px) {
      .sidebar {
        transform: translateX(-100%);
        transition: transform 0.3s;
      }
      
      .sidebar.open {
        transform: translateX(0);
      }
      
      .main-content {
        margin-left: 0;
      }
      
      .sidebar-toggle {
        display: block;
      }
      
      .comparison-container {
        grid-template-columns: 1fr;
      }
      
      .comparison-container.three-col {
        grid-template-columns: 1fr;
      }
      
      .comparison-container.three-col .image-wrapper.diff {
        grid-column: span 1;
      }
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <h1>WordPress Update Report</h1>
        <div class="site-url">${escapeHtml(config.siteUrl)}</div>
      </div>
      
      <div class="sidebar-meta">
        <div class="sidebar-meta-row">
          <span class="sidebar-meta-label">Started</span>
          <span class="sidebar-meta-value">${formatDate(config.startTime)}</span>
        </div>
        <div class="sidebar-meta-row">
          <span class="sidebar-meta-label">Finished</span>
          <span class="sidebar-meta-value">${endTimeDisplay}</span>
        </div>
        <div class="sidebar-meta-row">
          <span class="sidebar-meta-label">Duration</span>
          <span class="sidebar-meta-value">${durationDisplay}</span>
        </div>
        <div class="sidebar-meta-row">
          <span class="sidebar-meta-label">URLs</span>
          <span class="sidebar-meta-value">${config.beforeScreenshots.length}</span>
        </div>
        ${
          hasComparisons
            ? `
        <div class="sidebar-meta-row">
          <span class="sidebar-meta-label">Changes</span>
          <span class="sidebar-meta-value ${changedCount > 0 ? "has-changes" : ""}">${changedCount} of ${comparisons.length}</span>
        </div>
        `
            : ""
        }
        <div class="sidebar-meta-row">
          <span class="sidebar-meta-label">Status</span>
          <span class="sidebar-meta-value">
            <span class="status-badge ${hasAfterScreenshots ? "status-complete" : "status-pending"}">
              ${hasAfterScreenshots ? "Complete" : "Awaiting Update"}
            </span>
          </span>
        </div>
      </div>
      
      <nav class="sidebar-nav">
        ${sidebarNav}
      </nav>
    </aside>
    
    <main class="main-content">
      ${sections}
      
      <footer>
        <a href="https://github.com/d3rt" target="_blank">Generated by Tobias Derksen</a>
      </footer>
    </main>
  </div>
  
  <button class="sidebar-toggle" id="sidebarToggle" onclick="toggleSidebar()">&#9776;</button>
  
  <div class="lightbox" id="lightbox">
    <button class="lightbox-close" onclick="closeLightbox()">&times;</button>
    <img src="" alt="Full size" id="lightbox-img">
  </div>
  
  <script>
    // Toggle nav group collapse
    function toggleNavGroup(header) {
      header.parentElement.classList.toggle('collapsed');
    }
    
    // Toggle sidebar on mobile
    function toggleSidebar() {
      document.getElementById('sidebar').classList.toggle('open');
    }
    
    // Close sidebar when clicking a link on mobile
    document.querySelectorAll('.nav-url').forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 1024) {
          document.getElementById('sidebar').classList.remove('open');
        }
      });
    });
    
    // Highlight active nav item on scroll
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const id = entry.target.id;
        const navLink = document.querySelector(\`.nav-url[data-card-id="\${id}"]\`);
        if (navLink) {
          if (entry.isIntersecting) {
            document.querySelectorAll('.nav-url').forEach(l => l.classList.remove('active'));
            navLink.classList.add('active');
          }
        }
      });
    }, { threshold: 0.3 });
    
    document.querySelectorAll('.comparison-card').forEach(card => {
      observer.observe(card);
    });
    
    // Viewport tab switching
    document.querySelectorAll('.comparison-card').forEach(card => {
      const tabs = card.querySelectorAll('.tab-btn');
      const containers = card.querySelectorAll('.comparison-container');
      
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const viewport = tab.dataset.viewport;
          
          tabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          
          containers.forEach(c => {
            c.classList.toggle('hidden', c.dataset.viewport !== viewport);
          });
        });
      });
    });
    
    // Lightbox
    function openLightbox(src) {
      document.getElementById('lightbox-img').src = src;
      document.getElementById('lightbox').classList.add('active');
      document.body.style.overflow = 'hidden';
    }
    
    function closeLightbox() {
      document.getElementById('lightbox').classList.remove('active');
      document.body.style.overflow = '';
    }
    
    document.getElementById('lightbox').addEventListener('click', (e) => {
      if (e.target.id === 'lightbox') closeLightbox();
    });
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeLightbox();
    });
  </script>
</body>
</html>`;
}

/**
 * Save the report to disk
 */
export function saveReport(config: ProjectConfig): string {
  const html = generateReport(config);
  const reportPath = path.join(config.projectFolder, "report.html");
  fs.writeFileSync(reportPath, html, "utf-8");
  console.log(`\nReport saved: ${reportPath}`);
  return reportPath;
}
