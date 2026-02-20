// Import extractors to trigger auto-registration
import "./rsbuildExtractor.js";
import "./webpackExtractor.js";
import "./rspackExtractor.js";

// Re-export public API from registry
export {
  getExtractor,
  getSupportedBundlers,
  hasExtractor,
  registerExtractor,
  clearExtractors,
  getAllConfigPatterns,
} from "./registry.js";

// Re-export types
export type { Extractor, ExtractionResult, BundlerType } from "./types.js";

// Re-export bundler-specific extractors for direct access if needed
export { rsbuildExtractor } from "./rsbuildExtractor.js";
export { webpackExtractor } from "./webpackExtractor.js";
export {
  rspackExtractor,
  locateRspackConfig,
  hasRspackConfig,
  getRspackConfigPath,
  extractFromProject as extractFromRspackProject,
} from "./rspackExtractor.js";
