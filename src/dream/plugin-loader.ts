import { pathToFileURL } from "node:url";
import { access, readdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import type { DreamerPluginModule, DreamerPluginRegistrar } from "../core/contracts.js";
import type { PluginRegistry } from "../core/registry.js";
import { dreamerHome, workspaceStorageDir } from "./dreamer-home.js";

const PLUGIN_FILE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".mts"]);
const PLUGIN_INDEX_FILES = ["index.js", "index.mjs", "index.cjs", "index.ts", "index.mts"];

export type LoadedDreamerPlugin = {
  path: string;
};

export type LoadDreamerPluginsOptions = {
  workspaceDir: string;
  pluginPaths?: string[];
};

export function defaultDreamerPluginPaths(workspaceDir: string): string[] {
  return [
    join(workspaceDir, ".dreamer", "plugins"),
    join(workspaceStorageDir(workspaceDir), "plugins"),
    join(dreamerHome(), "plugins")
  ];
}

export function readDreamerPluginPathsFromEnv(value = process.env.DREAM_PLUGIN_PATHS): string[] {
  if (!value) return [];
  return value
    .split(delimiter)
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function loadDreamerPlugins(
  registry: PluginRegistry,
  options: LoadDreamerPluginsOptions
): Promise<LoadedDreamerPlugin[]> {
  const storageDir = workspaceStorageDir(options.workspaceDir);
  const configuredPaths = [
    ...defaultDreamerPluginPaths(options.workspaceDir),
    ...(options.pluginPaths ?? []),
    ...readDreamerPluginPathsFromEnv()
  ];
  const modulePaths = await discoverPluginModules(configuredPaths, options.workspaceDir);
  const loaded: LoadedDreamerPlugin[] = [];

  for (const modulePath of modulePaths) {
    const pluginModule = (await import(pathToFileURL(modulePath).href)) as DreamerPluginModule;
    const registrar = resolveRegistrar(pluginModule, modulePath);
    await registrar(registry, { workspaceDir: options.workspaceDir, storageDir });
    loaded.push({ path: modulePath });
  }

  return loaded;
}

async function discoverPluginModules(paths: string[], workspaceDir: string): Promise<string[]> {
  const discovered = new Set<string>();
  for (const inputPath of paths) {
    const absolutePath = isAbsolute(inputPath) ? inputPath : resolve(workspaceDir, inputPath);
    if (!(await exists(absolutePath))) continue;
    const info = await stat(absolutePath);
    if (info.isFile()) {
      if (isPluginModuleFile(absolutePath)) discovered.add(absolutePath);
      continue;
    }
    if (!info.isDirectory()) continue;

    for (const modulePath of await discoverPluginModulesInDirectory(absolutePath)) {
      discovered.add(modulePath);
    }
  }
  return [...discovered].sort();
}

async function discoverPluginModulesInDirectory(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const discovered: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const entryPath = join(directory, entry.name);
    if (entry.isFile() && isPluginModuleFile(entryPath)) {
      discovered.push(entryPath);
      continue;
    }
    if (!entry.isDirectory()) continue;
    const indexFile = await firstExisting(PLUGIN_INDEX_FILES.map((file) => join(entryPath, file)));
    if (indexFile) discovered.push(indexFile);
  }
  return discovered.sort();
}

function isPluginModuleFile(path: string): boolean {
  return [...PLUGIN_FILE_EXTENSIONS].some((extension) => path.endsWith(extension));
}

async function firstExisting(paths: string[]): Promise<string | undefined> {
  for (const path of paths) {
    if (await exists(path)) return path;
  }
  return undefined;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveRegistrar(module: DreamerPluginModule, modulePath: string): DreamerPluginRegistrar {
  if (typeof module.registerDreamerPlugin === "function") return module.registerDreamerPlugin;
  if (typeof module.default === "function") return module.default;
  if (
    typeof module.default === "object" &&
    module.default &&
    typeof module.default.registerDreamerPlugin === "function"
  ) {
    return module.default.registerDreamerPlugin;
  }
  throw new Error(
    `Invalid Dreamer plugin ${modulePath}: export registerDreamerPlugin(registry, context) or a default registrar`
  );
}
