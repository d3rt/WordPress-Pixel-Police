/**
 * WordPress REST API Client
 * Fetches public post types and their posts
 */

import {
  WPPostType,
  WPPostTypesResponse,
  WPPost,
  UrlToScreenshot,
  PostTypeWithPosts,
} from './types';

// Post types to exclude (built-in non-content types)
const EXCLUDED_POST_TYPES = [
  'attachment',
  'nav_menu_item',
  'wp_block',
  'wp_template',
  'wp_template_part',
  'wp_navigation',
  'wp_font_family',
  'wp_font_face',
  'wp_global_styles',
];

// REST bases to exclude (system endpoints that don't have public URLs)
const EXCLUDED_REST_BASES = [
  'media',
  'blocks',
  'templates',
  'template-parts',
  'global-styles',
  'navigation',
  'font-families',
  'menu-items',
];

/**
 * Normalize URL to ensure it has protocol and no trailing slash
 */
export function normalizeUrl(url: string): string {
  let normalized = url.trim();
  
  // Add https if no protocol
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }
  
  // Remove trailing slash
  normalized = normalized.replace(/\/+$/, '');
  
  return normalized;
}

/**
 * Extract domain from URL for folder naming
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(normalizeUrl(url));
    return urlObj.hostname.replace(/\./g, '-');
  } catch {
    return 'unknown-site';
  }
}

/**
 * Result of fetching post types, including both included and excluded types
 */
export interface FetchPostTypesResult {
  included: WPPostType[];
  excluded: { type: WPPostType; reason: string }[];
}

/**
 * Fetch public post types from WordPress REST API
 * Returns both included and excluded types with reasons
 */
export async function fetchPostTypesWithDetails(siteUrl: string): Promise<FetchPostTypesResult> {
  const normalizedUrl = normalizeUrl(siteUrl);
  const apiUrl = `${normalizedUrl}/wp-json/wp/v2/types`;
  
  console.log(`Fetching post types from: ${apiUrl}`);
  
  const response = await fetch(apiUrl, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'WordPress-Wartung-Screenshot-Tool/1.0',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch post types: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json() as WPPostTypesResponse;
  
  const included: WPPostType[] = [];
  const excluded: { type: WPPostType; reason: string }[] = [];
  
  // Filter for post types with REST base, excluding system types
  // Note: The 'viewable' field is not always returned by the API, so we rely on
  // the exclusion lists and later verify if posts have public links
  for (const type of Object.values(data)) {
    // Must have a rest_base
    if (!type.rest_base) {
      excluded.push({ type, reason: 'No REST base' });
      continue;
    }
    
    // Skip if rest_base contains regex patterns (like font-faces with (?P<id>...))
    if (type.rest_base.includes('(?P<')) {
      excluded.push({ type, reason: 'Dynamic REST endpoint' });
      continue;
    }
    
    // Skip excluded post type slugs
    if (EXCLUDED_POST_TYPES.includes(type.slug)) {
      excluded.push({ type, reason: 'System post type' });
      continue;
    }
    
    // Skip excluded REST bases
    if (EXCLUDED_REST_BASES.includes(type.rest_base)) {
      excluded.push({ type, reason: 'System REST endpoint' });
      continue;
    }
    
    included.push(type);
  }
  
  // Log included types
  console.log(`\nFound ${included.length} public post types: ${included.map(t => t.slug).join(', ')}`);
  
  // Log excluded types
  if (excluded.length > 0) {
    console.log(`\nExcluded ${excluded.length} system post types:`);
    for (const { type, reason } of excluded) {
      console.log(`  - ${type.slug} (${reason})`);
    }
  }
  
  return { included, excluded };
}

/**
 * Fetch public post types from WordPress REST API (simple version)
 */
export async function fetchPostTypes(siteUrl: string): Promise<WPPostType[]> {
  const result = await fetchPostTypesWithDetails(siteUrl);
  return result.included;
}

/**
 * Fetch posts for a specific post type
 */
export async function fetchPosts(
  siteUrl: string,
  postType: WPPostType,
  count: number = 20
): Promise<WPPost[]> {
  const normalizedUrl = normalizeUrl(siteUrl);
  const apiUrl = `${normalizedUrl}/wp-json/wp/v2/${postType.rest_base}?per_page=${count}&_fields=id,slug,link,title,type`;
  
  console.log(`Fetching ${postType.slug} posts from: ${apiUrl}`);
  
  try {
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'WordPress-Wartung-Screenshot-Tool/1.0',
      },
    });
    
    if (!response.ok) {
      console.warn(`Failed to fetch ${postType.slug} posts: ${response.status}`);
      return [];
    }
    
    const posts = await response.json() as WPPost[];
    
    // Filter to only posts with a public link (URL)
    const postsWithLinks = posts.filter(post => post.link && post.link.startsWith('http'));
    
    console.log(`Found ${postsWithLinks.length} ${postType.slug} posts with public URLs`);
    
    return postsWithLinks;
  } catch (error) {
    console.warn(`Error fetching ${postType.slug} posts: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * Randomly select n items from an array
 */
function randomSelect<T>(array: T[], n: number): T[] {
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

/**
 * Fetch all public post types and their posts
 * @param siteUrl - The WordPress site URL
 * @param postsPerType - Number of posts to fetch per type
 * @param selectedPostTypes - Optional list of post types to use (if not provided, fetches all)
 */
export async function fetchAllPostTypesWithPosts(
  siteUrl: string,
  postsPerType: number = 5,
  selectedPostTypes?: WPPostType[]
): Promise<PostTypeWithPosts[]> {
  const postTypes = selectedPostTypes ?? await fetchPostTypes(siteUrl);
  const results: PostTypeWithPosts[] = [];
  
  for (const postType of postTypes) {
    // Fetch more posts than needed, then randomly select
    const posts = await fetchPosts(siteUrl, postType, 20);
    const selectedPosts = randomSelect(posts, postsPerType);
    
    results.push({
      postType,
      posts: selectedPosts,
    });
  }
  
  return results;
}

/**
 * Build list of URLs to screenshot
 * @param siteUrl - The WordPress site URL
 * @param postsPerType - Number of posts to fetch per type
 * @param selectedPostTypes - Optional list of post types to use (if not provided, fetches all)
 */
export async function buildUrlList(
  siteUrl: string,
  postsPerType: number = 5,
  selectedPostTypes?: WPPostType[]
): Promise<UrlToScreenshot[]> {
  const normalizedUrl = normalizeUrl(siteUrl);
  const urls: UrlToScreenshot[] = [];
  
  // Always include homepage
  urls.push({
    url: normalizedUrl,
    slug: 'homepage',
    postType: 'homepage',
    title: 'Homepage',
  });
  
  try {
    // Fetch all post types and their posts
    const postTypesWithPosts = await fetchAllPostTypesWithPosts(siteUrl, postsPerType, selectedPostTypes);
    
    for (const { postType, posts } of postTypesWithPosts) {
      for (const post of posts) {
        urls.push({
          url: post.link,
          slug: post.slug,
          postType: postType.slug,
          title: post.title.rendered,
        });
      }
    }
  } catch (error) {
    console.warn('Failed to fetch from WordPress REST API, falling back to homepage only');
    console.warn(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  console.log(`\nTotal URLs to screenshot: ${urls.length}`);
  return urls;
}

/**
 * Check if WordPress REST API is accessible
 */
export async function checkApiAccess(siteUrl: string): Promise<boolean> {
  try {
    const normalizedUrl = normalizeUrl(siteUrl);
    const response = await fetch(`${normalizedUrl}/wp-json/`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'WordPress-Wartung-Screenshot-Tool/1.0',
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}
