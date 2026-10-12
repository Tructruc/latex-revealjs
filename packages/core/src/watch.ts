import { watch, type FSWatcher } from "node:fs";
import { basename, dirname, isAbsolute } from "node:path";
import type { ComponentDefinition, RevealTeXConfig } from "@revealtex/compiler";

export interface WatchTarget { path: string; kind: "file" | "directory" }
export interface ActiveDirectoryWatcher { watcher: FSWatcher; all: boolean; names: Set<string> }

/** Compute the files/directories that should trigger a rebuild for a build. */
export function configWatchTargets(sourceFiles: string[], config: RevealTeXConfig, configFile: string | undefined, rendererDependencies: string[] = []): WatchTarget[] {
  const componentGroups = [config.components, ...(config.plugins ?? []).map(plugin => plugin.components)];
  const renderers = componentGroups
    .flatMap(group => Object.values(group ?? {}))
    .filter((definition): definition is ComponentDefinition => typeof definition === "object")
    .map(definition => definition.html?.renderer)
    .filter((path): path is string => Boolean(path) && isAbsolute(path!));
  const files = [...sourceFiles, ...(configFile ? [configFile] : []), ...renderers, ...rendererDependencies]
    .filter(path => isAbsolute(path));
  const directories = typeof config.components?.autoDiscover === "string" && isAbsolute(config.components.autoDiscover)
    ? [config.components.autoDiscover]
    : [];
  const targets = new Map<string, WatchTarget>();
  for (const path of files) targets.set(`file\0${path}`, { path, kind: "file" });
  for (const path of directories) targets.set(`directory\0${path}`, { path, kind: "directory" });
  return [...targets.values()];
}

export function reconcileDirectoryWatchers(active: Map<string, ActiveDirectoryWatcher>, targets: WatchTarget[], onChange: () => void, onWarning?: (message: string) => void): void {
  const desired = new Map<string, { all: boolean; names: Set<string> }>();
  for (const target of targets) {
    const directory = target.kind === "directory" ? target.path : dirname(target.path);
    const specification = desired.get(directory) ?? { all: false, names: new Set<string>() };
    if (target.kind === "directory") specification.all = true;
    else specification.names.add(basename(target.path));
    desired.set(directory, specification);
  }

  for (const [directory, current] of active) {
    if (desired.has(directory)) continue;
    current.watcher.close();
    active.delete(directory);
  }
  for (const [directory, specification] of desired) {
    const current = active.get(directory);
    if (current) {
      current.all = specification.all;
      current.names = specification.names;
      continue;
    }
    const state: ActiveDirectoryWatcher = { watcher: undefined as unknown as FSWatcher, all: specification.all, names: specification.names };
    try {
      state.watcher = watch(directory, { recursive: state.all }, (_event, filename) => {
        const name = filename === null ? undefined : String(filename);
        if (state.all || name === undefined || state.names.has(name)) onChange();
      });
      state.watcher.on("error", error => {
        onWarning?.(`watcher failed for ${directory}: ${error.message}`);
        state.watcher.close();
        active.delete(directory);
      });
      active.set(directory, state);
    } catch (error) {
      onWarning?.(`could not watch ${directory}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
