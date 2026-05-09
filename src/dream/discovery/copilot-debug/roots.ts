import { join } from "node:path";

const vscodeProductDirs = ["Code", "Code - Insiders", "VSCodium"];

export function workspaceStorageRoots(
  platform: NodeJS.Platform,
  homeDir: string,
  env: NodeJS.ProcessEnv
): string[] {
  if (platform === "darwin") {
    return vscodeProductDirs.map((product) =>
      join(homeDir, "Library", "Application Support", product, "User", "workspaceStorage")
    );
  }

  if (platform === "win32") {
    const roaming = env.APPDATA ?? join(homeDir, "AppData", "Roaming");
    return vscodeProductDirs.map((product) => join(roaming, product, "User", "workspaceStorage"));
  }

  return vscodeProductDirs.map((product) =>
    join(homeDir, ".config", product, "User", "workspaceStorage")
  );
}
