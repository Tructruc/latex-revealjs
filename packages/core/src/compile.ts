import { dirname } from "node:path";
import { analyze, parseFileWithIncludes, type Diagnostic, type PresentationIR, type RevealTeXConfig } from "@revealtex/compiler";
import { rendererRegistry, type GeneratedFile } from "@revealtex/renderer-core";
import { loadConfig, findConfigFile } from "./config.js";
import { commitGeneratedOutput } from "./output.js";
import { standaloneFiles } from "./scaffold.js";
import { configWatchTargets, type WatchTarget } from "./watch.js";

export interface CompileOptions {
  sourceFile: string;
  outputDirectory?: string;
  renderer?: string;
  config?: RevealTeXConfig;
  configFile?: string;
}

export interface CompileResult {
  sourceFile: string;
  configFile?: string;
  rendererName: string;
  config: RevealTeXConfig;
  presentation: PresentationIR;
  diagnostics: Diagnostic[];
  files: GeneratedFile[];
  dependencies: string[];
  sourceFiles: string[];
  watchTargets: WatchTarget[];
  hasErrors: boolean;
}

/**
 * Compile a `.rtex` entry file (following `\input`/`\include`) into renderer
 * output, without writing anything to disk. Returns diagnostics and the render
 * dependencies needed by a file watcher.
 */
export async function compilePresentation(options: CompileOptions): Promise<CompileResult> {
  const sourceFile = options.sourceFile;
  const configFile = options.configFile ?? await findConfigFile(undefined, dirname(sourceFile));
  const config = options.config ?? await loadConfig(configFile);
  const { ast, sourceFiles } = await parseFileWithIncludes(sourceFile);
  const { presentation, diagnostics: semanticDiagnostics } = analyze(ast, config, sourceFiles);
  const diagnostics: Diagnostic[] = [...semanticDiagnostics];
  const rendererName = options.renderer ?? config.renderer ?? "vue";
  let files: GeneratedFile[] = [];
  let dependencies: string[] = [];

  if (!diagnostics.some(diagnostic => diagnostic.severity === "error")) {
    const renderer = rendererRegistry.get(rendererName);
    if (!renderer) diagnostics.push({ severity: "error", code: "RTX5000", message: `Unknown renderer "${rendererName}". Available: ${rendererRegistry.names().join(", ")}.` });
    else {
      const rendered = await renderer.render(presentation, { sourceFile, outputDirectory: options.outputDirectory ?? dirname(sourceFile), config });
      diagnostics.push(...rendered.diagnostics);
      files = rendered.files;
      dependencies = rendered.dependencies ?? [];
    }
  }

  return {
    sourceFile,
    configFile,
    rendererName,
    config,
    presentation,
    diagnostics,
    files,
    dependencies,
    sourceFiles,
    watchTargets: configWatchTargets(sourceFiles, config, configFile, dependencies),
    hasErrors: diagnostics.some(diagnostic => diagnostic.severity === "error")
  };
}

/** Compile and atomically write the output, optionally adding the standalone Vite scaffold. */
export async function compileToOutput(options: CompileOptions & { outputDirectory: string; standalone?: boolean; onWarning?: (message: string) => void }): Promise<CompileResult> {
  const result = await compilePresentation(options);
  if (!result.hasErrors) {
    const files = [...result.files];
    if (options.standalone && result.rendererName === "vue") files.push(...standaloneFiles(result.config));
    await commitGeneratedOutput(options.outputDirectory, files, options.onWarning);
    result.files = files;
  }
  return result;
}
