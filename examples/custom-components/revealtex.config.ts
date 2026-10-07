import { defineConfig } from "revealtex";

export default defineConfig({
  renderer: "vue",
  components: {
    StatCard: {
      source: "./src/components/StatCard.vue",
      portability: "portable",
      semanticFallback: { tag: "article", class: "stat-card" },
      props: {
        value: { type: "number", required: true },
        label: { type: "string", required: true },
        trend: { type: "number" }
      }
    },
    FeatureCard: { source: "./src/components/FeatureCard.vue" }
  }
});
