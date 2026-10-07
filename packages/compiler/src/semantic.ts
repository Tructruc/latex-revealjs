import type { AstNode, CommandNode, DocumentNode, EnvironmentNode, SourceLocation } from "./ast.js";
import type { ComponentDefinition, PluginCommandContext, PluginCommandDefinition, RevealTeXConfig } from "./config.js";
import type { AssetReference, ColumnIR, ComponentIR, ListItemIR, OverlayWindow, PresentationIR, PresentationNode, PropertyValue, SlideBackground, SlideIR, SlideStackIR } from "./ir.js";
import { parseOptions, parseValue } from "./options.js";
import { revealAttributes } from "./attributes.js";

export interface SemanticResult { presentation: PresentationIR; diagnostics: import("./diagnostics.js").Diagnostic[] }
const FORMATS = new Set(["textbf", "textit", "emph", "underline", "alert", "structure", "small", "large", "Huge", "em", "texttt", "textsf", "textsc", "textrm", "textnormal", "textsuperscript", "textsubscript"]);
const FORMAT_ALIASES: Record<string, string> = { em: "emph" };
const PAUSE_BOUNDARY = "__revealtex_pause_boundary__";
const MATH_ENVIRONMENTS = new Set(["equation", "equation*", "align", "align*", "gather", "gather*", "multline", "multline*", "split", "aligned", "gathered", "displaymath", "math", "eqnarray", "eqnarray*"]);
const MATH_INNER_ENVIRONMENTS = new Set(["equation", "equation*", "displaymath", "math"]);
const BACKGROUND_COMMANDS = new Set(["background", "backgroundcolor", "backgroundimage", "backgroundgradient", "backgroundvideo", "backgroundiframe"]);
const REVEAL_UTILITY_CONTAINERS: Record<string, string> = { fittext: "fit-text", stack: "stack", hstack: "hstack", vstack: "vstack", stretch: "stretch", frame: "frame" };
const BLOCK_ENVIRONMENTS = new Set(["block", "alertblock", "exampleblock", "theorem", "lemma", "corollary", "proposition", "definition", "example", "proof", "remark"]);
const ALIGN_ENVIRONMENTS: Record<string, string> = { center: "align-center", flushleft: "align-left", flushright: "align-right", quote: "quote", quotation: "quote" };
const OVERLAY_COMMANDS = new Set(["only", "uncover", "visible", "onslide", "alt", "temporal"]);
const NOOP_COMMANDS = new Set(["usepackage", "usetheme", "usecolortheme", "usefonttheme", "useinnertheme", "useoutertheme", "setbeamertemplate", "setbeamercolor", "setbeamerfont", "setbeamersize", "beamertemplatenavigationsymbolsempty", "hypersetup", "graphicspath", "bibliographystyle", "setlength", "subsection", "subsubsection", "part", "appendix", "vfill", "hrule", "centering"]);
const BUILTIN_COMMANDS = new Set(["documentclass", "title", "subtitle", "author", "date", "description", "titlegraphic", "logo", "theme", "reveal", "transition", "transitionspeed", "maketitle", "titlepage", "fragment", "animate", "item", "pause", "column", "image", "video", "svg", "note", "slot", "component", "id", "element", "background", "backgroundcolor", "backgroundimage", "backgroundgradient", "backgroundvideo", "backgroundiframe", "stylesheet", "script", "section", "slidenumbers", "progressbar", "controls", "place", "position", "card", "callout", "badge", "newcommand", "href", "url", "email", "hyperlink", "linebreak", "smallskip", "medskip", "bigskip", "textcolor", "colorbox", "footnote", "includegraphics", "lstinputlisting", "frametitle", "framesubtitle", "label", "ref", "pageref", "againframe", "vspace", "hspace", "tableofcontents", "beamerdefaultoverlayspecification", ...Object.keys(REVEAL_UTILITY_CONTAINERS), ...OVERLAY_COMMANDS, ...NOOP_COMMANDS, ...FORMATS]);

export function analyze(ast: DocumentNode, config: RevealTeXConfig = {}, sourceFiles: string[] = [ast.location.file]): SemanticResult {
  const diagnostics: import("./diagnostics.js").Diagnostic[] = [];
  const components = mergedComponents(config);
  const pluginCommands = Object.assign({}, ...((config.plugins ?? []).map(plugin => plugin.commands ?? {}))) as Record<string, PluginCommandDefinition>;
  const pluginEnvironments = Object.assign({}, ...((config.plugins ?? []).map(plugin => plugin.environments ?? {}))) as Record<string, PluginCommandDefinition>;
  const layouts = { ...Object.assign({}, ...((config.plugins ?? []).map(p => p.layouts ?? {}))), ...(config.layouts ?? {}) };
  const assets: AssetReference[] = [];
  const presentation: PresentationIR = { type: "presentation", metadata: {}, configuration: { stylesheets: [...(config.styles ?? [])], scripts: [], mathMacros: {} }, slides: [], sections: [], navigation: [], assets, sourceFiles };
  let currentSection: { title?: string; slides: SlideIR[]; source: SourceLocation; type: "section" } | undefined;
  let slideNumber = 0;
  let tocRequested = false;
  let tocFrames = false;
  let overlayCursor = 1;
  let footnotes: PresentationNode[][] = [];
  let defaultIncremental = false;
  const resolveOverlay = (raw?: string): { start: number; end?: number; windows?: OverlayWindow[] } | undefined => {
    const parsed = parseOverlay(raw);
    if (parsed) return { ...parsed, windows: parseOverlayWindows(raw) };
    if (!raw) return undefined;
    const body = raw.trim().replace(/>$/, "");
    if (body === "+") return { start: ++overlayCursor, end: overlayCursor };
    const match = body.match(/^\+\s*-\s*(\d*)$/);
    if (match) { overlayCursor++; return match[1] ? { start: overlayCursor, end: overlayCursor + Number(match[1]) - 1 } : { start: overlayCursor }; }
    return undefined;
  };

  const compile = (nodes: AstNode[]): PresentationNode[] => {
    const out: PresentationNode[] = [];
    for (const node of nodes) {
      if (node.type === "text") { if (node.value) out.push({ type: "text", value: node.value, source: node.location }); continue; }
      if (node.type === "math") { out.push({ type: "math", display: node.display, tex: node.source, source: node.location }); continue; }
      if (node.type === "environment") { out.push(...compileEnvironment(node)); continue; }
      out.push(...compileCommand(node));
    }
    return out;
  };

  const compileCommand = (node: CommandNode): PresentationNode[] => {
    const arg = (i = 0) => node.requiredArguments[i]?.raw.trim() ?? "";
    const children = (i = 0) => compile(node.requiredArguments[i]?.children ?? []);
    const options = parseOptions(node.optionalArguments[0]?.raw);
    if (NOOP_COMMANDS.has(node.name)) return [];
    if (FORMATS.has(node.name)) return [{ type: "format", style: FORMAT_ALIASES[node.name] ?? node.name, children: children(), source: node.location }];
    switch (node.name) {
      case "fragment": {
        const shorthand = node.optionalArguments[0]?.raw.trim();
        const effect = typeof options.effect === "string" ? options.effect : shorthand && !shorthand.includes("=") ? shorthand : undefined;
        const overlay = resolveOverlay(node.overlay);
        const explicitIndex = numberOption(options.index);
        const index = explicitIndex ?? (overlay && overlay.start > 1 ? overlay.start - 1 : undefined);
        return [{ type: "fragment", effect, index, start: overlay?.start, end: overlay?.end, windows: overlay?.windows, children: flow(children()), source: node.location }];
      }
      case "only": case "uncover": case "visible": case "onslide": return overlayContent(node.name === "only", resolveOverlay(node.overlay), flow(children()), node.location);
      case "alt": {
        const range = resolveOverlay(node.overlay); const n = range?.start ?? 1; const out: PresentationNode[] = [];
        if (n > 1) out.push({ type: "fragment", start: 1, end: n - 1, children: flow(children(0)), source: node.location });
        out.push({ type: "fragment", index: n > 1 ? n - 1 : undefined, start: n, end: range?.end, children: flow(children(1)), source: node.location });
        return out;
      }
      case "temporal": {
        const range = resolveOverlay(node.overlay); const n = range?.start ?? 1; const out: PresentationNode[] = [];
        if (n > 1) out.push({ type: "fragment", start: 1, end: n - 1, children: flow(children(0)), source: node.location });
        out.push({ type: "fragment", index: n > 1 ? n - 1 : undefined, start: n, end: n, only: true, children: flow(children(1)), source: node.location });
        out.push({ type: "fragment", index: n, start: n + 1, children: flow(children(2)), source: node.location });
        return out;
      }
      case "animate": return [{ type: "animation", effect: String(options.effect ?? "fade-in"), duration: stringOption(options.duration), delay: stringOption(options.delay), easing: stringOption(options.easing), children: flow(children()), source: node.location }];
      case "image": case "video": case "svg": assets.push({ kind: node.name, path: arg(), source: node.location }); return [{ type: node.name, src: arg(), options, source: node.location }];
      case "includegraphics": assets.push({ kind: "image", path: arg(), source: node.location }); return [{ type: "image", src: arg(), options, source: node.location }];
      case "lstinputlisting": { const path = arg(); assets.push({ kind: "data", path, source: node.location }); return [{ type: "code", code: "", language: stringOption(options.language), options, src: path, source: node.location }]; }
      case "note": return [{ type: "notes", item: node.optionalArguments[0]?.raw.trim() === "item", children: flow(children()), source: node.location }];
      case "slot": return [{ type: "slot", name: arg(), children: flow(children(1)), source: node.location }];
      case "id": case "element": return [{ type: "element", id: node.name === "id" ? arg() : stringOption(options.id), options, children: node.name === "id" ? children(1) : children(), source: node.location }];
      case "place": case "position": return [{ type: "container", kind: node.name, options, children: children(), source: node.location }];
      case "card": case "badge": return [{ type: "container", kind: node.name, options, children: flow(children()), source: node.location }];
      case "callout": { const shorthand=node.optionalArguments[0]?.raw.trim();const normalized=shorthand&&!shorthand.includes("=")?{variant:shorthand}:options;return [{ type:"container",kind:"callout",options:normalized,children:flow(children()),source:node.location }]; }
      case "fittext": case "stack": case "hstack": case "vstack": case "stretch": case "frame": return [{ type: "container", kind: REVEAL_UTILITY_CONTAINERS[node.name]!, options, children: flow(children()), source: node.location }];
      case "vspace": case "hspace": return [{ type: "container", kind: node.name, options: { ...options, size: arg() || String(options.size ?? "") }, children: [], source: node.location }];
      case "smallskip": case "medskip": case "bigskip": return [{ type: "container", kind: "vspace", options: { size: node.name === "smallskip" ? "0.5em" : node.name === "medskip" ? "1em" : "1.5em" }, children: [], source: node.location }];
      case "footnote": { const index = footnotes.length + 1; footnotes.push(flow(children())); return [{ type: "format", style: "footnote", children: [{ type: "text", value: String(index), source: node.location }], source: node.location }]; }
      case "label": return [];
      case "ref": case "pageref": return [{ type: "format", style: "ref", options: { target: arg() }, children: [{ type: "text", value: arg(), source: node.location }], source: node.location }];
      case "linebreak": return [{ type: "format", style: "linebreak", children: [], source: node.location }];
      case "textcolor": return [{ type: "format", style: "textcolor", options: { color: arg() }, children: children(1), source: node.location }];
      case "colorbox": return [{ type: "format", style: "colorbox", options: { color: arg() }, children: children(1), source: node.location }];
      case "href": return [{ type: "link", href: arg(), children: children(1), source: node.location }];
      case "hyperlink": return [{ type: "link", href: `#/${arg()}`, children: children(1), source: node.location }];
      case "url": return [{ type: "link", href: arg(), children: [{ type: "text", value: arg(), source: node.location }], source: node.location }];
      case "email": return [{ type: "link", href: `mailto:${arg()}`, children: [{ type: "text", value: arg(), source: node.location }], source: node.location }];
      case "component": return [makeComponent(arg(), optionsFromSecond(node), flow(children(1)), node.location)];
      case "pause": return [{ type: "fragment", effect: PAUSE_BOUNDARY, children: [], source: node.location }];
      case "stylesheet": presentation.configuration.stylesheets.push(arg()); assets.push({ kind: "stylesheet", path: arg(), source: node.location }); return [];
      case "script": presentation.configuration.scripts.push(arg()); assets.push({ kind: "script", path: arg(), source: node.location }); return [];
      case "newcommand": presentation.configuration.mathMacros[arg().replace(/^\\/, "")] = arg(1); return [];
      case "maketitle": return [];
      default:
        if (components[node.name] || config.aliases?.[node.name]) return [makeComponent(node.name, options, children(), node.location)];
        if (pluginCommands[node.name]) { const compiledChildren = flow(children()); return [makePluginComponent(pluginCommands[node.name], { name: node.name, options, argument: arg() || undefined, arguments: node.requiredArguments.map(argument => argument.raw.trim()), children: compiledChildren, source: node.location }, false)]; }
        if (!BUILTIN_COMMANDS.has(node.name)) diagnostics.push(unknownDiagnostic("command", node.name, node.location, [...Object.keys(components), ...Object.keys(pluginCommands)]));
        return [];
    }
  };

  const compileEnvironment = (node: EnvironmentNode): PresentationNode[] => {
    const options = parseOptions(node.optionalArguments[0]?.raw);
    if (["vue", "html", "react"].includes(node.name)) return [{ type: "renderer-specific", renderer: node.name, content: node.raw ?? "", source: node.location }];
    if (node.name === "onlyenv") return overlayContent(true, resolveOverlay(node.overlay), flow(compile(node.children)), node.location);
    if (node.name === "visibleenv" || node.name === "uncoverenv" || node.name === "onslideenv") return overlayContent(false, resolveOverlay(node.overlay), flow(compile(node.children)), node.location);
    if (node.name === "mermaid") return [{ type: "diagram", kind: "mermaid", code: (node.raw ?? "").trim(), options, source: node.location }];
    if (node.name === "chart") return [{ type: "diagram", kind: "chart", code: (node.raw ?? "").trim(), options, source: node.location }];
    if (node.name === "markdown") return [{ type: "markdown", content: node.raw ?? "", source: node.location }];
    if (BLOCK_ENVIRONMENTS.has(node.name)) { const title = node.requiredArguments[0]?.raw.trim() || stringOption(options.title); return [{ type: "container", kind: node.name, options: { ...options, ...(title ? { title } : {}) }, children: flow(compile(node.children)), source: node.location }]; }
    if (ALIGN_ENVIRONMENTS[node.name]) return [{ type: "container", kind: ALIGN_ENVIRONMENTS[node.name]!, options, children: flow(compile(node.children)), source: node.location }];
    if (node.name === "table" || node.name === "tabular") return [{ type: "table", rows: parseTable(node.raw ?? ""), header: options.header === true, caption: stringOption(options.caption), options, source: node.location }];
    if (MATH_ENVIRONMENTS.has(node.name)) {
      const raw = (node.raw ?? "").trim();
      const inner = MATH_INNER_ENVIRONMENTS.has(node.name);
      const tex = inner ? raw : `\\begin{${node.name}}${raw}\\end{${node.name}}`;
      return [{ type: "math", display: node.name !== "math", tex, source: node.location }];
    }
    if (node.name === "code") return [{ type: "code", code: (node.raw ?? textContent(node.children)).trim(), language: stringOption(options.language), options, source: node.location }];
    if (node.name === "verbatim") return [{ type: "code", code: rawCode(node.raw ?? ""), options, source: node.location }];
    if (node.name === "lstlisting") return [{ type: "code", code: rawCode(node.raw ?? ""), language: stringOption(options.language), options, source: node.location }];
    if (node.name === "itemize" || node.name === "enumerate" || node.name === "description") {
      const isDescription = node.name === "description";
      const items: ListItemIR[] = []; let current: AstNode[] = [];
      let itemCommand: CommandNode | undefined;
      const incremental = options.incremental === true || options["<+->"] === true || options.overlay === "<+->" || defaultIncremental;
      let incrementalIndex = 0;
      const flush = () => {
        if (itemCommand) {
          const overlay = resolveOverlay(itemCommand.overlay);
          let index = overlay && overlay.start > 1 ? overlay.start - 1 : undefined;
          let start = overlay?.start;
          if (!overlay && incremental) { incrementalIndex++; index = incrementalIndex; start = incrementalIndex + 1; }
          const label = isDescription ? itemCommand.optionalArguments[0]?.raw.trim() : undefined;
          items.push({ type: "list-item", label, index, start, end: overlay?.end, windows: overlay?.windows, children: flow(compile(current)), source: itemCommand.location });
        }
        current = [];
      };
      for (const child of node.children) {
        if (child.type === "command" && child.name === "item") { flush(); itemCommand = child; }
        else if (itemCommand || child.type !== "text" || child.value.trim()) current.push(child);
      }
      flush(); return [{ type: "list", ordered: node.name === "enumerate", description: isDescription || undefined, items, source: node.location }];
    }
    if (node.name === "steps") {
      return compile(node.children).filter(n => !(n.type === "text" && !n.value.trim())).map((n, i) => ({ type: "fragment", index: i + 1, children: [n], source: n.source }));
    }
    if (node.name === "columns") {
      const columns: ColumnIR[] = []; let current: AstNode[] = []; let currentCommand: CommandNode | undefined;
      const flush = () => { if (currentCommand || current.some(n => n.type !== "text" || n.value.trim())) columns.push({ type: "column", width: currentCommand?.requiredArguments[0]?.raw.trim(), align: currentCommand?.optionalArguments[0]?.raw.trim() || undefined, children: flow(compile(current)), source: currentCommand?.location ?? node.location }); current = []; };
      for (const child of node.children) { if (child.type === "command" && child.name === "column") { flush(); currentCommand = child; } else current.push(child); }
      flush(); return [{ type: "columns", gap: stringOption(options.gap), alignment: stringOption(options.align), columns, source: node.location }];
    }
    if (node.name === "component") { const name = stringOption(options.name) ?? node.requiredArguments[0]?.raw.trim() ?? ""; return [makeComponent(name, optionsWithout(options, "name"), compile(node.children), node.location)]; }
    if (components[node.name] || config.aliases?.[node.name]) return [makeComponent(node.name, options, flow(compile(node.children)), node.location)];
    if (pluginEnvironments[node.name]) { const compiledChildren = flow(compile(node.children)); return [makePluginComponent(pluginEnvironments[node.name], { name: node.name, options, argument: node.requiredArguments[0]?.raw.trim(), arguments: node.requiredArguments.map(argument => argument.raw.trim()), children: compiledChildren, source: node.location }, true)]; }
    if (node.name === "layout") return [{ type: "container", kind: `layout:${String(options.name ?? "default")}`, options, children: flow(compile(node.children)), source: node.location }];
    if (node.name !== "document") diagnostics.push(unknownDiagnostic("environment", node.name, node.location, Object.keys(components)));
    return compile(node.children);
  };

  const makeComponent = (name: string, supplied: Record<string, PropertyValue>, childNodes: PresentationNode[], source: SourceLocation): ComponentIR => {
    const aliased = config.aliases?.[name] ?? name;
    const preset = config.presets?.[aliased] ?? config.presets?.[name]; const actualName = preset?.component ?? aliased;
    const props = { ...(preset?.props ?? {}), ...supplied }; const definition = components[actualName];
    if (!definition) diagnostics.push(unknownDiagnostic("component", actualName, source, Object.keys(components)));
    else {
      validateProps(actualName, props, definition, source, diagnostics);
      for (const [key, schema] of Object.entries(definition.props ?? {})) {
        const value = props[key];
        if (schema.type === "asset" && typeof value === "string") assets.push({ kind: "data", path: value, source });
      }
    }
    const slots: Record<string, PresentationNode[]> = {}; const children: PresentationNode[] = [];
    for (const child of childNodes) child.type === "slot" ? slots[child.name] = child.children : children.push(child);
    return { type: "component", name: actualName, props, slots, children, source };
  };

  const makePluginComponent = (definition: PluginCommandDefinition, context: PluginCommandContext, environment: boolean): ComponentIR => {
    const mapped = typeof definition.props === "function" ? definition.props(context) : definition.props ?? {};
    const props = { ...mapped, ...context.options };
    const preserveChildren = definition.preserveChildren ?? environment;
    return makeComponent(definition.component, props, preserveChildren ? context.children : [], context.source);
  };

  const beginSection = (title: string | undefined, location: SourceLocation) => {
    currentSection = { type: "section", title, slides: [], source: location }; presentation.sections.push(currentSection);
    if (config.sections?.autoDividerSlides && title) {
      slideNumber++; const divider: SlideIR = { type: "slide", id: stableSlideId(`section-${title}`, slideNumber), title: [{ type: "text", value: title, source: location }], center: true, options: { sectionDivider: true }, attributes: {}, children: [], source: location };
      presentation.slides.push(divider); presentation.navigation.push(divider); currentSection.slides.push(divider);
    }
  };

  const createSlide = (node: EnvironmentNode): SlideIR => {
    slideNumber++; const options = parseOptions(node.optionalArguments[0]?.raw); const titleRaw = node.requiredArguments[0]?.raw.trim();
    let title = node.requiredArguments[0] ? compile(node.requiredArguments[0].children) : undefined;
    const background: SlideBackground = {
      color: stringOption(options.background) ?? stringOption(options["background-color"]),
      image: stringOption(options["background-image"]),
      gradient: stringOption(options["background-gradient"]),
      video: stringOption(options["background-video"]),
      iframe: stringOption(options["background-iframe"]),
      size: stringOption(options["background-size"]),
      position: stringOption(options["background-position"]),
      repeat: stringOption(options["background-repeat"]),
      opacity: options["background-opacity"] !== undefined ? String(options["background-opacity"]) : undefined,
      transition: stringOption(options["background-transition"]),
      videoLoop: options["background-video-loop"] === true ? true : undefined,
      videoMuted: options["background-video-muted"] === true ? true : undefined,
      interactive: options["background-interactive"] === true ? true : undefined
    };
    let subtitle: PresentationNode[] | undefined;
    let labelValue: string | undefined;
    const contentAst = node.children.filter(child => {
      if (child.type === "command" && child.name === "label") { labelValue = child.requiredArguments[0]?.raw.trim(); return false; }
      if (child.type === "command" && child.name === "framesubtitle") { subtitle = compile(child.requiredArguments[0]?.children ?? []); return false; }
      if (child.type === "command" && child.name === "frametitle") { title = compile(child.requiredArguments[0]?.children ?? []); return false; }
      if (child.type !== "command" || !BACKGROUND_COMMANDS.has(child.name)) return true;
      const value = child.requiredArguments[0]?.raw.trim();
      if (child.name === "background" || child.name === "backgroundcolor") background.color = value;
      else if (child.name === "backgroundimage") background.image = value;
      else if (child.name === "backgroundgradient") background.gradient = value;
      else if (child.name === "backgroundvideo") background.video = value;
      else if (child.name === "backgroundiframe") background.iframe = value;
      return false;
    });
    overlayCursor = 1;
    footnotes = [];
    const body = compile(contentAst);
    const noteNodes = body.filter((n): n is Extract<PresentationNode, { type: "notes" }> => n.type === "notes");
    const notes: PresentationNode[] = [...noteNodes.filter(n => !n.item).flatMap(n => n.children)];
    const noteItems = noteNodes.filter(n => n.item);
    if (noteItems.length) notes.push({ type: "list", ordered: false, items: noteItems.map(n => ({ type: "list-item", children: n.children, source: n.source })), source: noteItems[0]!.source });
    const children = flow(body.filter(n => n.type !== "notes"));
    if (footnotes.length) children.push({ type: "container", kind: "footnotes", options: {}, children: footnotes.map((nodes, index) => ({ type: "paragraph", children: [{ type: "format", style: "footnote-marker", children: [{ type: "text", value: `${index + 1}`, source: node.location }], source: node.location }, ...nodes.flatMap(inner => inner.type === "paragraph" ? inner.children : [inner])], source: node.location })), source: node.location });
    padOverlaySteps(children, node.location);
    const explicitId = stringOption(options.id) ?? stringOption(options.label) ?? labelValue;
    const attributes = revealAttributes(options);
    if (options.noframenumbering === true) attributes["data-visibility"] = "uncounted";
    const slide: SlideIR = { type: "slide", id: explicitId ?? stableSlideId(titleRaw, slideNumber), title, subtitle, transition: options.transition || options["transition-speed"] ? { effect: stringOption(options.transition), speed: stringOption(options["transition-speed"]) } : undefined, autoAnimate: options.autoanimate === true || options["auto-animate"] === true, center: options.center === true || options.c === true, layout: stringOption(options.layout), options, attributes, children, notes: notes.length ? notes : undefined, source: node.location };
    if (Object.values(background).some(value => value !== undefined)) slide.background = background;
    if (slide.layout && !layouts[slide.layout]) diagnostics.push({ severity: "warning", code: "RTX3005", message: `Unknown layout "${slide.layout}".`, location: node.location });
    if (presentation.slides.some(s => s.id === slide.id)) diagnostics.push({ severity: "error", code: "RTX3004", message: `Duplicate slide ID "${slide.id}".`, location: node.location });
    return slide;
  };

  const addSlide = (slide: SlideIR, navigation = true) => {
    presentation.slides.push(slide); currentSection?.slides.push(slide); if (navigation) presentation.navigation.push(slide);
  };

  for (const node of ast.children) {
    if (node.type === "command") {
      const value = node.requiredArguments[0]?.raw.trim();
      if (node.name === "titlegraphic") { presentation.metadata.titlegraphic = value; if (value) assets.push({ kind: "image", path: value, source: node.location }); continue; }
      if (node.name === "logo") { presentation.metadata.logo = value; if (value) assets.push({ kind: "image", path: value, source: node.location }); continue; }
      if (["title", "subtitle", "author", "institute", "date", "description"].includes(node.name)) {
        let text = value.replace(/\\today\b/g, todayString());
        if (node.name === "author" || node.name === "institute") text = text.replace(/\s*\\and\s*/g, ", ");
        presentation.metadata[node.name as keyof typeof presentation.metadata] = text;
        continue;
      }
      if (node.name === "theme") { presentation.configuration.theme = value; continue; }
      if (node.name === "reveal") { presentation.configuration.reveal = { ...(presentation.configuration.reveal ?? {}), ...parseOptions(node.optionalArguments[0]?.raw ?? node.requiredArguments[0]?.raw) }; continue; }
      if (node.name === "transition") { presentation.configuration.transition = value; continue; }
      if (node.name === "transitionspeed") { presentation.configuration.transitionSpeed = value; continue; }
      if (node.name === "controls" || node.name === "progressbar" || node.name === "slidenumbers") {
        const enabled = parseValue(value ?? "true") === true;
        if (node.name === "controls") presentation.configuration.controls = enabled;
        else if (node.name === "progressbar") presentation.configuration.progress = enabled;
        else presentation.configuration.slideNumbers = enabled;
        continue;
      }
      if (node.name === "section") { beginSection(value, node.location); continue; }
      if (node.name === "tableofcontents") { tocRequested = true; tocFrames = tocFrames || parseOptions(node.optionalArguments[0]?.raw).frames === true; continue; }
      if (node.name === "beamerdefaultoverlayspecification") { defaultIncremental = (value ?? "").includes("+"); continue; }
      compileCommand(node);
    } else if (node.type === "environment" && node.name === "document") {
      for (const child of node.children) {
        if (child.type === "command" && child.name === "section") { beginSection(child.requiredArguments[0]?.raw.trim(), child.location); continue; }
        if (child.type === "command" && child.name === "tableofcontents") { tocRequested = true; tocFrames = tocFrames || parseOptions(child.optionalArguments[0]?.raw).frames === true; continue; }
        if (child.type === "command" && child.name === "beamerdefaultoverlayspecification") { defaultIncremental = (child.requiredArguments[0]?.raw ?? "").includes("+"); continue; }
        if (child.type === "command" && child.name === "reveal") { presentation.configuration.reveal = { ...(presentation.configuration.reveal ?? {}), ...parseOptions(child.optionalArguments[0]?.raw ?? child.requiredArguments[0]?.raw) }; continue; }
        if (child.type === "command" && child.name === "againframe") {
          const repeat = child.requiredArguments[0]?.raw.trim();
          const source = presentation.slides.find(slide => slide.id === repeat);
          if (!source) diagnostics.push({ severity: "warning", code: "RTX3011", message: `Unknown frame label "${repeat}" for \\againframe.`, location: child.location });
          else addSlide({ ...source, id: `${repeat}-again-${presentation.slides.length}`, options: { ...source.options }, attributes: { ...source.attributes } });
          continue;
        }
        if (child.type === "environment" && (child.name === "frame" || child.name === "subframe")) { addSlide(createSlide(child)); continue; }
        if (child.type === "environment" && child.name === "section") {
          const previousSection = currentSection; const title = child.requiredArguments[0]?.raw.trim();
          const sectionOptions = parseOptions(child.optionalArguments[0]?.raw);
          currentSection = { type: "section", title, slides: [], source: child.location }; presentation.sections.push(currentSection);
          const verticalSlides: SlideIR[] = [];
          for (const nested of child.children) if (nested.type === "environment" && (nested.name === "frame" || nested.name === "subframe")) {
            const slide = createSlide(nested); addSlide(slide, false); verticalSlides.push(slide);
          }
          if (verticalSlides.length) presentation.navigation.push({ type: "slide-stack", title, slides: verticalSlides, transition: sectionOptions.transition || sectionOptions["transition-speed"] ? { effect: stringOption(sectionOptions.transition), speed: stringOption(sectionOptions["transition-speed"]) } : undefined, attributes: { ...revealAttributes(sectionOptions), ...(sectionOptions.autoanimate === true || sectionOptions["auto-animate"] === true ? { "data-auto-animate": "" } : {}) }, source: child.location } satisfies SlideStackIR);
          else diagnostics.push({ severity: "warning", code: "RTX3010", message: `Vertical section "${title ?? ""}" contains no frames.`, location: child.location });
          currentSection = previousSection; continue;
        }
        if (!(child.type === "text" && !child.value.trim()) && !(child.type === "command" && (child.name === "maketitle" || child.name === "titlepage"))) compile([child]);
      }
    }
  }
  if (ast.children.some(n => n.type === "environment" && n.name === "document" && n.children.some(c => c.type === "command" && (c.name === "maketitle" || c.name === "titlepage")))) {
    const loc = ast.location; const titleSlide: SlideIR = { type: "slide", id: "title", title: presentation.metadata.title ? [{ type: "text", value: presentation.metadata.title, source: loc }] : undefined, options: { titleSlide: true }, attributes: {}, children: [presentation.metadata.subtitle && { type: "format", style: "subtitle", children: [{ type: "text", value: presentation.metadata.subtitle, source: loc }], source: loc }, presentation.metadata.author && { type: "format", style: "author", children: [{ type: "text", value: presentation.metadata.author, source: loc }], source: loc }, presentation.metadata.institute && { type: "format", style: "institute", children: [{ type: "text", value: presentation.metadata.institute, source: loc }], source: loc }, presentation.metadata.date && { type: "format", style: "date", children: [{ type: "text", value: presentation.metadata.date, source: loc }], source: loc }, presentation.metadata.titlegraphic && { type: "image", src: presentation.metadata.titlegraphic, options: {}, source: loc }].filter(Boolean) as PresentationNode[], source: loc };
    presentation.slides.unshift(titleSlide); presentation.navigation.unshift(titleSlide);
  }
  if (tocRequested) {
    const loc = ast.location; const entries: { id: string; title: string }[] = [];
    if (!tocFrames && presentation.sections.length) {
      for (const section of presentation.sections) { const first = section.slides[0]; if (section.title && first) entries.push({ id: first.id, title: section.title }); }
    } else {
      for (const slide of presentation.slides) {
        if (slide.options.titleSlide === true || slide.options.tocSlide === true) continue;
        const text = (slide.title ?? []).map(node => node.type === "text" ? node.value : "").join("");
        if (text.trim()) entries.push({ id: slide.id, title: text });
      }
    }
    const items: ListItemIR[] = entries.map(entry => ({ type: "list-item", children: [{ type: "link", href: `#/${entry.id}`, children: [{ type: "text", value: entry.title, source: loc }], source: loc }], source: loc }));
    const tocSlide: SlideIR = { type: "slide", id: "table-of-contents", title: [{ type: "text", value: "Contents", source: loc }], options: { tocSlide: true }, attributes: {}, children: [{ type: "list", ordered: false, items, source: loc }], source: loc };
    const titleIndex = presentation.slides.findIndex(slide => slide.options.titleSlide === true);
    const insertAt = titleIndex >= 0 ? titleIndex + 1 : 0;
    presentation.slides.splice(insertAt, 0, tocSlide);
    presentation.navigation.splice(insertAt, 0, tocSlide);
  }
  const slideNumberById = new Map<string, number>(); presentation.slides.forEach((slide, index) => slideNumberById.set(slide.id, index + 1));
  const resolveRefs = (nodes: PresentationNode[]) => {
    for (const node of nodes) {
      if (node.type === "format" && node.style === "ref") {
        const target = typeof node.options?.target === "string" ? node.options.target : "";
        const number = slideNumberById.get(target);
        node.children = [{ type: "text", value: number !== undefined ? String(number) : target, source: node.source }];
      } else if (node.type === "columns") node.columns.forEach(column => resolveRefs(column.children));
      else if (node.type === "list") node.items.forEach(item => resolveRefs(item.children));
      else if (node.type === "component") { resolveRefs(node.children); Object.values(node.slots).forEach(resolveRefs); }
      else if ("children" in node) resolveRefs(node.children);
    }
  };
  for (const slide of presentation.slides) { resolveRefs(slide.children); if (slide.title) resolveRefs(slide.title); if (slide.subtitle) resolveRefs(slide.subtitle); if (slide.notes) resolveRefs(slide.notes); }
  let transformed = presentation; for (const plugin of config.plugins ?? []) if (plugin.transformIR) transformed = plugin.transformIR(transformed);
  return { presentation: transformed, diagnostics };
}

function mergedComponents(config: RevealTeXConfig): Record<string, ComponentDefinition> { return { ...Object.assign({}, ...((config.plugins ?? []).map(p => p.components ?? {}))), ...Object.fromEntries(Object.entries(config.components ?? {}).filter(([k]) => k !== "autoDiscover")) } as Record<string, ComponentDefinition>; }
function todayString(): string { return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); }
function optionsFromSecond(node: CommandNode): Record<string, PropertyValue> { return parseOptions(node.optionalArguments[0]?.raw); }
function optionsWithout(options: Record<string, PropertyValue>, key: string): Record<string, PropertyValue> { const copy = { ...options }; delete copy[key]; return copy; }
function stringOption(value: PropertyValue | undefined): string | undefined { return typeof value === "string" || typeof value === "number" ? String(value) : undefined; }
function numberOption(value: PropertyValue | undefined): number | undefined { return typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : undefined; }
function padOverlaySteps(nodes: PresentationNode[], source: SourceLocation): void {
  const indices = new Set<number>(); let maxOverlay = 0;
  const register = (index?: number, start?: number, end?: number, windows?: OverlayWindow[]) => {
    if (index !== undefined) { indices.add(index); maxOverlay = Math.max(maxOverlay, index + 1); }
    if (windows) for (const window of windows) maxOverlay = Math.max(maxOverlay, window.start, window.end ?? window.start);
    if (start !== undefined) maxOverlay = Math.max(maxOverlay, start, end ?? start);
  };
  const visit = (list: PresentationNode[]) => {
    for (const node of list) {
      if (node.type === "fragment") { register(node.index, node.start, node.end, node.windows); visit(node.children); }
      else if (node.type === "list") for (const item of node.items) { register(item.index, item.start, item.end, item.windows); visit(item.children); }
      else if (node.type === "columns") node.columns.forEach(column => visit(column.children));
      else if ("children" in node) visit(node.children);
    }
  };
  visit(nodes);
  for (let index = 1; index < maxOverlay; index++) if (!indices.has(index)) nodes.push({ type: "fragment", index, children: [], source });
}
function rawCode(raw: string): string { return raw.replace(/^\n/, "").replace(/\n[ \t]*$/, ""); }
function parseTable(raw: string): string[][] {
  const cleaned = raw.replace(/\\(?:hline|toprule|midrule|bottomrule|hdashline)\b/g, "").replace(/\\cline\{[^}]*\}/g, "");
  return cleaned.split(/\\\\/).map(line => line.trim()).filter(line => line.length > 0).map(line => line.split("&").map(cell => cell.trim()));
}
function parseOverlayToken(token: string): { start: number; end?: number } | undefined {
  const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
  if (range) return { start: Number(range[1]), end: Number(range[2]) };
  const from = token.match(/^(\d+)\s*-\s*$/);
  if (from) return { start: Number(from[1]) };
  const until = token.match(/^-\s*(\d+)$/);
  if (until) return { start: 1, end: Number(until[1]) };
  const single = token.match(/^(\d+)$/);
  if (single) return { start: Number(single[1]), end: Number(single[1]) };
  return undefined;
}
function parseOverlayWindows(spec?: string): OverlayWindow[] | undefined {
  if (!spec || !spec.includes(",")) return undefined;
  const windows = spec.split(",").map(token => parseOverlayToken(token.trim())).filter((range): range is OverlayWindow => Boolean(range));
  return windows.length > 1 ? windows : undefined;
}
function parseOverlay(spec?: string): { start: number; end?: number } | undefined {
  if (!spec) return undefined;
  return parseOverlayToken(spec.split(",")[0]!.trim());
}
function overlayContent(only: boolean, range: { start: number; end?: number; windows?: OverlayWindow[] } | undefined, children: PresentationNode[], source: SourceLocation): PresentationNode[] {
  if (!range || (range.start <= 1 && range.end === undefined && !range.windows)) return children;
  return [{ type: "fragment", index: range.start > 1 ? range.start - 1 : undefined, start: range.start, end: range.end, windows: range.windows, only, children, source }];
}
function textContent(nodes: AstNode[]): string { return nodes.map(n => n.type === "text" ? n.value : "").join(""); }
function stableSlideId(title: string | undefined, index: number): string { const slug = (title ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "untitled"; return `slide-${slug}-${index}`; }
function flow(nodes: PresentationNode[]): PresentationNode[] {
  const output: PresentationNode[] = []; let inline: PresentationNode[] = [];
  const flush = () => {
    if (!inline.some(node => node.type !== "text" || node.value.trim())) { inline = []; return; }
    const first = inline[0]!; output.push({ type: "paragraph", children: inline, source: first.source }); inline = [];
  };
  for (const node of nodes) {
    if (node.type === "text") {
      const pieces = node.value.split(/(\n\s*\n)/);
      for (const piece of pieces) {
        if (/^\n\s*\n$/.test(piece)) flush();
        else if (piece) inline.push({ ...node, value: piece });
      }
      continue;
    }
    if (node.type === "format" || node.type === "link" || (node.type === "math" && !node.display)) { inline.push(node); continue; }
    flush(); output.push(node);
  }
  flush(); return applyPauseBoundaries(output);
}
function applyPauseBoundaries(nodes: PresentationNode[]): PresentationNode[] {
  if (!nodes.some(node => node.type === "fragment" && node.effect === PAUSE_BOUNDARY)) return nodes;
  const groups: PresentationNode[][] = [[]];
  for (const node of nodes) {
    if (node.type === "fragment" && node.effect === PAUSE_BOUNDARY) groups.push([]);
    else groups[groups.length - 1]!.push(node);
  }
  const visible = groups.shift() ?? [];
  const firstIndex = Math.max(0, ...visible.flatMap(fragmentIndices)) + 1;
  return [...visible, ...groups.filter(group => group.length).map((group, index) => ({ type: "fragment" as const, index: firstIndex + index, children: group, source: group[0]!.source }))];
}
function fragmentIndices(node: PresentationNode): number[] { const own = (node.type === "fragment" || node.type === "list-item") && node.index !== undefined ? [node.index] : []; if (node.type === "list") return [...own, ...node.items.flatMap(fragmentIndices)]; if (node.type === "columns") return [...own, ...node.columns.flatMap(fragmentIndices)]; return "children" in node ? [...own, ...node.children.flatMap(fragmentIndices)] : own; }
function validateProps(name: string, props: Record<string, PropertyValue>, definition: ComponentDefinition, location: SourceLocation, diagnostics: import("./diagnostics.js").Diagnostic[]): void {
  if (!definition.props) return;
  for (const [key, schema] of Object.entries(definition.props)) {
    if (!(key in props) && schema.default !== undefined) props[key] = schema.default;
    if (!(key in props) && schema.required) diagnostics.push({ severity: "error", code: "RTX3001", message: `Missing required property "${key}" on component "${name}".`, location });
  }
  for (const [key, value] of Object.entries(props)) {
    const schema = definition.props[key];
    if (!schema) { diagnostics.push({ severity: "warning", code: "RTX3002", message: `Unknown property "${key}" on component "${name}".`, location, hint: suggestion(key, Object.keys(definition.props)) }); continue; }
    if (!matchesType(value, schema.type, schema.values)) diagnostics.push({ severity: "error", code: "RTX3003", message: `Invalid property "${key}" on component "${name}". Expected ${schema.type}, received ${JSON.stringify(value)}.`, location });
  }
}
function matchesType(v: PropertyValue, type: string, values?: string[]): boolean { if (type === "enum") return typeof v === "string" && !!values?.includes(v); if (["color", "dimension", "duration", "asset"].includes(type)) return typeof v === "string"; if (type === "array") return Array.isArray(v); if (type === "object") return !!v && typeof v === "object" && !Array.isArray(v); if (type === "null") return v === null; return typeof v === type; }
function unknownDiagnostic(kind: string, name: string, location: SourceLocation, known: string[]): import("./diagnostics.js").Diagnostic { return { severity: "error", code: "RTX3000", message: `Unknown ${kind} "${name}".`, location, hint: suggestion(name, known) }; }
function suggestion(value: string, known: string[]): string | undefined { const nearest = known.map(k => [k, distance(value.toLowerCase(), k.toLowerCase())] as const).sort((a,b) => a[1]-b[1])[0]; return nearest && nearest[1] <= 3 ? `Did you mean "${nearest[0]}"?` : undefined; }
function distance(a: string, b: string): number { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j=1;j<=b.length;j++) d[0]![j]=j; for(let i=1;i<=a.length;i++) for(let j=1;j<=b.length;j++) d[i]![j]=Math.min(d[i-1]![j]!+1,d[i]![j-1]!+1,d[i-1]![j-1]!+(a[i-1]===b[j-1]?0:1)); return d[a.length]![b.length]!; }
