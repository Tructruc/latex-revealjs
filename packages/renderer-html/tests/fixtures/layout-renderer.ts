export default ({ name, slots, escape }: { name: string; slots: Record<string, string>; escape: (value: unknown) => string }): string =>
  `<div class="hero-split" data-layout="${escape(name)}"><div class="hero-left">${slots.left ?? ""}</div><div class="hero-right">${slots.right ?? ""}</div></div>`;
