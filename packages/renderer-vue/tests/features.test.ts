import { describe, expect, it } from "vitest";
import { compile } from "@revealtex/compiler";
import { compileTemplate, parse } from "@vue/compiler-sfc";
import { renderVue } from "../src/index.js";

function generate(source: string, config = {}) {
  const { presentation } = compile(source, { file: "/talk/deck.rtex", config });
  return renderVue(presentation, config, "/talk/deck.rtex");
}

describe("Vue renderer reveal features", () => {
  it("emits theme imports, passthrough attributes, backgrounds, overlays, and utility classes", () => {
    const vue = generate(String.raw`\theme{dracula}\begin{document}\begin{frame}[state=intro,class=wide,background-video=bg.mp4,background-size=cover]{X}\only<2->{Two}\visible<1-2>{Early}\fittext{Big}\end{frame}\end{document}`);
    expect(vue).toContain('import "reveal.js/dist/theme/dracula.css"');
    expect(vue).toContain('data-state="intro"');
    expect(vue).toContain('class="wide"');
    expect(vue).toContain('data-background-size="cover"');
    expect(vue).toContain(":data-background-video=\"rtAsset0\"");
    expect(vue).toContain('import rtAsset0 from "/talk/bg.mp4"');
    expect(vue).toContain('class="r-fit-text"');
    expect(vue).toContain('data-rt-overlay-start="2"');
    expect(vue).toContain('data-rt-overlay-end="2"');
  });

  it("keeps auto fragments managed while rendering overlay wrappers as plain containers", () => {
    const vue = generate(String.raw`\begin{document}\begin{frame}{X}\fragment[fade-up]{Auto}\only<1-2>{Range}\alt<2>{Before}{After}\end{frame}\end{document}`);
    expect(vue).toContain('<RevealFragment effect="fade-up">');
    expect(vue).toContain('<div class="rt-overlay rt-only" data-rt-overlay-start="1" data-rt-overlay-end="2">');
    expect(vue).toContain('data-rt-overlay-end="1"');
    expect(vue).toContain(":index='1'");
  });

  it("emits mermaid diagrams and vertical stack transitions", () => {
    const vue = generate(String.raw`\begin{document}\begin{section}[transition=convex,transition-speed=fast]{S}\begin{frame}{D}\begin{mermaid}graph LR
  A --> B
\end{mermaid}\end{frame}\end{section}\end{document}`);
    expect(vue).toContain('<Mermaid kind="mermaid"');
    expect(vue).toContain(", Mermaid }");
    expect(vue).toContain('class="rt-slide-stack" data-transition="convex" data-transition-speed="fast"');
  });

  it("maps t/b frame options to vertical alignment classes", () => {
    const vue = generate(String.raw`\begin{document}\begin{frame}[t]{T}Top\end{frame}\begin{frame}[b]{B}Bottom\end{frame}\end{document}`);
    expect(vue).toContain('class="rt-top"');
    expect(vue).toContain('class="rt-bottom"');
  });

  it("renders footnotes", () => {
    const vue = generate(String.raw`\begin{document}\begin{frame}{F}Text\footnote{Note text}\end{frame}\end{document}`);
    expect(vue).toContain('class="rt-footnote-ref"');
    expect(vue).toContain('class="rt-footnotes"');
    expect(vue).toContain("Note text");
  });

  it("renders markdown via v-html", () => {
    const vue = generate(String.raw`\begin{document}\begin{frame}{M}\begin{markdown}
# Hello

Some **bold** text.
\end{markdown}\end{frame}\end{document}`);
    expect(vue).toContain('class="rt-markdown" v-html="rtMarkdown0"');
    expect(vue).toContain("const rtMarkdown0 =");
    expect(vue).toContain(">Hello</h1>");
    expect(vue).toContain("<strong>bold</strong>");
  });

  it("renders textcolor and verbatim code", () => {
    const vue = generate(String.raw`\begin{document}\begin{frame}{V}\begin{verbatim}
x = 1
\end{verbatim}\textcolor{red}{hot}\end{frame}\end{document}`);
    expect(vue).toContain('class="rt-textcolor" style="color:red"');
    expect(vue).toContain('<RevealCode :code=');
  });

  it("renders frame subtitles and a table of contents", () => {
    const vue = generate(String.raw`\title{Deck}\begin{document}\maketitle\tableofcontents\section{One}\begin{frame}{Alpha}\framesubtitle{Sub}A\end{frame}\end{document}`);
    expect(vue).toContain('<h3 class="rt-frame-subtitle">Sub</h3>');
    expect(vue).toContain('id="table-of-contents"');
    expect(vue).toContain('href="#/slide-');
  });

  it("renders alignment and quote environments", () => {
    const vue = generate(String.raw`\begin{document}\begin{frame}{A}\begin{center}Mid\end{center}\begin{quote}Words\end{quote}\end{frame}\end{document}`);
    expect(vue).toContain('class="rt-align-center"');
    expect(vue).toContain("<blockquote class=\"rt-quote\">");
  });

  it("renders beamer blocks with titles", () => {
    const vue = generate(String.raw`\begin{document}\begin{frame}{B}\begin{block}{Idea}Body\end{block}\end{frame}\end{document}`);
    expect(vue).toContain('class="rt-block"');
    expect(vue).toContain('<div class="rt-container__title">Idea</div>');
  });

  it("renders tables and links", () => {
    const vue = generate(String.raw`\begin{document}\begin{frame}{T}\begin{table}[header=true]Name & Score \\ Ada & 42 \\ \end{table}\href{https://revealjs.com}{Reveal}\end{frame}\end{document}`);
    expect(vue).toContain('<table class="rt-table">');
    expect(vue).toContain("<th>Name</th>");
    expect(vue).toContain("<td>Ada</td>");
    expect(vue).toContain('href="https://revealjs.com"');
    expect(vue).toContain(">Reveal</a>");
  });

  it("renders display math environments and reveal layout classes without template errors", () => {
    const config = { components: {} };
    const { presentation } = compile(String.raw`\begin{document}\begin{frame}{M}\begin{align}a&=b\\c&=d\end{align}\hstack{L}\vstack{R}\end{frame}\end{document}`, { file: "/talk/deck.rtex", config });
    const vue = renderVue(presentation, config, "/talk/deck.rtex");
    expect(vue).toContain("begin{align}");
    expect(vue).toContain('class="r-hstack"');
    expect(vue).toContain('class="r-vstack"');
    const { descriptor } = parse(vue);
    const errors = compileTemplate({ source: descriptor.template!.content, id: "test", filename: "Presentation.generated.vue" }).errors;
    expect(errors).toEqual([]);
  });
});
