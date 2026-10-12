import { describe, expect, it } from "vitest";
import { introspectVueProps } from "../src/introspect.js";

describe("Vue prop introspection", () => {
  it("reads primitive, optional, enum, array, and boolean props", () => {
    const props = introspectVueProps(`<script setup lang="ts">
defineProps<{ value: number; label?: string; mode: "a" | "b"; items: string[]; active: boolean }>();
</script><template><div /></template>`);
    expect(props).toMatchObject({
      value: { type: "number", required: true },
      label: { type: "string", required: false },
      mode: { type: "enum", values: ["a", "b"], required: true },
      items: { type: "array", required: true },
      active: { type: "boolean", required: true }
    });
  });

  it("reads defaults from withDefaults", () => {
    const props = introspectVueProps(`<script setup lang="ts">
withDefaults(defineProps<{ value: number; suffix?: string }>(), { suffix: "%" });
</script>`);
    expect(props).toMatchObject({ value: { type: "number" }, suffix: { type: "string", required: false, default: "%" } });
  });

  it("resolves a named interface type", () => {
    const props = introspectVueProps(`<script setup lang="ts">
interface Props { value: number; layers?: number }
const props = defineProps<Props>();
</script>`);
    expect(props).toMatchObject({ value: { type: "number", required: true }, layers: { type: "number", required: false } });
  });

  it("reads runtime object declarations", () => {
    const props = introspectVueProps(`<script setup>
defineProps({ value: { type: Number, required: true }, label: String });
</script>`);
    expect(props).toMatchObject({ value: { type: "number", required: true }, label: { type: "string" } });
  });

  it("disables introspection for unsupported types", () => {
    const props = introspectVueProps(`<script setup lang="ts">
defineProps<{ onClick: () => void; value: number }>();
</script>`);
    expect(props).toEqual({});
  });
});
