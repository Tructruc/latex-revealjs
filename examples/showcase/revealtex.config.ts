import { defineConfig } from "revealtex";
export default defineConfig({
  renderer: "vue", output: "./generated", reveal: { hash: true, controls: true, progress: true },
  sections: { autoDividerSlides: true },
  plugins: [{
    name: "showcase-language",
    commands: {
      ShowcaseCounter: { component: "AnimatedCounter", props: ({ argument }) => ({ value: Number(argument), suffix: "%" }) }
    }
  }],
  components: {
    MetricCard: { source: "./src/components/MetricCard.vue", html: { renderer: "./src/renderers/metric-card-html.ts" }, portability: "portable", props: { value: { type: "number", required: true }, label: { type: "string", required: true }, suffix: { type: "string", default: "" }, trend: { type: "number" } } },
    AnimatedCounter: { source: "./src/components/AnimatedCounter.vue" },
    ArchitectureDiagram: { source: "./src/components/ArchitectureDiagram.vue", props: { layers: { type: "number" }, animated: { type: "boolean" }, mode: { type: "enum", values: ["training","inference","comparison"] } } },
    AssetPreview: { source: "./src/components/AssetPreview.vue", html: { renderer: "./src/renderers/asset-preview-html.ts" }, portability: "portable", props: { source: { type: "asset", required: true }, label: { type: "string" } } },
    LifecycleProbe: { source: "./src/components/LifecycleProbe.vue" }
  },
  layouts: { HeroSplit: { source: "./src/layouts/HeroSplit.vue" } }
});
