# RevealTeX — Full Technical Specification

## 1. Project goal

Build a presentation authoring system that combines:

* the structured authoring experience of LaTeX/Beamer,
* the animations and transitions of reveal.js,
* the component model and flexibility of Vue,
* a framework-independent compiler architecture,
* and first-class support for user-defined custom components.

The system should allow presentations to be authored in a concise LaTeX-like language such as:

```latex
\documentclass{reveal}

\title{Neural Networks}
\subtitle{A Modern Introduction}
\author{John Smith}

\theme{aurora}
\transition{slide}

\begin{document}

\maketitle

\begin{frame}{Why Neural Networks?}

\begin{itemize}
    \item<1-> Flexible function approximators
    \item<2-> Learn representations automatically
    \item<3-> Scale to very large problems
\end{itemize}

\end{frame}

\begin{frame}[layout=metric]{Performance}

\MetricCard[
    value=94.7,
    suffix={\%},
    label={Validation Accuracy},
    trend=3.1
]

\end{frame}

\begin{frame}{Architecture}

\ArchitectureDiagram[
    layers=6,
    animated=true,
    mode=training
]

\end{frame}

\end{document}
```

and compile it into an interactive Vue + reveal.js presentation.

The primary design principle is:

```text
.rtex
   ↓
Language parser
   ↓
Presentation AST
   ↓
Normalized Presentation IR
   ↓
Renderer
   ↓
Vue components
   ↓
reveal.js
   ↓
Browser
```

The `.rtex` source must not depend fundamentally on Vue.

Vue is the initial renderer.

The compiler architecture must allow future renderers such as:

```text
HTML/CSS/JS
React
Svelte
Solid
other presentation engines
```

without rewriting the parser or presentation model.

---

# 2. Core philosophy

The system should treat the following concerns as separate layers:

```text
Authoring syntax
    =
what the author means

Presentation IR
    =
framework-independent presentation structure

Vue components
    =
how presentation elements look

Reveal.js
    =
navigation, fragments, transitions, presentation state

CSS / animation system
    =
visual behavior

Custom components
    =
specialized reusable presentation functionality
```

A user should spend most of their time writing:

```latex
\begin{frame}[layout=Hero]{Introduction}

\fragment[fade-up]{
A modern presentation system.
}

\end{frame}
```

instead of repeatedly writing:

```vue
<RevealSlide layout="Hero">
    <RevealFragment effect="fade-up">
        A modern presentation system.
    </RevealFragment>
</RevealSlide>
```

The generated Vue code should be viewed as a compilation target rather than the primary authoring format.

---

# 3. Primary use cases

The system should work especially well for:

* technical presentations,
* scientific talks,
* academic lectures,
* machine-learning presentations,
* engineering presentations,
* business presentations,
* animated diagrams,
* mathematical derivations,
* interactive demonstrations,
* data visualizations,
* conference talks,
* product presentations,
* classroom material.

It should be capable of mixing:

```text
text
math
code
images
SVG
video
charts
interactive Vue components
WebGL
Canvas
D3
Three.js
GSAP
Vue animations
custom HTML
```

inside a reveal.js deck.

---

# 4. Non-goals

The project should not attempt to:

* implement a complete TeX engine,
* reproduce every Beamer command,
* render arbitrary LaTeX packages,
* replace Vue,
* replace reveal.js,
* invent a complete browser rendering engine,
* force every presentation into a single visual theme,
* translate arbitrary Vue component internals into another framework.

Custom Vue components may intentionally be renderer-specific.

The portable presentation language should remain framework-independent where practical.

---

# 5. Recommended implementation stack

Use:

```text
TypeScript
Node.js
Vue 3
Vite
reveal.js
Vitest
```

Use MathJax or another strong TeX-compatible math renderer for mathematics.

The compiler should itself be written in TypeScript.

Reasons include:

* shared TypeScript types across compiler and renderer,
* straightforward Vue integration,
* Vite integration,
* npm package support,
* simple plugin architecture,
* good AST tooling,
* good source-map tooling,
* strong testing ecosystem.

---

# 6. Repository architecture

A recommended project structure is:

```text
revealtex/
│
├── packages/
│   │
│   ├── compiler/
│   │   ├── src/
│   │   │   ├── lexer/
│   │   │   ├── parser/
│   │   │   ├── ast/
│   │   │   ├── semantic/
│   │   │   ├── ir/
│   │   │   ├── includes/
│   │   │   ├── diagnostics/
│   │   │   └── compiler/
│   │   └── tests/
│   │
│   ├── renderer-core/
│   │   ├── Renderer.ts
│   │   ├── RenderContext.ts
│   │   ├── capabilities.ts
│   │   └── registry.ts
│   │
│   ├── renderer-vue/
│   │   ├── VueRenderer.ts
│   │   ├── generator/
│   │   ├── imports/
│   │   ├── templates/
│   │   └── tests/
│   │
│   ├── runtime-vue/
│   │   ├── RevealDeck.vue
│   │   ├── RevealSlide.vue
│   │   ├── RevealFragment.vue
│   │   ├── RevealNotes.vue
│   │   ├── RevealMath.vue
│   │   ├── RevealCode.vue
│   │   └── composables/
│   │
│   ├── renderer-html/
│   │   └── prototype/
│   │
│   ├── theme-default/
│   │   ├── theme.css
│   │   ├── animations.css
│   │   └── components.css
│   │
│   ├── cli/
│   │
│   └── config/
│
├── examples/
│   ├── minimal/
│   ├── showcase/
│   ├── custom-components/
│   └── existing-vue-project/
│
├── docs/
│
├── package.json
├── tsconfig.json
└── README.md
```

A simpler initial repository layout is acceptable as long as the architectural boundaries remain explicit.

---

# 7. File format

Use the extension:

```text
.rtex
```

This makes it clear that the format is LaTeX-inspired but is not intended to be compiled by pdfLaTeX.

Example:

```text
presentation.rtex
```

---

# 8. Basic document syntax

Support:

```latex
\documentclass{reveal}

\title{Presentation Title}
\subtitle{Optional Subtitle}
\author{Author Name}
\date{\today}

\theme{aurora}

\transition{slide}
\transitionspeed{fast}

\begin{document}

\maketitle

...

\end{document}
```

Metadata should become part of the presentation IR.

Example:

```typescript
interface PresentationMetadata {
    title?: string;
    subtitle?: string;
    author?: string;
    date?: string;
    description?: string;
}
```

---

# 9. Parser requirements

Do not implement the language using giant regular expressions.

Create a real tokenizer/parser or a carefully structured recursive parser.

The parser must understand:

```latex
\command
```

```latex
\command{argument}
```

```latex
\command[options]
```

```latex
\command[options]{argument}
```

```latex
\begin{environment}
...
\end{environment}
```

and nested structures.

For example:

```latex
\fragment{
    This contains
    \textbf{
        nested content
    }.
}
```

must parse correctly.

---

# 10. Comments

Support:

```latex
% This is a comment
```

Comments should be ignored unless preserved for source tooling.

Escaped percent signs should remain possible:

```latex
94.7\%
```

---

# 11. Source locations

Every AST node should carry source information.

Example:

```typescript
interface SourceLocation {
    file: string;
    start: {
        line: number;
        column: number;
        offset: number;
    };
    end: {
        line: number;
        column: number;
        offset: number;
    };
}
```

This is essential for:

* compiler errors,
* warnings,
* IDE support,
* source maps,
* debugging generated Vue code.

---

# 12. AST design

The AST should represent what was written.

Example:

```typescript
interface AstNode {
    type: string;
    location: SourceLocation;
}
```

Possible nodes include:

```text
Document
Command
Environment
Text
Math
Comment
RawBlock
```

The AST does not need to represent final presentation semantics yet.

Example:

```typescript
interface CommandNode extends AstNode {
    type: "command";
    name: string;
    optionalArguments: AstArgument[];
    requiredArguments: AstArgument[];
}
```

---

# 13. Semantic compilation

Convert raw AST into a normalized presentation representation.

For example:

```text
AST command:

\fragment[fade-left]{Hello}

        ↓

IR:

FragmentNode {
    effect: "fade-left",
    children: [...]
}
```

This semantic stage should validate:

* known commands,
* valid environment nesting,
* option types,
* component registrations,
* duplicate IDs,
* fragment ordering,
* layout names,
* component props where schemas exist.

---

# 14. Presentation IR

The Presentation IR is one of the most important parts of the architecture.

It must not contain Vue-specific implementation details.

For example:

```typescript
interface PresentationIR {
    type: "presentation";

    metadata: PresentationMetadata;
    configuration: PresentationConfiguration;

    slides: SlideIR[];

    assets: AssetReference[];

    sourceFiles: string[];
}
```

Possible node union:

```typescript
type PresentationNode =
    | TextIR
    | ParagraphIR
    | HeadingIR
    | MathIR
    | SlideIR
    | FragmentIR
    | ListIR
    | ListItemIR
    | ColumnsIR
    | ColumnIR
    | ImageIR
    | CodeIR
    | ComponentIR
    | LayoutIR
    | SlotIR
    | NotesIR
    | RawRendererBlockIR
    | ContainerIR;
```

---

# 15. Frames

Primary syntax:

```latex
\begin{frame}{Introduction}

Hello world.

\end{frame}
```

Frame options:

```latex
\begin{frame}[
    id=introduction,
    transition=slide,
    transition-speed=fast,
    autoanimate,
    center,
    layout=Hero
]{Introduction}

...

\end{frame}
```

Normalized representation:

```typescript
interface SlideIR {
    type: "slide";

    id: string;

    title?: PresentationNode[];

    transition?: {
        effect?: string;
        speed?: string;
    };

    autoAnimate?: boolean;

    layout?: string;

    options: Record<string, unknown>;

    children: PresentationNode[];

    notes?: PresentationNode[];

    source: SourceLocation;
}
```

---

# 16. Stable slide IDs

Every slide should have a stable ID.

Explicit:

```latex
\begin{frame}[id=model-results]{Results}
```

Automatic IDs should preferably be derived deterministically.

Example:

```text
slide-results-3
```

Stable IDs help:

* hot reload,
* incremental builds,
* state preservation,
* auto-animate,
* source mapping,
* deep links.

---

# 17. Transitions

Expose reveal.js-style transitions at the language level.

Global:

```latex
\transition{slide}
```

Support at least:

```latex
\transition{none}
\transition{fade}
\transition{slide}
\transition{convex}
\transition{concave}
\transition{zoom}
```

Transition speed:

```latex
\transitionspeed{default}
\transitionspeed{fast}
\transitionspeed{slow}
```

Per slide:

```latex
\begin{frame}[
    transition=zoom,
    transition-speed=slow
]{Deep Dive}
```

---

# 18. Fragments

Basic syntax:

```latex
\fragment{Hello}
```

Effects:

```latex
\fragment[fade-in]{Hello}
\fragment[fade-up]{Hello}
\fragment[fade-down]{Hello}
\fragment[fade-left]{Hello}
\fragment[fade-right]{Hello}
\fragment[grow]{Hello}
\fragment[shrink]{Hello}
\fragment[fade-out]{Hello}
```

Ordering:

```latex
\fragment[index=3, effect=fade-up]{
    Third fragment
}
```

The normalized IR should be:

```typescript
interface FragmentIR {
    type: "fragment";
    effect?: string;
    index?: number;
    children: PresentationNode[];
}
```

---

# 19. Beamer-style list overlays

Support:

```latex
\begin{itemize}
    \item<1-> First
    \item<2-> Second
    \item<3-> Third
\end{itemize}
```

This should be syntactic sugar for ordered fragments.

Also support:

```latex
\pause
```

The semantic compiler should convert it into fragment boundaries.

---

# 20. Custom fragment animation library

Ship several reusable animations.

Suggested names:

```text
fade-in
fade-out
fade-left
fade-right
fade-up
fade-down

fly-in-left
fly-in-right
fly-in-top
fly-in-bottom

blur-in
blur-out

scale-up
scale-down

pop
rotate-in

glow
underline-reveal
```

Animations should generally rely on:

```text
transform
opacity
filter
```

rather than expensive layout properties.

Animations should respect:

```css
@media (prefers-reduced-motion: reduce)
```

---

# 21. Generic animation command

Support:

```latex
\animate[
    effect=fly-in-right,
    duration=700ms,
    delay=100ms,
    easing={cubic-bezier(.22,1,.36,1)}
]{
    Content
}
```

Normalized representation:

```typescript
interface AnimationIR {
    effect: string;
    duration?: number;
    delay?: number;
    easing?: string;
}
```

The renderer determines how this becomes a Vue class, CSS animation, or another target representation.

---

# 22. Auto-Animate

Support:

```latex
\begin{frame}[autoanimate]{State One}

...

\end{frame}

\begin{frame}[autoanimate]{State Two}

...

\end{frame}
```

Allow stable element identities:

```latex
\id{model}{
    ...
}
```

or:

```latex
\element[id=model]{
    ...
}
```

This becomes framework-neutral IR:

```typescript
interface ElementIR {
    type: "element";
    id?: string;
    children: PresentationNode[];
}
```

The reveal adapter should translate that into appropriate Auto-Animate identifiers.

---

# 23. Text formatting

Support basic commands:

```latex
\textbf{Bold}
\textit{Italic}
\emph{Emphasis}
\underline{Underline}
\alert{Important}
\small{Smaller}
\large{Larger}
\Huge{Very large}
```

Do not attempt to implement arbitrary TeX text layout.

---

# 24. Mathematics

Support inline:

```latex
$E = mc^2$
```

and display:

```latex
\[
E = mc^2
\]
```

Math content should be preserved as TeX source in the IR.

Example:

```typescript
interface MathIR {
    type: "math";
    display: boolean;
    source: string;
}
```

The renderer/runtime should pass it to MathJax or another configured math engine.

---

# 25. Math macros

Support presentation-level macro configuration.

Example:

```latex
\newcommand{\R}{\mathbb{R}}
```

Full TeX macro expansion is not required.

The semantic compiler may collect macro definitions and configure MathJax accordingly.

---

# 26. Step-by-step derivations

Provide:

```latex
\begin{steps}

\[
f(x)=x^2
\]

\[
f'(x)=2x
\]

\[
f'(3)=6
\]

\end{steps}
```

Initial implementation may compile each step to ordered fragments.

Later, the system may support equation morphing.

---

# 27. Columns

Support:

```latex
\begin{columns}

\column{0.4}

Left side.

\column{0.6}

Right side.

\end{columns}
```

With options:

```latex
\begin{columns}[gap=2rem, align=center]
```

IR:

```typescript
interface ColumnsIR {
    type: "columns";
    gap?: string;
    alignment?: string;
    columns: ColumnIR[];
}
```

---

# 28. Images

Support:

```latex
\image{assets/model.png}
```

Options:

```latex
\image[
    width=70%,
    rounded=true,
    shadow=true,
    alt={Architecture diagram},
    caption={System architecture}
]{assets/model.png}
```

---

# 29. Videos

Support:

```latex
\video{assets/demo.mp4}
```

Options:

```latex
\video[
    autoplay=true,
    muted=true,
    loop=true,
    controls=false,
    width=80%
]{assets/demo.mp4}
```

---

# 30. Code

Support:

```latex
\begin{code}[language=python]

def hello():
    print("Hello")

\end{code}
```

Options:

```latex
\begin{code}[
    language=typescript,
    highlight={2,4-6},
    numbers=true
]
...
\end{code}
```

---

# 31. Speaker notes

Support:

```latex
\note{
Explain the experiment before showing the result.
}
```

The Vue/reveal runtime should translate this into reveal.js speaker notes.

---

# 32. Backgrounds

Support:

```latex
\background{#10131c}
```

Images:

```latex
\backgroundimage{assets/background.jpg}
```

Gradients:

```latex
\backgroundgradient{
    linear-gradient(135deg, #0f172a, #312e81)
}
```

Per frame:

```latex
\begin{frame}[
    background=#0f172a
]{Title}
```

---

# 33. Layout system

Layouts are reusable presentation structures.

Example:

```latex
\begin{frame}[layout=Hero]{Introduction}
...
\end{frame}
```

A layout may correspond to a Vue component:

```text
Hero
    → HeroSlide.vue

TwoColumn
    → TwoColumnSlide.vue

BigNumber
    → BigNumberSlide.vue
```

Layouts must not be hard-coded into the parser.

They should be registered through configuration.

---

# 34. Slots

Layouts and custom components must support named content areas.

Example:

```latex
\begin{layout}[name=HeroSplit]

\slot{left}{
    \Huge{Neural Networks}
}

\slot{right}{
    \image{network.svg}
}

\end{layout}
```

Framework-independent representation:

```typescript
interface SlotIR {
    type: "slot";
    name: string;
    children: PresentationNode[];
}
```

Vue renderer:

```vue
<HeroSplit>
    <template #left>
        ...
    </template>

    <template #right>
        ...
    </template>
</HeroSplit>
```

A future React renderer may represent the same slots differently.

---

# 35. Custom component system

This must be a first-class feature of the project.

Users must be able to create arbitrary Vue components and use them directly from `.rtex`.

For example, suppose the user creates:

```text
src/presentation/components/MetricCard.vue
```

Then they register it:

```typescript
import { defineRevealTeXConfig } from "revealtex";

export default defineRevealTeXConfig({
    components: {
        MetricCard: {
            source: "@/presentation/components/MetricCard.vue"
        }
    }
});
```

The `.rtex` file can then contain:

```latex
\MetricCard[
    value=94.7,
    suffix={\%},
    label={Accuracy},
    trend=3.1
]
```

The generated Vue result could be:

```vue
<MetricCard
    :value="94.7"
    suffix="%"
    label="Accuracy"
    :trend="3.1"
/>
```

---

# 36. Generic component syntax

Every component should also be usable without defining a custom command.

Support:

```latex
\component{MetricCard}[
    value=94.7,
    label={Accuracy},
    trend=3.1
]
```

For components with children:

```latex
\begin{component}[name=GlassCard]

Some content.

\end{component}
```

---

# 37. Registered component shorthand

If a component is registered as:

```text
MetricCard
```

then:

```latex
\MetricCard[...]
```

should automatically resolve to that component.

This allows natural custom DSLs.

Example:

```latex
\Architecture[
    type=transformer,
    layers=12,
    animate=true
]
```

without requiring the compiler core to know what `Architecture` means.

Resolution order should be approximately:

```text
built-in language command
      ↓
registered component command
      ↓
registered plugin command
      ↓
unknown command diagnostic
```

---

# 38. Component registration

Support configuration such as:

```typescript
export default defineRevealTeXConfig({
    components: {
        MetricCard: {
            source: "@/components/MetricCard.vue"
        },

        ArchitectureDiagram: {
            source: "@/components/ArchitectureDiagram.vue"
        },

        InteractiveChart: {
            source: "@/components/InteractiveChart.vue"
        }
    }
});
```

---

# 39. Component schemas

Custom components should optionally define prop schemas.

Example:

```typescript
MetricCard: {
    source: "@/components/MetricCard.vue",

    props: {
        value: {
            type: "number",
            required: true
        },

        label: {
            type: "string",
            required: true
        },

        suffix: {
            type: "string",
            default: ""
        },

        trend: {
            type: "number"
        },

        animated: {
            type: "boolean",
            default: true
        }
    }
}
```

This gives the compiler the ability to validate:

```latex
\MetricCard[
    value=banana,
    label={Accuracy}
]
```

and report:

```text
slides/results.rtex:24:5

Invalid property "value" on component "MetricCard".

Expected:
    number

Received:
    "banana"
```

---

# 40. Prop types

Support at least:

```text
string
number
boolean
null
array
object
enum
color
dimension
duration
asset
```

Examples:

```latex
\Example[
    title={Hello},
    count=10,
    active=true,
    opacity=0.5,
    labels={["A", "B", "C"]}
]
```

The IR should preserve typed values.

---

# 41. Enum props

Schema:

```typescript
mode: {
    type: "enum",
    values: ["training", "inference", "comparison"]
}
```

Source:

```latex
\ArchitectureDiagram[
    mode=training
]
```

Invalid values should produce compiler diagnostics.

---

# 42. Component children

Support:

```latex
\begin{Card}

This is arbitrary presentation content.

\[
E=mc^2
\]

\fragment{
More information.
}

\end{Card}
```

This should generate conceptually:

```vue
<Card>
    <p>This is arbitrary presentation content.</p>

    <MathBlock tex="E=mc^2" />

    <RevealFragment>
        More information.
    </RevealFragment>
</Card>
```

---

# 43. Component slots

Allow custom Vue component slots.

Example Vue component:

```vue
<template>
    <div class="feature-card">
        <header>
            <slot name="icon" />
            <slot name="title" />
        </header>

        <main>
            <slot />
        </main>
    </div>
</template>
```

Use from `.rtex`:

```latex
\begin{FeatureCard}

\slot{icon}{
    \Icon{name=rocket}
}

\slot{title}{
    Fast
}

Compile presentations almost instantly.

\end{FeatureCard}
```

The unnamed content becomes the default slot.

---

# 44. Component events

Portable `.rtex` should not normally contain framework-specific event handlers.

However, Vue-specific interactive components may require event handling.

Provide an explicit Vue escape mechanism.

Example:

```latex
\begin{vue}
<InteractiveChart
    :dataset="results"
    @point-click="handlePoint"
/>
\end{vue}
```

Or optionally support advanced renderer-specific attributes:

```latex
\component{InteractiveChart}[
    vue:@point-click={handlePoint}
]
```

But keep renderer-specific expressions clearly marked.

---

# 45. Dynamic Vue props

Do not interpret arbitrary JavaScript by default.

Static portable source:

```latex
\Chart[
    animated=true,
    opacity=0.7
]
```

For advanced Vue expressions, require explicit syntax:

```latex
\Chart[
    vue::data={reactiveDataset},
    vue:@select={handleSelection}
]
```

If implementing this syntax becomes awkward, prefer a dedicated Vue block.

Portability is more important than making arbitrary expressions terse.

---

# 46. Renderer-specific blocks

Support:

```latex
\begin{vue}

<MyCustomDemo
    :model="model"
    @change="handleChange"
/>

\end{vue}
```

Raw HTML:

```latex
\begin{html}

<div class="special-thing">
    ...
</div>

\end{html}
```

Future:

```latex
\begin{react}
...
\end{react}
```

The IR may contain:

```typescript
interface RendererSpecificIR {
    type: "renderer-specific";
    renderer: "vue" | "html" | "react" | string;
    source: string;
}
```

---

# 47. Component aliases

Allow component aliases.

Example:

```typescript
components: {
    KPI: {
        source: "@/components/MetricCard.vue"
    }
}
```

Then:

```latex
\KPI[
    value=120,
    label={Customers}
]
```

---

# 48. Namespaced components

Allow namespaces to avoid collisions.

Example config:

```typescript
components: {
    "charts.Line": {
        source: "@/charts/LineChart.vue"
    }
}
```

Possible syntax:

```latex
\component{charts.Line}[
    animated=true
]
```

or:

```latex
\ChartsLine[...]
```

The generic component form must always work even if shorthand cannot support a particular name.

---

# 49. Component presets

Users should be able to define reusable presets.

Configuration:

```typescript
presets: {
    SuccessMetric: {
        component: "MetricCard",
        props: {
            variant: "success",
            animated: true
        }
    }
}
```

Then:

```latex
\SuccessMetric[
    value=94.7,
    label={Accuracy}
]
```

---

# 50. Custom component discovery

Support two strategies.

Explicit registration:

```typescript
components: {
    MetricCard: {
        source: "@/components/MetricCard.vue"
    }
}
```

Optional automatic discovery:

```typescript
components: {
    autoDiscover: "./src/presentation/components"
}
```

For example:

```text
components/
├── MetricCard.vue
├── NeuralNetwork.vue
└── ResultTable.vue
```

could automatically register:

```text
MetricCard
NeuralNetwork
ResultTable
```

Explicit registration should override auto-discovery.

---

# 51. Component metadata files

Optionally support sidecar metadata.

Example:

```text
MetricCard.vue
MetricCard.rtex.ts
```

Metadata:

```typescript
export default defineComponentMetadata({
    props: {
        value: {
            type: "number",
            required: true
        },
        label: {
            type: "string",
            required: true
        }
    }
});
```

This avoids modifying the Vue component itself.

---

# 52. Vue component introspection

Do not depend exclusively on automatic Vue prop introspection.

Introspection may be used as a convenience where reliable, but explicit component schemas must remain supported.

The compiler should not require complex Vue SFC parsing merely to use custom components.

---

# 53. Component renderer fallback

The IR should represent custom components generically:

```typescript
interface ComponentIR {
    type: "component";

    name: string;

    props: Record<string, PropertyValue>;

    slots: Record<string, PresentationNode[]>;

    children: PresentationNode[];

    source: SourceLocation;
}
```

Vue renderer:

```vue
<MetricCard ... />
```

HTML renderer may:

1. use an HTML renderer registered for that component,
2. use a generic fallback,
3. emit a diagnostic.

Example configuration:

```typescript
components: {
    MetricCard: {
        vue: "@/components/MetricCard.vue",

        html: {
            renderer: "./renderers/metric-card-html.ts"
        }
    }
}
```

This makes portability possible without pretending arbitrary Vue components can automatically become raw HTML components.

---

# 54. Component portability levels

Components should support declared portability.

Example:

```typescript
MetricCard: {
    portability: "portable",
    ...
}
```

Possible levels:

```text
portable
vue-only
renderer-specific
```

A Vue-only component compiled with an HTML renderer should produce:

```text
Warning:
Component "InteractiveNeuralNetwork" is Vue-only.

Source:
slides/model.rtex:82

Target renderer:
html
```

---

# 55. Vue runtime

Create reusable runtime components.

At minimum:

```text
RevealDeck.vue
RevealSlide.vue
RevealFragment.vue
RevealNotes.vue
RevealMath.vue
RevealCode.vue
```

`RevealDeck.vue` should be responsible for:

* initializing reveal.js,
* updating presentation state,
* disposing reveal correctly,
* registering plugins,
* applying deck configuration.

Generated slide composition should not initialize reveal.js itself.

---

# 56. Reveal deck lifecycle

Conceptually:

```typescript
onMounted(async () => {
    deck = new Reveal(root.value!, revealOptions);
    await deck.initialize();
});

onBeforeUnmount(() => {
    deck?.destroy();
});
```

Actual implementation should follow the currently supported reveal.js integration model.

---

# 57. Vue renderer output modes

Support at least two Vue modes.

## Existing project mode

Generate files into an existing Vue application:

```bash
revealtex build presentation.rtex \
    --renderer vue \
    --output src/generated/presentation
```

Possible output:

```text
src/generated/presentation/
├── Presentation.generated.vue
├── presentation.generated.ts
└── presentation.generated.css
```

## Standalone project mode

Generate a complete Vite project:

```bash
revealtex create presentation.rtex \
    --standalone
```

Possible output:

```text
dist-vue/
├── src/
├── package.json
├── vite.config.ts
└── index.html
```

---

# 58. Generated Vue quality

Generated Vue must be readable.

Prefer:

```vue
<RevealSlide
    title="Optimization"
    transition="slide"
>
    <SlideColumns>
        <MetricCard
            :value="94.7"
            label="Accuracy"
        />
    </SlideColumns>
</RevealSlide>
```

Avoid excessively generic output such as:

```vue
<component
    :is="resolveThing(node.type)"
    v-bind="node.props"
/>
```

for the primary generated representation unless there is a compelling architectural reason.

Runtime-driven AST rendering may be supported as an alternative build mode.

---

# 59. Static generation versus runtime IR rendering

The system may support two modes.

### Generated Vue

```text
.rtex
 ↓
compiler
 ↓
.vue source
 ↓
Vite
```

Benefits:

* readable generated output,
* standard Vue tooling,
* straightforward custom component imports.

### Runtime IR

```text
.rtex
 ↓
compiler
 ↓
presentation.json
 ↓
generic Vue renderer
```

Benefits:

* fast compilation,
* simpler hot reload,
* potentially easier dynamic loading.

Implement whichever provides the best initial developer experience, but design the IR so both remain possible.

For custom Vue components, generated Vue source is likely the simpler first implementation.

---

# 60. Automatic imports

If `.rtex` contains:

```latex
\MetricCard[
    value=94.7
]
```

the renderer should automatically generate:

```typescript
import MetricCard from "@/components/MetricCard.vue";
```

Do not require the `.rtex` author to manage Vue imports.

---

# 61. Import deduplication

If a component is used 20 times, import it once.

Generated imports must be deterministic.

---

# 62. Lazy loading

Optionally support:

```typescript
MetricCard: {
    source: "@/components/MetricCard.vue",
    lazy: true
}
```

The renderer may generate an async import.

This is useful for heavy interactive components.

---

# 63. Layout registration

Configuration:

```typescript
layouts: {
    Hero: {
        source: "@/layouts/HeroSlide.vue"
    },

    BigNumber: {
        source: "@/layouts/BigNumber.vue"
    },

    TitleImage: {
        source: "@/layouts/TitleImage.vue"
    }
}
```

Source:

```latex
\begin{frame}[layout=BigNumber]{Revenue}

\metric{€24M}

\end{frame}
```

---

# 64. Theme registration

Theme configuration must remain separate from component/layout configuration.

Example:

```typescript
themes: {
    aurora: {
        css: "./themes/aurora.css"
    },

    minimal: {
        css: "./themes/minimal.css"
    }
}
```

Source:

```latex
\theme{aurora}
```

---

# 65. Default visual theme

Create one polished default theme.

Design direction:

```text
dark graphite background
off-white typography
violet/indigo accent
large clean headings
subtle gradient accents
soft shadows
rounded cards
generous spacing
restrained animation
```

Avoid a generic Bootstrap/dashboard appearance.

---

# 66. CSS variables

Use CSS custom properties.

Example:

```css
:root {
    --rt-bg: #090b10;
    --rt-surface: #111827;
    --rt-text: #f8fafc;
    --rt-muted: #94a3b8;
    --rt-accent: #7c3aed;

    --rt-radius-sm: 8px;
    --rt-radius-md: 16px;
    --rt-radius-lg: 24px;

    --rt-animation-fast: 280ms;
    --rt-animation-normal: 550ms;
    --rt-animation-slow: 900ms;
}
```

---

# 67. Custom stylesheets

Support:

```latex
\stylesheet{styles/custom.css}
```

Project configuration may also include:

```typescript
styles: [
    "./src/styles/presentation.css"
]
```

---

# 68. Custom JavaScript

Support an explicit escape hatch:

```latex
\script{scripts/demo.js}
```

Normal slide authoring should not require JavaScript.

---

# 69. Interactive custom components

Custom components may use arbitrary Vue/browser functionality.

Examples include:

```text
Vue transitions
GSAP
Motion libraries
D3
Three.js
WebGL
Canvas
SVG animation
audio
video
WebSockets
interactive controls
```

RevealTeX should place and configure these components without attempting to understand their internals.

Example:

```latex
\InteractiveFunctionPlot[
    expression={sin(x)},
    xmin=-6.28,
    xmax=6.28,
    animated=true
]
```

could invoke a fully interactive Vue component during the presentation.

---

# 70. Component fragment integration

Custom components should be usable inside fragments:

```latex
\fragment[fade-up]{

\MetricCard[
    value=94.7,
    label={Accuracy}
]

}
```

Likewise, component props may optionally expose fragment behavior:

```latex
\MetricCard[
    value=94.7,
    label={Accuracy},
    fragment=fade-up,
    fragment-index=3
]
```

The former should be the canonical generic mechanism.

---

# 71. Components and Auto-Animate

Registered components should optionally expose stable IDs:

```latex
\MetricCard[
    id=accuracy,
    value=91.2,
    label={Accuracy}
]
```

Later:

```latex
\MetricCard[
    id=accuracy,
    value=94.7,
    label={Accuracy}
]
```

If both slides are Auto-Animate slides, the Vue/reveal renderer should attempt to preserve the element identity.

---

# 72. Component animation hooks

Allow registered components to declare whether they support lifecycle hooks associated with slide state.

Potential hooks:

```text
onSlideEnter
onSlideLeave
onFragmentShow
onFragmentHide
onPresentationReady
```

These should be implemented through Vue/reveal integration rather than the core language.

For example, provide a composable:

```typescript
usePresentationLifecycle()
```

that custom Vue components can use.

---

# 73. Reveal context composable

Provide something like:

```typescript
const {
    deck,
    currentSlide,
    isCurrentSlide,
    fragmentState
} = useRevealContext();
```

This would allow custom components to react to presentation navigation.

---

# 74. Event bridge

The Vue runtime should expose reveal events through a controlled API.

Examples:

```text
ready
slidechanged
fragmentshown
fragmenthidden
overviewshown
overviewhidden
paused
resumed
```

Do not bind the compiler itself to these events.

---

# 75. Component plugin API

Allow packages to register collections of components.

Example:

```typescript
import chartsPlugin from "@revealtex/charts";

export default defineRevealTeXConfig({
    plugins: [
        chartsPlugin()
    ]
});
```

The plugin might register:

```text
LineChart
BarChart
ScatterPlot
Heatmap
```

Then source can simply use:

```latex
\LineChart[
    data={results.json},
    x=epoch,
    y=loss
]
```

---

# 76. Compiler plugins

Provide a plugin interface for more than visual components.

Potential plugin contributions:

```text
custom commands
custom environments
component registrations
layout registrations
IR transforms
renderer extensions
asset handlers
syntax validation
```

Conceptually:

```typescript
interface RevealTeXPlugin {
    name: string;

    commands?: CommandDefinition[];

    environments?: EnvironmentDefinition[];

    components?: ComponentDefinition[];

    layouts?: LayoutDefinition[];

    transformIR?(
        presentation: PresentationIR
    ): PresentationIR;
}
```

---

# 77. Custom language commands

Plugins should be able to create semantic commands.

Example:

```latex
\metric{94.7\%}
```

Plugin definition may translate it into:

```typescript
{
    type: "component",
    name: "MetricCard",
    props: {...}
}
```

This makes it possible to build domain-specific presentation syntax without modifying the compiler.

---

# 78. Unknown commands

If source contains:

```latex
\FooBar
```

the compiler should check:

```text
built-in commands
registered custom components
plugin commands
```

If unresolved, produce:

```text
slides/demo.rtex:42:1

Unknown command:
    \FooBar

Did you mean:
    \FooCard
```

---

# 79. Includes

Support:

```latex
\input{slides/intro.rtex}
\input{slides/method.rtex}
\input{slides/results.rtex}
```

Paths should resolve relative to the including file.

Circular includes must be detected.

---

# 80. Presentation project structure

Example:

```text
my-talk/
│
├── presentation.rtex
│
├── revealtex.config.ts
│
├── slides/
│   ├── intro.rtex
│   ├── theory.rtex
│   ├── demo.rtex
│   └── conclusion.rtex
│
├── src/
│   ├── components/
│   │   ├── MetricCard.vue
│   │   ├── NeuralNetwork.vue
│   │   ├── InteractivePlot.vue
│   │   └── ArchitectureDiagram.vue
│   │
│   ├── layouts/
│   │   ├── HeroSlide.vue
│   │   ├── TwoColumn.vue
│   │   └── BigNumber.vue
│   │
│   └── styles/
│       └── presentation.css
│
├── assets/
│   ├── images/
│   ├── video/
│   └── diagrams/
│
└── generated/
```

---

# 81. Project configuration

Use:

```text
revealtex.config.ts
```

Example:

```typescript
import { defineConfig } from "revealtex";

export default defineConfig({
    renderer: "vue",

    source: "./presentation.rtex",

    output: "./src/generated",

    reveal: {
        hash: true,
        controls: true,
        progress: true,
        slideNumber: true,
        transition: "slide",
        transitionSpeed: "fast"
    },

    theme: {
        name: "aurora",
        css: "./src/styles/presentation.css"
    },

    components: {
        MetricCard: {
            source: "@/components/MetricCard.vue",

            props: {
                value: {
                    type: "number",
                    required: true
                },

                label: {
                    type: "string",
                    required: true
                },

                trend: {
                    type: "number"
                }
            }
        },

        ArchitectureDiagram: {
            source: "@/components/ArchitectureDiagram.vue"
        },

        InteractivePlot: {
            source: "@/components/InteractivePlot.vue",
            portability: "vue-only"
        }
    },

    layouts: {
        Hero: {
            source: "@/layouts/HeroSlide.vue"
        },

        TwoColumn: {
            source: "@/layouts/TwoColumn.vue"
        }
    }
});
```

---

# 82. CLI

Provide:

```bash
revealtex build presentation.rtex
```

Default renderer:

```text
vue
```

Explicit:

```bash
revealtex build presentation.rtex --renderer vue
```

Output:

```bash
revealtex build presentation.rtex \
    --output src/generated
```

---

# 83. Development server

Provide:

```bash
revealtex dev presentation.rtex
```

This should:

1. watch `.rtex`,
2. watch included source files,
3. regenerate affected output,
4. run or integrate with Vite,
5. trigger hot module replacement.

The development workflow should feel immediate.

---

# 84. Watch mode

For existing Vue projects:

```bash
revealtex watch presentation.rtex \
    --output src/generated
```

No separate development server should be required if the project already runs Vite.

---

# 85. Compiler pipeline

The compiler should expose explicit phases:

```text
read files
   ↓
resolve includes
   ↓
tokenize
   ↓
parse
   ↓
build AST
   ↓
semantic validation
   ↓
component resolution
   ↓
normalize to Presentation IR
   ↓
renderer selection
   ↓
renderer-specific generation
   ↓
asset resolution
   ↓
output
```

Each phase should be testable independently.

---

# 86. Renderer API

Define:

```typescript
interface PresentationRenderer {
    readonly name: string;

    readonly capabilities: RendererCapabilities;

    render(
        presentation: PresentationIR,
        context: RenderContext
    ): Promise<RenderResult>;
}
```

Example capabilities:

```typescript
interface RendererCapabilities {
    fragments: boolean;
    transitions: boolean;
    autoAnimate: boolean;
    speakerNotes: boolean;
    customComponents: boolean;
    interactiveComponents: boolean;
    rawHtml: boolean;
    rendererSpecificBlocks: boolean;
}
```

---

# 87. Renderer registry

Support:

```typescript
registerRenderer("vue", VueRenderer);
```

Future:

```typescript
registerRenderer("html", HtmlRenderer);
registerRenderer("react", ReactRenderer);
registerRenderer("svelte", SvelteRenderer);
```

---

# 88. Future raw HTML renderer

The same IR:

```typescript
{
    type: "fragment",
    effect: "fade-left",
    children: [...]
}
```

should render in Vue as:

```vue
<RevealFragment effect="fade-left">
    ...
</RevealFragment>
```

and HTML as:

```html
<div class="fragment fade-left">
    ...
</div>
```

The parser must not change.

---

# 89. Future custom component HTML renderers

A custom component may optionally provide alternate renderers.

Example:

```typescript
MetricCard: {
    vue: "@/components/MetricCard.vue",

    html: {
        renderer: "./renderers/metric-card.ts"
    }
}
```

This allows portable custom components.

Without an alternate renderer, a Vue-only component should produce a useful warning or error.

---

# 90. Raw renderer fallback

For simple components, optionally provide semantic fallback markup.

Example:

```typescript
MetricCard: {
    semanticFallback: {
        tag: "article",
        class: "metric-card"
    }
}
```

This is optional and should not be required.

---

# 91. Diagnostics

Errors should be clear.

Bad:

```text
TypeError at Parser.consumeToken...
```

Good:

```text
slides/results.rtex:31:9

Unknown property "valeu" on component "MetricCard".

Did you mean:
    value
```

Another:

```text
slides/network.rtex:72:1

Unclosed environment:

    \begin{columns}

Expected:

    \end{columns}
```

---

# 92. Warning levels

Support:

```text
error
warning
info
```

Potential warning:

```text
Component "InteractivePlot" is Vue-only.

The current renderer is:
    html
```

---

# 93. Generated-file headers

Generated files should include:

```text
// AUTO-GENERATED BY REVEALTEX.
// DO NOT EDIT.
//
// Source:
// presentation.rtex
```

Users should edit `.rtex`, not generated files.

---

# 94. Asset handling

Resolve:

```text
images
SVG
video
audio
data files
CSS
JS
component assets
```

Paths should remain predictable.

Support Vite-native asset imports where appropriate.

---

# 95. SVG

Support:

```latex
\svg{assets/architecture.svg}
```

Options:

```latex
\svg[
    width=80%,
    id=architecture
]{assets/architecture.svg}
```

Later, inline SVG could support more sophisticated animations.

---

# 96. Mermaid

Optional plugin:

```latex
\begin{mermaid}

graph LR
A --> B
B --> C

\end{mermaid}
```

Do not place Mermaid inside the compiler core.

Implement it as a plugin/component.

---

# 97. Charts

Charts should preferably be implemented as custom components/plugins rather than core language features.

Example:

```latex
\LineChart[
    source={data/loss.csv},
    x=epoch,
    y=loss,
    animated=true
]
```

This demonstrates why the component system is central.

---

# 98. Data loading

Custom components may need data assets.

Support typed asset props:

```typescript
data: {
    type: "asset"
}
```

Source:

```latex
\LineChart[
    data={data/results.json}
]
```

The Vue renderer can generate an import or URL according to configuration.

---

# 99. Portable versus renderer-specific source

Portable:

```latex
\begin{frame}{Results}

\MetricCard[
    value=94.7,
    label={Accuracy}
]

\fragment[fade-up]{
Best result so far.
}

\end{frame}
```

Renderer-specific:

```latex
\begin{vue}

<ThreeScene :model="model" />

\end{vue}
```

This distinction must remain clear.

---

# 100. Absolute positioning

Support:

```latex
\place[
    left=12%,
    top=20%,
    width=40%
]{
    ...
}
```

Or:

```latex
\position[
    x=12,
    y=20,
    width=40
]{
    ...
}
```

Represent positioning generically in IR.

---

# 101. Visual containers

Built-in generic visual components may include:

```latex
\card{
    ...
}
```

```latex
\callout[info]{
    ...
}
```

```latex
\badge{Experimental}
```

They should themselves be implemented through the same component system where practical.

This prevents the compiler core from becoming tied to a particular theme.

---

# 102. Vertical slides

Support reveal.js-style nested slides.

Possible syntax:

```latex
\begin{section}{Machine Learning}

\begin{frame}{Overview}
...
\end{frame}

\begin{subframe}{Details}
...
\end{subframe}

\begin{subframe}{More Details}
...
\end{subframe}

\end{section}
```

The semantic model should represent navigation hierarchy.

---

# 103. Sections

Support:

```latex
\section{Results}
```

Optionally generate section-divider slides.

Configuration:

```typescript
sections: {
    autoDividerSlides: true
}
```

---

# 104. Presentation options

Support:

```latex
\slidenumbers{true}
\progressbar{true}
\controls{true}
```

Prefer project configuration for advanced reveal.js settings.

---

# 105. Reveal passthrough configuration

Allow advanced configuration:

```typescript
reveal: {
    hash: true,
    controls: true,
    progress: true,
    center: true,
    transition: "slide"
}
```

Do not force every reveal.js feature to receive its own `.rtex` command.

---

# 106. Theme versus layout versus component

Maintain these distinctions.

## Theme

Controls:

```text
colors
fonts
spacing
shadows
radii
animation defaults
```

## Layout

Controls:

```text
slide composition
regions
alignment
content arrangement
```

## Component

Controls:

```text
specific reusable content/functionality
```

Example:

```text
Aurora
    = theme

HeroSplit
    = layout

MetricCard
    = component
```

---

# 107. Custom component example

User Vue component:

```vue
<script setup lang="ts">
defineProps<{
    value: number
    label: string
    suffix?: string
    trend?: number
}>()
</script>

<template>
    <div class="metric-card">
        <div class="metric-card__value">
            {{ value }}{{ suffix }}
        </div>

        <div class="metric-card__label">
            {{ label }}
        </div>

        <div
            v-if="trend !== undefined"
            class="metric-card__trend"
        >
            {{ trend > 0 ? '+' : '' }}{{ trend }}%
        </div>
    </div>
</template>
```

Registration:

```typescript
MetricCard: {
    source: "@/components/MetricCard.vue",

    props: {
        value: {
            type: "number",
            required: true
        },

        label: {
            type: "string",
            required: true
        },

        suffix: {
            type: "string"
        },

        trend: {
            type: "number"
        }
    }
}
```

Presentation:

```latex
\MetricCard[
    value=94.7,
    suffix={\%},
    label={Validation Accuracy},
    trend=3.1
]
```

Generated Vue:

```vue
<MetricCard
    :value="94.7"
    suffix="%"
    label="Validation Accuracy"
    :trend="3.1"
/>
```

This complete workflow must work.

---

# 108. Custom component with slots example

Vue component:

```vue
<template>
    <section class="demo-card">
        <header>
            <slot name="title" />
        </header>

        <main>
            <slot />
        </main>

        <footer>
            <slot name="footer" />
        </footer>
    </section>
</template>
```

Source:

```latex
\begin{DemoCard}

\slot{title}{
Model Architecture
}

\ArchitectureDiagram[
    animated=true
]

\slot{footer}{
12 transformer layers
}

\end{DemoCard}
```

Generated Vue:

```vue
<DemoCard>
    <template #title>
        Model Architecture
    </template>

    <ArchitectureDiagram :animated="true" />

    <template #footer>
        12 transformer layers
    </template>
</DemoCard>
```

---

# 109. Custom component nesting

Components must be nestable.

Example:

```latex
\begin{GlassPanel}

\begin{StatGrid}

\MetricCard[
    value=94.7,
    label={Accuracy}
]

\MetricCard[
    value=12.8,
    label={Latency}
]

\end{StatGrid}

\end{GlassPanel}
```

Nested components should simply produce nested IR nodes.

---

# 110. Custom components inside layouts

Example:

```latex
\begin{frame}[layout=TwoColumn]{Results}

\slot{left}{

\MetricCard[
    value=94.7,
    label={Accuracy}
]

}

\slot{right}{

\InteractivePlot[
    data={results.json}
]

}

\end{frame}
```

This is a core use case.

---

# 111. Template packs

Allow reusable presentation libraries.

Example package:

```text
@company/revealtex-template
```

could register:

```text
themes
layouts
components
animations
plugins
```

Config:

```typescript
import companyTemplate
    from "@company/revealtex-template";

export default defineConfig({
    presets: [
        companyTemplate()
    ]
});
```

---

# 112. Design system support

A template package should be able to supply:

```text
CompanyLogo
ExecutiveSummary
MetricCard
QuoteSlide
Timeline
ProductDemo
SectionDivider
```

Then a deck can remain concise.

Example:

```latex
\ExecutiveSummary[
    headline={Revenue grew 31\%},
    status=positive
]
```

---

# 113. Live reload

When the author changes:

```latex
\MetricCard[
    value=94.7
]
```

to:

```latex
\MetricCard[
    value=96.1
]
```

the presentation should update rapidly through Vite HMR.

Changes to the underlying Vue component should also update normally through Vite.

---

# 114. Incremental compilation

Initially, recompiling the deck is acceptable.

Later optimize using:

```text
source dependency graph
slide hashes
component usage graph
```

Stable IR node IDs should make incremental output easier.

---

# 115. Testing strategy

Unit tests should cover:

```text
lexer
nested braces
parser environments
component resolution
typed props
slot parsing
frame options
fragment order
math
includes
diagnostics
```

Renderer tests should cover:

```text
Vue imports
custom components
component props
slots
fragments
layouts
Auto-Animate IDs
speaker notes
transitions
```

---

# 116. Component tests

At minimum test:

```latex
\MetricCard[
    value=42,
    label={Users}
]
```

Nested:

```latex
\begin{Card}
\MetricCard[value=42,label={Users}]
\end{Card}
```

Slots:

```latex
\begin{FeatureCard}

\slot{title}{
Fast
}

Body

\end{FeatureCard}
```

Invalid prop:

```latex
\MetricCard[
    value={hello}
]
```

Unknown component:

```latex
\NonexistentComponent
```

---

# 117. HTML backend proof of concept

Implement at least a minimal HTML renderer test demonstrating that this IR:

```typescript
FragmentIR
```

does not contain Vue concepts.

For example, compile a simple deck to both:

```text
Vue
raw reveal.js HTML
```

The HTML renderer does not need feature parity initially.

Its purpose is to prove the architecture.

---

# 118. Documentation

Documentation must contain:

```text
Installation
Quick Start
Language Syntax
Frames
Fragments
Transitions
Auto-Animate
Math
Columns
Images
Code
Speaker Notes
Themes
Layouts
Custom Components
Component Props
Component Slots
Vue-Specific Components
Plugins
Configuration
CLI
Renderer Architecture
Creating a Renderer
Creating a Theme
Creating a Layout
Creating a Component Package
```

---

# 119. Custom component documentation

This should be one of the largest documentation sections.

Show:

1. creating a `.vue` component,
2. registering it,
3. declaring prop schema,
4. using it in `.rtex`,
5. using slots,
6. nesting components,
7. using reveal lifecycle events,
8. making it Vue-only,
9. giving it an HTML fallback,
10. packaging component libraries.

---

# 120. Example showcase

Create:

```text
examples/showcase/
```

The deck should demonstrate:

* title page,
* push/slide transition,
* fade transition,
* zoom transition,
* fragments,
* custom fragment effects,
* lists,
* math,
* derivation,
* columns,
* images,
* video,
* code,
* Auto-Animate,
* layouts,
* custom Vue components,
* slots,
* interactive components,
* speaker notes,
* section dividers,
* background images,
* gradient backgrounds,
* animated backgrounds,
* final slide.

Do not create a boring technical test deck.

Make it feel like a polished conference keynote.

---

# 121. Custom component showcase

Include at least these example components:

```text
MetricCard.vue
AnimatedCounter.vue
ArchitectureDiagram.vue
InteractiveFunctionPlot.vue
Timeline.vue
CodeDemo.vue
```

Demonstrate them from `.rtex`.

Example:

```latex
\begin{frame}{Results}

\begin{columns}

\column{0.33}

\MetricCard[
    value=94.7,
    suffix={\%},
    label={Accuracy}
]

\column{0.33}

\MetricCard[
    value=12.4,
    suffix={ms},
    label={Latency}
]

\column{0.33}

\MetricCard[
    value=2.1,
    suffix={GB},
    label={Memory}
]

\end{columns}

\end{frame}
```

---

# 122. Auto-Animate showcase

Example:

```latex
\begin{frame}[autoanimate]{Architecture}

\ArchitectureNode[
    id=input,
    label={Input}
]

\end{frame}

\begin{frame}[autoanimate]{Architecture}

\ArchitectureNode[
    id=input,
    label={Input}
]

\ArchitectureNode[
    id=encoder,
    label={Encoder}
]

\end{frame}

\begin{frame}[autoanimate]{Architecture}

\ArchitectureNode[
    id=input,
    label={Input}
]

\ArchitectureNode[
    id=encoder,
    label={Encoder}
]

\ArchitectureNode[
    id=output,
    label={Output}
]

\end{frame}
```

Matching IDs should animate naturally between states.

---

# 123. Full example authoring experience

A polished final deck should be writable like this:

```latex
\documentclass{reveal}

\title{Neural Networks}
\subtitle{From Linear Models to Deep Learning}
\author{Example Author}

\theme{aurora}
\transition{slide}
\transitionspeed{fast}

\begin{document}

\maketitle


\section{Introduction}


\begin{frame}{Why Neural Networks?}

\begin{itemize}

\item<1->
Flexible function approximators

\item<2->
Learn representations automatically

\item<3->
Scale extremely well

\end{itemize}

\end{frame}


\begin{frame}[layout=HeroSplit]{A Single Neuron}

\slot{left}{

\[
y = \sigma(w^T x+b)
\]

\fragment[fade-up]{
A neuron combines a linear transformation
with a nonlinear activation.
}

}

\slot{right}{

\NeuronDiagram[
    animated=true
]

}

\end{frame}


\begin{frame}{Performance}

\begin{columns}[gap=2rem]

\column{0.33}

\MetricCard[
    value=94.7,
    suffix={\%},
    label={Accuracy},
    trend=3.1
]

\column{0.33}

\MetricCard[
    value=12.4,
    suffix={ms},
    label={Latency},
    trend=-18.2
]

\column{0.33}

\MetricCard[
    value=2.1,
    suffix={GB},
    label={Memory}
]

\end{columns}

\end{frame}


\begin{frame}[autoanimate]{Architecture}

\ArchitectureDiagram[
    id=model,
    stage=input
]

\end{frame}


\begin{frame}[autoanimate]{Architecture}

\ArchitectureDiagram[
    id=model,
    stage=encoder
]

\end{frame}


\begin{frame}[autoanimate]{Architecture}

\ArchitectureDiagram[
    id=model,
    stage=complete
]

\end{frame}


\begin{frame}{Training}

\[
\theta_{t+1}
=
\theta_t
-
\eta \nabla_\theta L
\]

\fragment[fade-up]{
Gradient descent updates model parameters.
}

\end{frame}


\begin{frame}{Interactive Demo}

\InteractiveFunctionPlot[
    expression={sin(x)},
    xmin=-6.28,
    xmax=6.28
]

\end{frame}


\begin{frame}[center,transition=zoom]{Thank You}

\Huge{
Questions?
}

\end{frame}

\end{document}
```

---

# 124. Implementation phases

## Phase 1 — compiler foundation

Implement:

```text
lexer
parser
AST
source locations
semantic analysis
Presentation IR
frames
text
lists
math
fragments
transitions
Vue renderer
reveal runtime
CLI
```

## Phase 2 — custom components

Implement:

```text
component registry
component shorthand commands
typed props
component children
slots
automatic imports
layouts
configuration file
component diagnostics
```

Custom components are not optional polish.

They are a core Phase 2 milestone and should be completed before advanced visual effects.

## Phase 3 — presentation features

Implement:

```text
images
video
code
speaker notes
backgrounds
Auto-Animate
IDs
sections
vertical slides
```

## Phase 4 — developer experience

Implement:

```text
Vite integration
watch mode
HMR
asset pipeline
template packs
plugin API
```

## Phase 5 — extensibility

Implement:

```text
HTML renderer proof of concept
renderer plugins
component fallback renderers
component packages
advanced animations
Mermaid
SVG helpers
```

---

# 125. Acceptance criteria

The first serious release is considered successful when all of the following work.

A user can create:

```text
presentation.rtex
```

and run:

```bash
revealtex dev presentation.rtex
```

and see a reveal.js presentation in the browser.

The presentation can contain:

```latex
\begin{frame}
```

and:

```latex
\fragment
```

and:

```latex
\[
...
\]
```

and use a custom Vue component:

```latex
\MetricCard[
    value=94.7,
    label={Accuracy}
]
```

registered in:

```text
revealtex.config.ts
```

The compiler:

* validates its props,
* imports the Vue component automatically,
* places it into generated Vue output,
* preserves fragments and slide transitions,
* integrates with reveal.js,
* hot reloads when source changes.

The parser and IR must remain unchanged when a future HTML renderer is added.

---

# 126. Most important architectural rule

Never make the parser understand Vue.

Never make the core Presentation IR contain Vue concepts.

The source language describes presentation semantics.

For example:

```latex
\MetricCard[
    value=94.7,
    label={Accuracy}
]
```

should become:

```typescript
ComponentIR {
    name: "MetricCard",

    props: {
        value: 94.7,
        label: "Accuracy"
    }
}
```

Only the Vue renderer decides that this becomes:

```vue
<MetricCard
    :value="94.7"
    label="Accuracy"
/>
```

That separation is what makes future output targets possible.

---

# 127. Most important custom-component rule

Do not require custom components to be implemented inside RevealTeX itself.

A user must be able to create:

```text
MyCrazyInteractiveDemo.vue
```

register it once, and then use:

```latex
\MyCrazyInteractiveDemo[
    model={transformer},
    animated=true
]
```

inside any presentation.

That component should be free to contain anything Vue and the browser support:

```text
complex animations
interactive controls
Three.js
WebGL
Canvas
SVG
D3
GSAP
video
audio
network visualizations
custom simulations
```

RevealTeX's responsibility is to:

```text
parse the invocation
validate the props
resolve the component
generate the import
insert it into the slide
connect it to presentation context if requested
```

It should not attempt to understand or rewrite the component internals.

---

# 128. Final design principle

The project should ultimately feel like this:

```text
                    AUTHOR

                       │

                       ▼

              elegant .rtex source

                       │

                       ▼

                 RevealTeX compiler

                       │

                       ▼

           framework-independent IR

                       │
              ┌────────┴────────┐
              │                 │
              ▼                 ▼
            Vue               HTML
           today              later
              │                 │
              └────────┬────────┘
                       │
                       ▼

                  reveal.js

                       │

                       ▼

                    Browser
```

And the customization model should be:

```text
.rtex
    =
presentation content

Vue layouts
    =
slide composition

Vue components
    =
custom visual and interactive elements

CSS theme
    =
visual identity

reveal.js
    =
navigation and presentation behavior
```

The user should be able to build an entire reusable presentation ecosystem around their own Vue components without modifying the compiler.

That is the central requirement of RevealTeX.
