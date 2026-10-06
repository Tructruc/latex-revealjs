import { describe, expect, it } from "vitest";
import { compile } from "@revealtex/compiler";
import { HtmlRenderer } from "../src/index.js";

async function render(source: string, config = {}) {
  const { presentation } = compile(source, { file: "/talk/deck.rtex", config });
  const result = await new HtmlRenderer().render(presentation, { sourceFile: "/talk/deck.rtex", outputDirectory: "/tmp/out", config });
  return result.files.find(file => file.path === "index.html")?.content ?? "";
}

describe("HTML renderer reveal features", () => {
  it("links built-in themes and emits passthrough attributes and utility classes", async () => {
    const html = await render(String.raw`\theme{dracula}\begin{document}\begin{frame}[state=intro,class=wide,background-size=cover,background-opacity=0.4]{X}\fittext{Big}\end{frame}\end{document}`);
    expect(html).toContain("reveal.js@5.2.1/dist/theme/dracula.css");
    expect(html).toContain('data-state="intro"');
    expect(html).toContain('class="wide"');
    expect(html).toContain('data-background-size="cover"');
    expect(html).toContain('data-background-opacity="0.4"');
    expect(html).toContain('class="r-fit-text"');
  });

  it("renders overlay ranges and list overlays", async () => {
    const html = await render(String.raw`\begin{document}\begin{frame}{X}\only<2->{Two}\visible<1-2>{Early}\begin{itemize}\item<2-> Later\end{itemize}\end{frame}\end{document}`);
    expect(html).toContain('class="fragment rt-only"');
    expect(html).toContain('data-fragment-index="1"');
    expect(html).toContain('data-rt-overlay-start="1"');
    expect(html).toContain('data-rt-overlay-end="2"');
    expect(html).toContain('class="rt-overlay fragment"');
  });

  it("renders textcolor and verbatim code", async () => {
    const html = await render(String.raw`\begin{document}\begin{frame}{V}\begin{verbatim}
x = 1
\end{verbatim}\textcolor{red}{hot}\end{frame}\end{document}`);
    expect(html).toContain('class="rt-textcolor" style="color:red"');
    expect(html).toContain('<pre class="rt-code">');
  });

  it("renders beamer blocks with titles", async () => {
    const html = await render(String.raw`\begin{document}\begin{frame}{B}\begin{block}{Idea}Body\end{block}\end{frame}\end{document}`);
    expect(html).toContain('class="rt-block"');
    expect(html).toContain('<div class="rt-container__title">Idea</div>');
  });

  it("renders tables and links", async () => {
    const html = await render(String.raw`\begin{document}\begin{frame}{T}\begin{table}[header=true,caption={Scores}]Name & Score \\ Ada & 42 \\ \end{table}\url{https://example.com}\end{frame}\end{document}`);
    expect(html).toContain('<table class="rt-table">');
    expect(html).toContain("<caption>Scores</caption>");
    expect(html).toContain("<th>Name</th>");
    expect(html).toContain('<a href="https://example.com"');
  });

  it("renders mermaid diagrams with the CDN runtime", async () => {
    const html = await render(String.raw`\begin{document}\begin{frame}{D}\begin{mermaid}graph LR
  A --> B
\end{mermaid}\end{frame}\end{document}`);
    expect(html).toContain('class="mermaid rt-diagram"');
    expect(html).toContain("mermaid@11");
    expect(html).toContain("A --&gt; B");
  });

  it("renders amsmath environments and inline syncs overlays", async () => {
    const html = await render(String.raw`\begin{document}\begin{frame}{M}\begin{align}a&=b\\c&=d\end{align}\end{frame}\end{document}`);
    expect(html).toContain("syncOverlays");
    expect(html).toContain("begin{align}");
    expect(html).toContain("rt-overlay-hidden");
  });
});
