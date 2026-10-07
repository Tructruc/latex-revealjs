# RevealTeX

[![CI](https://github.com/Tructruc/latex-revealjs/actions/workflows/ci.yml/badge.svg)](https://github.com/Tructruc/latex-revealjs/actions/workflows/ci.yml)

RevealTeX compiles a concise LaTeX-inspired `.rtex` language into readable Vue 3 + reveal.js presentations. Its parser and presentation IR are renderer-independent; the repository also includes a minimal HTML renderer as an architectural proof.

## Quick start

```bash
npm install
npm run build
node packages/cli/dist/cli.js dev examples/showcase/presentation.rtex \
  --config examples/showcase/revealtex.config.ts \
  --output .revealtex/showcase
```

Open the printed localhost URL. `dev` launches Vite, watches the complete `.rtex` include graph and configuration, and sends generated Vue updates through HMR. For an existing Vue application, use `revealtex build presentation.rtex --output src/generated`, or `watch` to rebuild without starting another server.

## Language

Frames, fragments, overlays, math, columns, media, code, notes, and renderer escape blocks follow the forms in [SPEC.md](./SPEC.md):

```latex
\begin{frame}[id=results,transition=zoom]{Results}
  \fragment[fade-up]{The result is ready.}
  \[ accuracy = 94.7\% \]
\end{frame}
```

Display and inline mathematics are rendered locally with KaTeX, so the presentation does not depend on a math-rendering CDN.

`\pause` creates real fragment boundaries: content after the first pause is hidden until the next step, and additional pauses create successive steps.

Visual containers are renderer-neutral and share styling across Vue and HTML output: `\card{...}`, `\callout[info]{...}`, and `\badge{...}`. `\place[...]` and `\position[x=12,y=20,width=40]{...}` compile to generic container IR and become real positioned layout in each renderer.

Related slides can form a vertical navigation branch:

```latex
\begin{section}{Deep Dive}
  \begin{frame}{Overview}Start here.\end{frame}
  \begin{subframe}{Detail}Navigate down for detail.\end{subframe}
\end{section}
```

Relative image, SVG, video, stylesheet, script, and typed component asset paths resolve from the `.rtex` file that declares them. Vue output uses Vite asset imports, including assets referenced by included slide files. Code blocks support line numbers and highlighted ranges through `numbers=true` and `highlight={2,4-6}`.

Presentation-level math macros are passed to the local KaTeX runtime:

```latex
\newcommand{\R}{\mathbb{R}}
\begin{frame}{Domain}
  \[x \in \R^d\]
\end{frame}
```

Includes resolve relative to their owner and reject cycles. `\input`, `\include`, and `\subimport` are supported:

```latex
\input{slides/results.rtex}
```

## Reveal features

`\theme{name}` selects a built-in reveal theme (`black`, `black-contrast`, `white`, `white-contrast`, `league`, `beige`, `sky`, `night`, `serif`, `simple`, `solarized`, `moon`, `dracula`, `blood`); a local `config.theme.css` still overrides it. Global reveal options can be set in source with `\reveal{autoAnimate=true,transition=none}`, merged over `config.reveal`.

Any unrecognised frame option is emitted as a `data-*` attribute, so every reveal.js feature is reachable without waiting for first-class syntax:

```latex
\begin{frame}[state=results,autoslide=8000,
  background-image={assets/grid.svg},background-size=cover,
  background-opacity=0.35,visibility=uncounted]{Results}
\end{frame}
```

Dedicated background commands cover the common cases: `\backgroundcolor{}`, `\backgroundimage{}`, `\backgroundgradient{}`, `\backgroundvideo{}`, and `\backgroundiframe{}`.

Beamer-style overlays map onto reveal fragments. `\only` removes hidden content from layout, `\uncover`/`\visible` keep it, and ranges/inclusive overlays are supported:

```latex
\begin{itemize}
  \item<1-> Always visible
  \item<2-> From the second overlay
\end{itemize}
\only<3>{Only on the third overlay}
\uncover<4->{From the fourth overlay onward}
\visible<2-4>{Visible on overlays two to four}
\alt<3>{Before three}{From three}
\temporal<3>{Before}{At}{After}
```

Overlays also accept Beamer relative forms resolved with a per-frame cursor (`<+>`, `<+->`, `<+-k>`) and non-contiguous windows such as `<2,4>`. Missing reveal steps referenced by window overlays are padded automatically so the sequence stays correct.

```latex
\begin{itemize}
  \item<+-> First
  \item<+-> Second
\end{itemize}
```

Display math accepts `$$...$$`, `\[...\]`, and the `equation`, `align`, `gather`, `multline`, `split`, `aligned`, `gathered`, and `cases` environments, all rendered locally with KaTeX. `\today` expands to the current date inside `\date{...}`. `\begin{markdown}...\end{markdown}` renders GitHub-flavoured Markdown at build time, including `$...$`/`$$...$$` math via KaTeX.

Reveal layout utilities are first-class containers: `\fittext{}`, `\stack{}`, `\hstack{}`, `\vstack{}`, `\stretch{}`, and `\frame{}`.

Code blocks use reveal's highlight plugin, so `numbers=true` and `highlight={1|2|3}` produce real syntax colouring, line numbers, and stepped line highlighting. External files can be included with `\lstinputlisting[language=ts]{src/app.ts}`. Mermaid diagrams compile to renderer-neutral IR:

```latex
\begin{mermaid}
graph LR
  Author --> Compiler --> IR --> Renderer
\end{mermaid}
```

Charts use Chart.js (loaded from a CDN) with any Chart.js data object and a `type` option:

```latex
\begin{chart}[type=bar]
{ "labels": ["A", "B"], "datasets": [{ "label": "Score", "data": [94.7, 12.4] }] }
\end{chart}
```

Related vertical slides can carry their own transition with `\begin{section}[transition=convex]{Title}`.

`\titlegraphic{...}` adds an image to the title slide and `\logo{...}` adds one to every slide. Frames accept a `\framesubtitle{...}` and a `\label{...}`; `\ref{label}`/`\pageref{label}` resolve to the referenced slide number. `\tableofcontents` (after `\maketitle`) inserts a linked outline slide built from the document sections. Lists reveal incrementally with `\begin{itemize}[<+->]` (or `[incremental=true]`). Beamer blocks and theorem-like environments map to titled containers: `\begin{block}{Title}...`, plus `alertblock`, `exampleblock`, `theorem`, `lemma`, `corollary`, `proposition`, `definition`, `example`, `proof`, and `remark`.

Tables use LaTeX-style rows and cells, with an optional header row and caption:

```latex
\begin{table}[header=true,caption={Validation metrics}]
Metric & Value \\
Accuracy & 94.7% \\
\end{table}
```

Links compile to real anchors: `\href{https://revealjs.com}{revealjs.com}`, `\url{https://revealjs.com}`, and `\hyperlink{slide-label}{jump}` for cross-slide navigation. Inline formatting includes `\textbf`, `\textit`, `\emph`/`\em`, `\texttt`, `\textsf`, `\textsc`, `\underline`, `\alert`, `\small`, `\large`, `\Huge`, and `\textcolor{...}{...}`; `\includegraphics` is an alias for `\image`.

A minimal deck lives in [`examples/minimal`](./examples/minimal).

## Custom Vue components

Register a component and an optional prop schema once:

```ts
import { defineConfig } from "revealtex";

export default defineConfig({
  components: {
    MetricCard: {
      source: "@/components/MetricCard.vue",
      props: {
        value: { type: "number", required: true },
        label: { type: "string", required: true }
      }
    }
  }
});
```

The `props` schema is optional: the CLI reads each component's `.vue` source and derives it from `defineProps` (type literals, optional flags, string-literal enums, arrays, `withDefaults` defaults, or runtime object declarations), with any explicit config schema taking precedence. Portability, semantic fallback, and an HTML renderer can also live in a sibling `<Component>.meta.ts`/`.meta.json` file created with `defineComponentMetadata({...})`. Set `components.autoDiscover` to a folder to register every `.vue` file recursively, and `aliases` to expose a component under extra command names:

```ts
export default defineConfig({
  components: { autoDiscover: "./src/components" },
  aliases: { Score: "MetricCard" }
});
```

Then use it as native presentation syntax. Imports are deduplicated and values retain their types:

```latex
\MetricCard[value=94.7,label={Validation Accuracy}]
```

Components may contain presentation children and named slots:

```latex
\begin{FeatureCard}
  \slot{title}{Fast}
  Compile presentations almost instantly.
\end{FeatureCard}
```

Vue-only markup is deliberately explicit with `\begin{vue}...\end{vue}`. Generic components remain generic `ComponentIR` nodes; only the Vue renderer decides how to import and emit them.

For portable components, declare semantic HTML markup alongside the Vue source. The HTML backend emits that tag and class without leaking Vue details; Vue-only components receive a source-located portability warning:

```ts
MetricCard: {
  source: "@/components/MetricCard.vue",
  portability: "portable",
  semanticFallback: { tag: "article", class: "metric-card" }
}
```

Components that need richer output can register a build-time HTML renderer module:

```ts
MetricCard: {
  source: "@/components/MetricCard.vue",
  html: { renderer: "./renderers/metric-card-html.ts" },
  portability: "portable"
}
```

The module exports a synchronous default function receiving `name`, typed `props`, rendered `children`, rendered `slots`, source location, an `escape()` helper, and an `asset()` helper for typed local assets. JavaScript, ESM, and TypeScript renderer modules are supported; failures produce a warning and fall back safely.

Use `type: "asset"` for component props that point to presentation files. The compiler records them in the asset manifest and the Vue renderer emits Vite-native imports:

```ts
DataChart: {
  source: "@/components/DataChart.vue",
  props: { data: { type: "asset", required: true } }
}
```

Custom components can subscribe to Reveal without owning the deck. Subscriptions are automatically removed with the component scope:

```ts
const { ready, onSlideEnter, onFragmentShow } = usePresentationLifecycle();
onSlideEnter(event => animate(event.currentSlide));
onFragmentShow(event => emphasize(event.fragment));
```

The runtime also exposes `onPresentationReady`, `onSlideLeave`, `onFragmentHide`, and the controlled `on(event, listener)` bridge. Speaker notes are enabled by default through Reveal's notes plugin.

Plugins can add domain-specific commands and environments by mapping them to ordinary registered components. Returned props are validated by the same schema path as component shorthand:

```ts
plugins: [{
  name: "metrics-language",
  commands: {
    score: {
      component: "MetricCard",
      props: ({ argument }) => ({ value: Number(argument), label: "Score" })
    }
  }
}]
```

This makes `\score{94.7}` compile to portable `ComponentIR`. Command children are omitted by default; set `preserveChildren: true` when a command component needs them. Plugin environments preserve their body by default.

## Packages

- `@revealtex/compiler`: parser, AST, includes, diagnostics, semantic analysis, and IR
- `@revealtex/renderer-core`: renderer contract and registry
- `@revealtex/renderer-vue`: readable Vue source generator
- `@revealtex/renderer-html`: standalone reveal.js HTML renderer with semantic component fallbacks
- `@revealtex/runtime-vue`: reveal lifecycle components, context composables, theme, and animations
- `revealtex`: public configuration API and CLI

Run `npm test` for parser, semantic, custom-component, Vue-generation, and HTML-backend coverage.

The HTML renderer emits a standalone `index.html` with pinned Reveal dependencies, build-time KaTeX (including `\newcommand` macros), embedded RevealTeX layout/animation styles, notes support, numbered/highlighted code, and semantic component fallbacks. Local media, styles, scripts, and typed component assets are deduplicated into the output `assets/` directory and their URLs are rewritten automatically:

```bash
node packages/cli/dist/cli.js build presentation.rtex --renderer html --output dist-html
```
