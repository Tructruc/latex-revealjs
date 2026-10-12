import { join } from "node:path";
import { compilePresentation, type CompileResult, type Diagnostic } from "@revealtex/core";
import type { ProjectStore } from "./projects.js";

export interface StudioBuild {
  id: string;
  rendererName: string;
  diagnostics: Diagnostic[];
  hasErrors: boolean;
  files: CompileResult["files"];
  config: CompileResult["config"];
  dependencies: string[];
  sourceFiles: string[];
  watchTargets: CompileResult["watchTargets"];
  sourceFile: string;
  outputDirectory: string;
}

/** Compile a project's main file into in-memory renderer output. */
export async function buildProject(store: ProjectStore, id: string, rendererOverride?: string): Promise<StudioBuild> {
  const sourceFile = await store.mainFilePath(id);
  const outputDirectory = join(store.projectDir(id), ".studio", "build");
  const result = await compilePresentation({ sourceFile, outputDirectory, renderer: rendererOverride });
  return {
    id,
    rendererName: result.rendererName,
    diagnostics: result.diagnostics,
    hasErrors: result.hasErrors,
    files: result.files,
    config: result.config,
    dependencies: result.dependencies,
    sourceFiles: result.sourceFiles,
    watchTargets: result.watchTargets,
    sourceFile,
    outputDirectory
  };
}
