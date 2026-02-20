import { readFileSync } from "node:fs";
import { basename } from "node:path";
import ts from "typescript";
import type { NormalizedFederationConfig, SharedConfig } from "../types.js";

/**
 * Parses a config file into a TypeScript SourceFile AST.
 *
 * @param configPath - Absolute path to the config file
 * @returns The parsed SourceFile
 */
export function parseConfigFile(configPath: string): ts.SourceFile {
  const sourceText = readFileSync(configPath, "utf-8");
  const isTypeScript =
    configPath.endsWith(".ts") || configPath.endsWith(".mts");

  return ts.createSourceFile(
    basename(configPath),
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    isTypeScript ? ts.ScriptKind.TS : ts.ScriptKind.JS,
  );
}

/**
 * Extracts a string value from a TypeScript AST node.
 *
 * @param node - The AST node to extract from
 * @returns The string value, or null if not a static string
 */
export function extractStringValue(node: ts.Node): string | null {
  if (ts.isStringLiteral(node)) {
    return node.text;
  }
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

/**
 * Extracts a boolean value from a TypeScript AST node.
 *
 * @param node - The AST node to extract from
 * @returns The boolean value, or null if not a static boolean
 */
export function extractBooleanValue(node: ts.Node): boolean | null {
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }
  return null;
}

/**
 * Extracts an object literal as a Record<string, string>.
 * Used for extracting remotes and exposes configurations.
 *
 * @param node - The AST node to extract from
 * @param warnings - Array to collect warnings about dynamic values
 * @returns A record of string key-value pairs
 */
export function extractStringRecord(
  node: ts.Node,
  warnings: string[],
): Record<string, string> {
  const result: Record<string, string> = {};

  if (!ts.isObjectLiteralExpression(node)) {
    warnings.push("Expected object literal for remotes/exposes");
    return result;
  }

  for (const prop of node.properties) {
    if (ts.isPropertyAssignment(prop)) {
      let key: string | null = null;

      if (ts.isIdentifier(prop.name)) {
        key = prop.name.text;
      } else if (ts.isStringLiteral(prop.name)) {
        key = prop.name.text;
      } else if (ts.isComputedPropertyName(prop.name)) {
        const computed = extractStringValue(prop.name.expression);
        if (computed) {
          key = computed;
        }
      }

      if (key) {
        const value = extractStringValue(prop.initializer);
        if (value !== null) {
          result[key] = value;
        } else {
          warnings.push(
            `Dynamic value for "${key}" - cannot extract statically`,
          );
        }
      }
    } else if (ts.isShorthandPropertyAssignment(prop)) {
      warnings.push(
        `Shorthand property "${prop.name.text}" - cannot extract statically`,
      );
    } else if (ts.isSpreadAssignment(prop)) {
      warnings.push("Spread operator in config - cannot extract statically");
    }
  }

  return result;
}

/**
 * Extracts SharedConfig from an object literal node.
 *
 * @param node - The AST node to extract from
 * @param warnings - Array to collect warnings
 * @returns The SharedConfig object, a string, or null
 */
export function extractSharedConfig(
  node: ts.Node,
  warnings: string[],
): SharedConfig | string | null {
  if (ts.isStringLiteral(node)) {
    return node.text;
  }

  if (!ts.isObjectLiteralExpression(node)) {
    return null;
  }

  const config: SharedConfig = {};

  for (const prop of node.properties) {
    if (ts.isSpreadAssignment(prop)) {
      warnings.push(
        "Spread operator in shared config object - cannot extract statically",
      );
      continue;
    }
    if (!ts.isPropertyAssignment(prop)) continue;

    const propName = ts.isIdentifier(prop.name) ? prop.name.text : null;
    if (!propName) continue;

    switch (propName) {
      case "singleton": {
        const val = extractBooleanValue(prop.initializer);
        if (val !== null) config.singleton = val;
        break;
      }
      case "requiredVersion": {
        const val = extractStringValue(prop.initializer);
        if (val !== null) {
          config.requiredVersion = val;
        } else if (prop.initializer.kind === ts.SyntaxKind.FalseKeyword) {
          config.requiredVersion = false;
        }
        break;
      }
      case "eager": {
        const val = extractBooleanValue(prop.initializer);
        if (val !== null) config.eager = val;
        break;
      }
      case "shareScope": {
        const val = extractStringValue(prop.initializer);
        if (val !== null) config.shareScope = val;
        break;
      }
      case "import": {
        const val = extractStringValue(prop.initializer);
        if (val !== null) {
          config.import = val;
        } else if (prop.initializer.kind === ts.SyntaxKind.FalseKeyword) {
          config.import = false;
        }
        break;
      }
      case "strictVersion": {
        const val = extractBooleanValue(prop.initializer);
        if (val !== null) config.strictVersion = val;
        break;
      }
      case "version": {
        const val = extractStringValue(prop.initializer);
        if (val !== null) {
          config.version = val;
        } else if (prop.initializer.kind === ts.SyntaxKind.FalseKeyword) {
          config.version = false;
        }
        break;
      }
    }
  }

  return config;
}

/**
 * Extracts the shared configuration object.
 * Handles both array format (["react", "react-dom"]) and object format.
 *
 * @param node - The AST node to extract from
 * @param warnings - Array to collect warnings
 * @returns A record of package names to SharedConfig objects or strings
 */
export function extractSharedRecord(
  node: ts.Node,
  warnings: string[],
): Record<string, SharedConfig | string> {
  const result: Record<string, SharedConfig | string> = {};

  if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) {
      const str = extractStringValue(element);
      if (str) {
        result[str] = str;
      }
    }
    return result;
  }

  if (!ts.isObjectLiteralExpression(node)) {
    warnings.push("Expected object or array for shared config");
    return result;
  }

  for (const prop of node.properties) {
    if (ts.isPropertyAssignment(prop)) {
      let key: string | null = null;

      if (ts.isIdentifier(prop.name)) {
        key = prop.name.text;
      } else if (ts.isStringLiteral(prop.name)) {
        key = prop.name.text;
      }

      if (key) {
        const config = extractSharedConfig(prop.initializer, warnings);
        if (config !== null) {
          result[key] = config;
        }
      }
    } else if (ts.isSpreadAssignment(prop)) {
      warnings.push(
        "Spread operator in shared config - cannot extract statically",
      );
    }
  }

  return result;
}

/**
 * Extracts Module Federation configuration from an ObjectLiteralExpression.
 * This is the common MF config format used by all bundlers:
 * { name, exposes, remotes, shared }
 *
 * @param configObject - The ObjectLiteralExpression containing MF config
 * @param participantName - Name to use for the participant
 * @param projectRoot - Absolute path to the project root
 * @param warnings - Array to collect warnings
 * @returns The normalized federation config, or null if invalid
 */
export function extractFromObjectLiteral(
  configObject: ts.ObjectLiteralExpression,
  participantName: string,
  projectRoot: string,
  warnings: string[],
): NormalizedFederationConfig | null {
  const config: NormalizedFederationConfig = {
    participantName,
    projectRoot,
    name: "",
    exposes: {},
    remotes: {},
    shared: {},
  };

  for (const prop of configObject.properties) {
    if (!ts.isPropertyAssignment(prop)) {
      if (ts.isSpreadAssignment(prop)) {
        warnings.push(
          "Spread operator in MF config - cannot extract statically",
        );
      }
      continue;
    }

    const propName = ts.isIdentifier(prop.name) ? prop.name.text : null;
    if (!propName) continue;

    switch (propName) {
      case "name": {
        const val = extractStringValue(prop.initializer);
        if (val !== null) {
          config.name = val;
        } else {
          warnings.push("Dynamic 'name' value - cannot extract statically");
        }
        break;
      }
      case "exposes": {
        config.exposes = extractStringRecord(prop.initializer, warnings);
        break;
      }
      case "remotes": {
        config.remotes = extractStringRecord(prop.initializer, warnings);
        break;
      }
      case "shared": {
        config.shared = extractSharedRecord(prop.initializer, warnings);
        break;
      }
    }
  }

  return config;
}

/**
 * Creates an empty/default normalized federation config.
 *
 * @param participantName - Name to use for the participant
 * @param projectRoot - Absolute path to the project root
 * @returns An empty NormalizedFederationConfig
 */
export function createEmptyConfig(
  participantName: string,
  projectRoot: string,
): NormalizedFederationConfig {
  return {
    participantName,
    projectRoot,
    name: "",
    exposes: {},
    remotes: {},
    shared: {},
  };
}

/**
 * Gets the function name from an expression (for call expressions).
 *
 * @param expr - The expression to get the name from
 * @returns The function name, or null if not identifiable
 */
export function getFunctionName(expr: ts.Expression): string | null {
  if (ts.isIdentifier(expr)) {
    return expr.text;
  }
  if (ts.isPropertyAccessExpression(expr)) {
    return expr.name.text;
  }
  return null;
}

/**
 * Gets the constructor name from a new expression.
 * Handles both direct identifiers and property access (e.g., container.ModuleFederationPlugin).
 *
 * @param expr - The expression to get the constructor name from
 * @returns The constructor name, or null if not identifiable
 */
export function getConstructorName(expr: ts.Expression): string | null {
  if (ts.isIdentifier(expr)) {
    return expr.text;
  }
  if (ts.isPropertyAccessExpression(expr)) {
    return expr.name.text;
  }
  return null;
}
