import { compile } from "@revealtex/compiler";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { HtmlRenderer } from "../src/index.js";

describe("HTML renderer proof", () => {
  it("renders framework-neutral layout, math, code, animation, options, and semantic component fallbacks", async () => {
    const config = {
      reveal: { hash: true },
      components: {
        RenderedCard: { source: "@/RenderedCard.vue", html: { renderer: fileURLToPath(new URL("./fixtures/card-renderer.ts", import.meta.url)) }, props: { label: { type: "string" as const }, icon: { type: "asset" as const } } },
        SemanticCard: { source: "@/SemanticCard.vue", semanticFallback: { tag: "article", class: "metric-card" } },
        VueWidget: { source: "@/VueWidget.vue", portability: "vue-only" as const }
      }
    };
    const sourceFile = fileURLToPath(new URL("./fixtures/deck.rtex", import.meta.url));
    const { presentation } = compile(String.raw`\newcommand{\R}{\mathbb{R}}
\description{Portable deck}\controls{false}
\begin{document}\begin{frame}{Hello}
\fragment[index=3,effect=fade-left]{World}
\[x \in \R\]
\animate[effect=pop,duration=700ms,delay=100ms,easing=ease-out]{Timed}
\begin{columns}[gap=2rem,align=center]\column{1}Column\end{columns}
\begin{code}[language=ts,numbers=true,highlight={2}]
one
two
\end{code}
\image[alt={Diagram},caption={A model},width=70%]{asset.svg}
\element[id=model]{Stable}
\callout[info]{Portable callout}\position[x=12,y=20,width=40]{Placed}
\RenderedCard[label={Fast & safe},icon={asset.svg}]\SemanticCard[value=42]\VueWidget[]\note{Explain this.}
\end{frame}\end{document}`, { config, file: sourceFile });
    const result = await new HtmlRenderer().render(presentation, { sourceFile: "x", outputDirectory: "out", config });
    const html = result.files[0]?.content;

    expect(html).toContain('class="fragment fade-left" data-fragment-index="3"');
    expect(html).toContain('mathvariant="double-struck"');
    expect(html).toContain('class="rt-code"');
    expect(html).toContain('data-line-numbers="2"');
    expect(html).toContain('class="language-ts"');
    expect(html).toContain("plugin/highlight/highlight.esm.js");
    expect(html).toContain('data-id="model"');
    expect(html).toContain('class="rt-callout rt-callout--info"');
    expect(html).toContain('style="position:absolute;left:12%;top:20%;width:40%"');
    expect(html).toContain('style="--rt-duration:700ms;--rt-delay:100ms;--rt-easing:ease-out"');
    expect(html).toContain('style="gap:2rem;align-items:center"');
    expect(html).toContain("<figcaption>A model</figcaption>");
    expect(html).toContain('alt="Diagram"');
    expect(html).toContain('<article class="rt-component rt-SemanticCard metric-card"');
    expect(html).toContain('<article class="custom-card"><img src="assets/');
    expect(html).toContain('Fast &amp; safe</article>');
    expect(html).toContain('<meta name="description" content="Portable deck">');
    expect(html).toContain('<link rel="icon" href="data:,">');
    expect(html).toContain("reveal.js@5.2.1");
    expect(html).toContain("katex@0.16.47");
    expect(html).toContain('"hash":true');
    expect(html).toContain('"controls":false');
    expect(html).toContain('"plugins":[RevealNotes, RevealHighlight, RevealSearch, RevealZoom]');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.message).toContain("Vue-only");
    const packaged = result.files.find(file => file.path.endsWith("-asset.svg"));
    expect(packaged?.path).toMatch(/^assets\/[a-f0-9]{16}-asset\.svg$/);
    expect(packaged?.content).toBeInstanceOf(Uint8Array);
    expect(result.dependencies).toContain(fileURLToPath(new URL("./fixtures/asset.svg", import.meta.url)));
  });

  it("discovers assets from the final IR across backgrounds, titles, notes, slots, and typed component props", async () => {
    const sourceFile = fileURLToPath(new URL("./fixtures/nested-deck.rtex", import.meta.url));
    const config = {
      components: {
        RenderedCard: {
          html: { renderer: fileURLToPath(new URL("./fixtures/card-renderer.ts", import.meta.url)) },
          props: { label: { type: "string" as const }, icon: { type: "asset" as const } }
        },
        SlotCard: { semanticFallback: { tag: "article" } }
      }
    };
    const { presentation } = compile(String.raw`\begin{document}
\begin{frame}[background-image={asset.svg}]{\image{./asset.svg}}
\begin{SlotCard}\slot{visual}{\image{./sub/../asset.svg}}\end{SlotCard}
\RenderedCard[label={Typed},icon={nested/../asset.svg}]
\note{\image{sub/../asset.svg}}
\end{frame}
\end{document}`, { config, file: sourceFile });

    // Renderer packaging must reflect the final IR rather than relying on the
    // semantic asset manifest, which transforms are allowed to supersede.
    presentation.assets.length = 0;
    const result = await new HtmlRenderer().render(presentation, { sourceFile, outputDirectory: "out", config });
    const packaged = result.files.find(file => file.path.endsWith("-asset.svg"));
    const html = String(result.files[0]?.content);

    expect(packaged?.path).toMatch(/^assets\/[a-f0-9]{16}-asset\.svg$/);
    expect(html.split(packaged!.path).length - 1).toBe(5);
    expect(html).toContain(`data-background-image="${packaged!.path}"`);
    expect(html).toContain(`<h2><figure><img src="${packaged!.path}"`);
    expect(html).toContain(`<aside class="notes"><figure><img src="${packaged!.path}"`);
    expect(html).toContain(`<article class="custom-card"><img src="${packaged!.path}"`);
    expect(result.dependencies).toEqual([fileURLToPath(new URL("./fixtures/asset.svg", import.meta.url))]);
  });

  it("uses content hashes so an asset path is stable when candidate ordering changes", async () => {
    const sourceFile = fileURLToPath(new URL("./fixtures/deck.rtex", import.meta.url));
    const render = async (source: string) => {
      const { presentation } = compile(source, { file: sourceFile });
      return new HtmlRenderer().render(presentation, { sourceFile, outputDirectory: "out", config: {} });
    };
    const baseline = await render(String.raw`\begin{document}\begin{frame}{A}\image{asset.svg}\end{frame}\end{document}`);
    const shifted = await render(String.raw`\script{card-renderer.ts}\begin{document}\begin{frame}{A}\image{asset.svg}\end{frame}\end{document}`);
    const baselineAsset = baseline.files.find(file => file.path.endsWith("-asset.svg"));
    const shiftedAsset = shifted.files.find(file => file.path.endsWith("-asset.svg"));

    expect(baselineAsset?.path).toBe(shiftedAsset?.path);
    expect(baselineAsset?.path).toMatch(/^assets\/[a-f0-9]{16}-asset\.svg$/);
  });

  it("preserves protocol-relative URLs without treating them as local dependencies", async () => {
    const sourceFile = fileURLToPath(new URL("./fixtures/deck.rtex", import.meta.url));
    const { presentation } = compile(String.raw`\begin{document}\begin{frame}{Remote}\image{//cdn.example.test/diagram.svg}\end{frame}\end{document}`, { file: sourceFile });
    const result = await new HtmlRenderer().render(presentation, { sourceFile, outputDirectory: "out", config: {} });

    expect(String(result.files[0]?.content)).toContain('src="//cdn.example.test/diagram.svg"');
    expect(result.files).toHaveLength(1);
    expect(result.dependencies).toEqual([]);
    expect(result.diagnostics.some(diagnostic => diagnostic.code === "RTX4004")).toBe(false);
  });
});
