import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { bracketMatching, defaultHighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";

export function languageFor(filename: string): Extension {
  if (filename.endsWith(".json")) return json();
  if (/\.(m?js|ts)$/.test(filename)) return javascript({ typescript: filename.endsWith(".ts") });
  if (filename.endsWith(".rtex")) return StreamLanguage.define(stex);
  return [];
}

export interface EditorHandle { view: EditorView; destroy(): void; getValue(): string; setValue(value: string): void; goToLine(line: number): void }

export function createEditor(parent: HTMLElement, options: { doc: string; filename: string; onChange: (value: string) => void; onSave?: () => void }): EditorHandle {
  const state = EditorState.create({
    doc: options.doc,
    extensions: [
      lineNumbers(),
      history(),
      highlightActiveLine(),
      bracketMatching(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      languageFor(options.filename),
      oneDark,
      keymap.of([
        { key: "Mod-s", preventDefault: true, run: () => { options.onSave?.(); return true; } },
        indentWithTab,
        ...defaultKeymap,
        ...historyKeymap
      ]),
      EditorView.updateListener.of(update => { if (update.docChanged) options.onChange(update.state.doc.toString()); }),
      EditorView.theme({ "&": { height: "100%" }, ".cm-scroller": { overflow: "auto", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "13px" } })
    ]
  });
  const view = new EditorView({ state, parent });
  return {
    view,
    destroy: () => view.destroy(),
    getValue: () => view.state.doc.toString(),
    setValue: value => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } }),
    goToLine: line => {
      const target = Math.min(Math.max(1, line), view.state.doc.lines);
      const position = view.state.doc.line(target).from;
      view.dispatch({ selection: EditorSelection.cursor(position), scrollIntoView: true });
      view.focus();
    }
  };
}
