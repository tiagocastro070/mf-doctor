import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { glob } from "glob";
import type {
  FederationParticipant,
  NormalizedFederationConfig,
} from "./types.js";
import { loadWorkspaceFile } from "./workspaceFile.js";
import { getAllConfigPatterns } from "./extractors/index.js";

type PackageJson = {
  name?: string;
  workspaces?: string[] | { packages: string[] };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/**
 * Reads and parses a package.json file.
 */
function readPackageJson(packagePath: string): PackageJson | null {
  const packageJsonPath = join(packagePath, "package.json");
  if (!existsSync(packageJsonPath)) {
    return null;
  }

  try {
    const content = readFileSync(packageJsonPath, "utf-8");
    return JSON.parse(content) as PackageJson;
  } catch {
    return null;
  }
}

/**
 * Extracts workspace patterns from package.json.
 * Supports both array format and { packages: [] } format.
 */
function getWorkspacePatterns(packageJson: PackageJson): string[] {
  if (!packageJson.workspaces) {
    return [];
  }

  if (Array.isArray(packageJson.workspaces)) {
    return packageJson.workspaces;
  }

  if (packageJson.workspaces.packages) {
    return packageJson.workspaces.packages;
  }

  return [];
}

/**
 * Resolves workspace glob patterns to actual package directories.
 */
async function resolveWorkspacePackages(
  workspaceRoot: string,
  patterns: string[],
): Promise<string[]> {
  const packageDirs: string[] = [];

  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd: workspaceRoot,
      absolute: true,
    });

    for (const match of matches) {
      const packageJsonPath = join(match, "package.json");
      if (existsSync(packageJsonPath)) {
        packageDirs.push(match);
      }
    }
  }

  return packageDirs;
}

/**
 * Finds the build config file in a directory and returns its path and bundler type.
 * Uses the extractor registry to get config patterns, ensuring a single source of truth.
 */
function findBuildConfig(
  projectRoot: string,
): { configPath: string; bundler: FederationParticipant["bundler"] } | null {
  const files = readdirSync(projectRoot);
  const allPatterns = getAllConfigPatterns();

  for (const [bundler, patterns] of allPatterns) {
    for (const pattern of patterns) {
      if (files.includes(pattern)) {
        return {
          configPath: join(projectRoot, pattern),
          bundler,
        };
      }
    }
  }

  return null;
}

/**
 * Creates an empty/default normalized federation config.
 */
function createEmptyFederationConfig(
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
 * Creates a FederationParticipant from a package directory.
 */
function createParticipant(
  projectRoot: string,
  packageJson: PackageJson,
  configPath: string,
  bundler: FederationParticipant["bundler"],
): FederationParticipant {
  const name = packageJson.name || basename(projectRoot);

  return {
    name,
    projectRoot,
    configPath,
    bundler,
    federationConfig: createEmptyFederationConfig(name, projectRoot),
    dependencies: packageJson.dependencies || {},
    devDependencies: packageJson.devDependencies || {},
    parseStatus: "partial",
    parseWarnings: ["Federation config not yet extracted"],
  };
}

/**
 * Discovers all federation participants in a workspace.
 *
 * This function:
 * 1. Reads the root package.json to find workspace patterns
 * 2. Resolves those patterns to actual package directories
 * 3. Identifies packages that have a bundler config (rsbuild, webpack, rspack)
 * 4. Returns FederationParticipant objects with empty MF configs
 *
 * @param workspaceRoot - Absolute path to the workspace root directory
 * @returns Array of discovered FederationParticipant objects
 */
export async function discoverParticipants(
  workspaceRoot: string,
): Promise<FederationParticipant[]> {
  const absoluteRoot = resolve(workspaceRoot);
  const rootPackageJson = readPackageJson(absoluteRoot);

  if (!rootPackageJson) {
    throw new Error(`No package.json found at ${absoluteRoot}`);
  }

  const workspacePatterns = getWorkspacePatterns(rootPackageJson);

  if (workspacePatterns.length === 0) {
    throw new Error(
      `No workspaces defined in ${join(absoluteRoot, "package.json")}. ` +
        'Expected a "workspaces" field with an array of package patterns.',
    );
  }

  const packageDirs = await resolveWorkspacePackages(
    absoluteRoot,
    workspacePatterns,
  );

  const participants: FederationParticipant[] = [];

  for (const packageDir of packageDirs) {
    const packageJson = readPackageJson(packageDir);
    if (!packageJson) {
      continue;
    }

    const buildConfig = findBuildConfig(packageDir);
    if (!buildConfig) {
      continue;
    }

    const participant = createParticipant(
      packageDir,
      packageJson,
      buildConfig.configPath,
      buildConfig.bundler,
    );

    participants.push(participant);
  }

  return participants;
}

/**
 * Result of workspace discovery including metadata.
 */
export type DiscoveryResult = {
  workspaceRoot: string;
  participants: FederationParticipant[];
  workspacePatterns: string[];
  totalPackagesScanned: number;
};

/**
 * Extended discovery function that returns additional metadata.
 */
export async function discoverWorkspace(
  workspaceRoot: string,
): Promise<DiscoveryResult> {
  const absoluteRoot = resolve(workspaceRoot);
  const rootPackageJson = readPackageJson(absoluteRoot);

  if (!rootPackageJson) {
    throw new Error(`No package.json found at ${absoluteRoot}`);
  }

  const workspacePatterns = getWorkspacePatterns(rootPackageJson);

  if (workspacePatterns.length === 0) {
    throw new Error(
      `No workspaces defined in ${join(absoluteRoot, "package.json")}. ` +
        'Expected a "workspaces" field with an array of package patterns.',
    );
  }

  const packageDirs = await resolveWorkspacePackages(
    absoluteRoot,
    workspacePatterns,
  );

  const participants: FederationParticipant[] = [];

  for (const packageDir of packageDirs) {
    const packageJson = readPackageJson(packageDir);
    if (!packageJson) {
      continue;
    }

    const buildConfig = findBuildConfig(packageDir);
    if (!buildConfig) {
      continue;
    }

    const participant = createParticipant(
      packageDir,
      packageJson,
      buildConfig.configPath,
      buildConfig.bundler,
    );

    participants.push(participant);
  }

  return {
    workspaceRoot: absoluteRoot,
    participants,
    workspacePatterns,
    totalPackagesScanned: packageDirs.length,
  };
}

/**
 * Result of workspace file discovery.
 */
export type WorkspaceFileDiscoveryResult = {
  /** Path to the workspace file that was used */
  workspaceFilePath: string;
  /** All discovered federation participants */
  participants: FederationParticipant[];
  /** Number of folders in the workspace file */
  totalFolders: number;
  /** Number of folders that were scanned (had package.json or bundler config) */
  foldersScanned: number;
};

/**
 * Discovers participants from a single folder.
 * Checks if the folder itself is a participant, and also expands any nested workspaces.
 */
async function discoverFromFolder(
  folderPath: string,
): Promise<FederationParticipant[]> {
  const participants: FederationParticipant[] = [];

  if (!existsSync(folderPath)) {
    return participants;
  }

  const packageJson = readPackageJson(folderPath);

  const buildConfig = findBuildConfig(folderPath);
  if (buildConfig && packageJson) {
    const participant = createParticipant(
      folderPath,
      packageJson,
      buildConfig.configPath,
      buildConfig.bundler,
    );
    participants.push(participant);
  }

  if (packageJson) {
    const workspacePatterns = getWorkspacePatterns(packageJson);
    if (workspacePatterns.length > 0) {
      const packageDirs = await resolveWorkspacePackages(
        folderPath,
        workspacePatterns,
      );

      for (const packageDir of packageDirs) {
        const pkgJson = readPackageJson(packageDir);
        if (!pkgJson) {
          continue;
        }

        const pkgBuildConfig = findBuildConfig(packageDir);
        if (!pkgBuildConfig) {
          continue;
        }

        const participant = createParticipant(
          packageDir,
          pkgJson,
          pkgBuildConfig.configPath,
          pkgBuildConfig.bundler,
        );

        const alreadyAdded = participants.some(
          (p) => p.projectRoot === participant.projectRoot,
        );
        if (!alreadyAdded) {
          participants.push(participant);
        }
      }
    }
  }

  return participants;
}

/**
 * Discovers federation participants from a VS Code / Cursor workspace file.
 *
 * For each folder in the workspace file:
 * 1. Checks if the folder root has a bundler config -> adds as participant
 * 2. Checks if the folder has package.json with workspaces -> expands nested packages
 *
 * @param workspaceFilePath - Path to the .code-workspace file
 * @returns Discovery result with all found participants
 */
export async function discoverFromWorkspaceFile(
  workspaceFilePath: string,
): Promise<WorkspaceFileDiscoveryResult> {
  const workspaceFile = loadWorkspaceFile(workspaceFilePath);
  const allParticipants: FederationParticipant[] = [];
  let foldersScanned = 0;

  for (const folder of workspaceFile.folders) {
    const folderParticipants = await discoverFromFolder(folder.path);

    if (
      folderParticipants.length > 0 ||
      existsSync(join(folder.path, "package.json"))
    ) {
      foldersScanned++;
    }

    for (const participant of folderParticipants) {
      const alreadyAdded = allParticipants.some(
        (p) => p.projectRoot === participant.projectRoot,
      );
      if (!alreadyAdded) {
        allParticipants.push(participant);
      }
    }
  }

  return {
    workspaceFilePath: workspaceFile.filePath,
    participants: allParticipants,
    totalFolders: workspaceFile.folders.length,
    foldersScanned,
  };
}
