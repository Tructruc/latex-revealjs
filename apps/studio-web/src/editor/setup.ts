import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, snippetCompletion, startCompletion, type Completion, type CompletionSource } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { bracketMatching, defaultHighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import type { CompletionData } from "../api";

export function languageFor(filename: string): Extension {
  if (filename.endsWith(".json")) return json();
  if (/\.(m?js|ts)$/.test(filename)) return javascript({ typescript: filename.endsWith(".ts") });
  if (filename.endsWith(".rtex")) return StreamLanguage.define(stex);
  return [];
}

function environmentSnippet(name: string, argument = ""): string {
  return `\\begin{${name}}${argument}\n\t$1\n\\end{${name}}`;
}

function rtexSource(getCompletions: () => CompletionData): CompletionSource {
  return (context) => {
    const data = getCompletions();
    const envMatch = context.state.sliceDoc(Math.max(0, context.pos - 80), context.pos).match(/\\(begin|end)\{([A-Za-z*]*)$/);
    if (envMatch) {
      const [, keyword, word = ""] = envMatch;
      const from = context.pos - word.length;
      const options: Completion[] = data.environments.map(item => keyword === "end"
        ? { label: item.name, detail: item.detail, type: "class" }
        : snippetCompletion(environmentSnippet(item.name, (item.argument ?? "").replace("$1", "$2")), { label: item.name, detail: item.detail, type: "class" }));
      return { from, options };
    }
    const command = context.matchBefore(/\\[A-Za-z@*]*/);
    if (command && command.text.length > 1) {
      const options: Completion[] = data.commands.map(item => item.snippet
        ? snippetCompletion(item.snippet, { label: `\\${item.name}`, detail: item.detail, type: "keyword" })
        : { label: `\\${item.name}`, detail: item.detail, type: "keyword" });
      return { from: command.from, options };
    }
    return null;
  };
}

function environmentEndExists(view: EditorView, env: string, from: number): boolean {
  const after = view.state.sliceDoc(from, Math.min(view.state.doc.length, from + 400));
  const escaped = env.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\\\end\\{${escaped}\\}`).test(after);
}

/** Insert a matching `\end{...}` when a `\begin{...}` is completed. */
function autoCloseEnvironment(view: EditorView): void {
  const head = view.state.selection.main.head;
  const before = view.state.sliceDoc(Math.max(0, head - 80), head);
  const match = before.match(/\\begin\{([A-Za-z*]+)\}$/);
  if (!match) return;
  const env = match[1]!;
  if (environmentEndExists(view, env, head)) return;
  view.dispatch({ changes: { from: head, insert: `\n\t\n\\end{${env}}` }, selection: { anchor: head + 2 } });
}

/** Handle the closing brace skipped over by the auto-bracket-closing feature. */
function closeEnvironmentBrace(view: EditorView): boolean {
  const position = view.state.selection.main;
  if (view.state.sliceDoc(position.from, position.from + 1) !== "}") return false;
  const before = view.state.sliceDoc(Math.max(0, position.from - 80), position.from);
  const match = before.match(/\\begin\{([A-Za-z*]+)$/);
  if (!match) return false;
  const env = match[1]!;
  const head = position.from + 1;
  if (environmentEndExists(view, env, head)) {
    view.dispatch({ selection: { anchor: head } });
    return true;
  }
  view.dispatch({ changes: { from: head, insert: `\n\t\n\\end{${env}}` }, selection: { anchor: head + 2 } });
  return true;
}

export interface EditorHandle { view: EditorView; destroy(): void; getValue(): string; setValue(value: string): void; goToLine(line: number): void }

export function createEditor(parent: HTMLElement, options: { doc: string; filename: string; getCompletions: () => CompletionData; onChange: (value: string) => void; onSave?: () => void }): EditorHandle {
  const rtex = options.filename.endsWith(".rtex");
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
      ...(rtex ? [closeBrackets(), autocompletion({ override: [rtexSource(options.getCompletions)], activateOnTyping: true, icons: true })] : []),
      keymap.of([
        { key: "Mod-s", preventDefault: true, run: () => { options.onSave?.(); return true; } },
        ...(rtex ? [
          {
            key: "\\",
            run: (view: EditorView) => {
              const selection = view.state.selection.main;
              const previous = view.state.sliceDoc(Math.max(0, selection.from - 1), selection.from);
              view.dispatch({ changes: { from: selection.from, to: selection.to, insert: "\\" }, selection: { anchor: selection.from + 1 } });
              if (previous !== "\\") startCompletion(view);
              return true;
            }
          },
          { key: "}", run: closeEnvironmentBrace }
        ] : []),
        indentWithTab,
        ...closeBracketsKeymap,
        ...completionKeymap,
        ...defaultKeymap,
        ...historyKeymap
      ]),
      EditorView.updateListener.of(update => {
        if (!update.docChanged) return;
        options.onChange(update.state.doc.toString());
        if (rtex) autoCloseEnvironment(update.view);
      }),
      EditorView.theme({
        "&": { height: "100%" },
        ".cm-scroller": { overflow: "auto", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "14px", lineHeight: "1.6" },
        ".cm-gutters": { background: "#12141a", borderRight: "1px solid #232833" },
        ".cm-activeLine": { background: "#ffffff08" },
        ".cm-content": { padding: "12px 0" }
      })
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
