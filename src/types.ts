/**
 * TypeScript interfaces for WordPress Screenshot Diff Tool
 */

// WordPress REST API Types
export interface WPPostType {
  name: string;
  slug: string;
  description: string;
  rest_base: string;
  rest_namespace: string;
  hierarchical: boolean;
  viewable?: boolean; // Optional - not always returned by the API
  has_archive?: boolean;
  _links?: Record<string, unknown>;
}

export interface WPPostTypesResponse {
  [key: string]: WPPostType;
}

export interface WPPost {
  id: number;
  slug: string;
  link: string;
  title: {
    rendered: string;
  };
  type: string;
}

// Application Types
export interface UrlToScreenshot {
  url: string;
  slug: string;
  postType: string;
  title: string;
}

export interface ScreenshotResult {
  url: string;
  slug: string;
  postType: string;
  title: string;
  desktopPath: string;
  mobilePath: string;
}

// Diff comparison result
export interface DiffResult {
  /** Number of pixels that differ */
  diffPixels: number;
  /** Total number of pixels in the image */
  totalPixels: number;
  /** Percentage of pixels that differ (0-100) */
  diffPercentage: number;
  /** Path to the generated diff image */
  diffPath: string;
  /** Whether the before/after images had different dimensions */
  dimensionsDiffer: boolean;
  /** Dimensions of the before image */
  beforeDimensions: { width: number; height: number };
  /** Dimensions of the after image */
  afterDimensions: { width: number; height: number };
}

// Cookie configuration
export interface CookieConfig {
  mode: 'auto' | 'custom' | 'none';
  customText?: string;
}

// Combined screenshot comparison result
export interface ComparisonResult {
  url: string;
  slug: string;
  postType: string;
  title: string;
  before: {
    desktopPath: string;
    mobilePath: string;
  };
  after: {
    desktopPath: string;
    mobilePath: string;
  };
  diff: {
    desktop: DiffResult;
    mobile: DiffResult;
  };
}

export interface ProjectConfig {
  siteUrl: string;
  projectFolder: string;
  cookieConfig: CookieConfig;
  startTime: Date;
  endTime?: Date;
  urls: UrlToScreenshot[];
  beforeScreenshots: ScreenshotResult[];
  afterScreenshots: ScreenshotResult[];
  comparisons?: ComparisonResult[];
}

export interface PostTypeWithPosts {
  postType: WPPostType;
  posts: WPPost[];
}

// Viewport configurations
export const VIEWPORTS = {
  desktop: { width: 1920, height: 1080 },
  mobile: { width: 390, height: 844 },
} as const;

export type ViewportType = keyof typeof VIEWPORTS;
