/* eslint-disable @typescript-eslint/no-unused-vars */
import { indentMore, indentLess } from "@codemirror/commands";
import { html } from "@codemirror/lang-html";
import { indentUnit, foldService } from "@codemirror/language";
import { keymap, Decoration, MatchDecorator, ViewPlugin } from "@codemirror/view";
import { StateCommand } from "@uiw/react-codemirror";
import { basicSetup, EditorView } from "codemirror";

const defaultAttrs = {
  attrs: {
    x: ["string"],
    y: ["string"],
    z: ["string"],
    sx: ["string"],
    sy: ["string"],
    sz: ["string"],
    rx: ["string"],
    ry: ["string"],
    rz: ["string"],
    visible: ["boolean"],
    debug: ["boolean"],
    id: ["string"],
    class: ["string"],
  },
};

export const defaultEditorExtensions = [
  html({
    matchClosingTags: true,
    autoCloseTags: true,
    extraTags: {
      "m-group": defaultAttrs,
      "m-cube": defaultAttrs,
      "m-sphere": defaultAttrs,
      "m-plane": defaultAttrs,
      "m-cylinder": defaultAttrs,
      "m-light": defaultAttrs,
      "m-model": defaultAttrs,
      "m-character": defaultAttrs,
      "m-frame": defaultAttrs,
      "m-audio": defaultAttrs,
      "m-image": defaultAttrs,
      "m-video": defaultAttrs,
      "m-label": defaultAttrs,
      "m-position-probe": defaultAttrs,
      "m-prompt": defaultAttrs,
      "m-link": defaultAttrs,
      "m-interaction": defaultAttrs,
      "m-chat-probe": defaultAttrs,
      "m-attr-anim": defaultAttrs,
      "m-attr-lerp": defaultAttrs,
    },
  }),
];

export const indentSelectionLess: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) return false;
  if (state.selection.ranges.some((r) => !r.empty)) return indentLess({ state, dispatch });
  return false;
};

export const indentOrInsertTab: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) return false;
  if (state.selection.ranges.some((r) => !r.empty)) return indentMore({ state, dispatch });
  dispatch(
    state.update(state.replaceSelection(state.facet(indentUnit)), {
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
};

export const foldOnIndentBasic = () => {
  return foldService.of((state, from, to) => {
    const line = state.doc.lineAt(from); // First line
    const lines = state.doc.lines; // Number of lines in the document
    const indent = line.text.search(/\S|$/); // Indent level of the first line
    let foldStart = from; // Start of the fold
    let foldEnd = to; // End of the fold

    // Check the next line if it is on a deeper indent level
    // If it is, check the next line and so on
    // If it is not, go on with the foldEnd
    let nextLine = line;
    while (nextLine.number < lines) {
      nextLine = state.doc.line(nextLine.number + 1); // Next line
      const nextIndent = nextLine.text.search(/\S|$/); // Indent level of the next line

      // If the next line is on a deeper indent level, add it to the fold
      if (nextIndent > indent) {
        foldEnd = nextLine.to; // Set the fold end to the end of the next line
      } else {
        break; // If the next line is not on a deeper indent level, stop
      }
    }

    // If the fold is only one line, don't fold it
    if (state.doc.lineAt(foldStart).number === state.doc.lineAt(foldEnd).number) {
      return null;
    }

    // Set the fold start to the end of the first line
    // With this, the fold will not include the first line
    foldStart = line.to;

    // Return a fold that covers the entire indent level
    return { from: foldStart, to: foldEnd };
  });
};

const foldOnIndentAdvanced = () => {
  return foldService.of((state, from, to) => {
    const line = state.doc.lineAt(from); // First line
    const lines = state.doc.lines; // Number of lines in the document
    // Skip the fold if the first line is blank
    if (line.text.trim() === "") {
      return null;
    }
    const indent = line.text.search(/\S|$/); // Indent level of the first line
    let foldStart = from; // Start of the fold
    let foldEnd = to; // End of the fold
    let foundDeeperIndent = false; // Flag for deeper indentation

    let nextLine = line;
    while (nextLine.number < lines) {
      nextLine = state.doc.line(nextLine.number + 1); // Next line
      const nextIndent = nextLine.text.search(/\S|$/); // Indent level of the next line

      // Skip blank lines
      if (nextLine.text.trim() === "") {
        continue;
      }

      // Check for deeper indentation
      if (nextIndent > indent) {
        foldEnd = nextLine.to; // Set the fold end
        foundDeeperIndent = true;
      } else {
        break; // Break if no deeper indentation is found
      }
    }

    // Avoid creating a fold if no deeper indentation is found
    if (
      !foundDeeperIndent ||
      state.doc.lineAt(foldStart).number === state.doc.lineAt(foldEnd).number
    ) {
      return null;
    }

    // Set the fold start
    foldStart = line.to;

    // Return the fold region
    return { from: foldStart, to: foldEnd };
  });
};

const filterHighlightDecoration = Decoration.mark({ class: "highlight" });

const filterDecorator = new MatchDecorator({
  regexp: /(min|mag|wrapS|wrapT):([^\s]+)|\bhttps:\/\/\S+/g,
  decoration: (_m: any) => {
    return filterHighlightDecoration;
  },
});

const filterPlugin = ViewPlugin.define(
  (view) => ({
    decorations: filterDecorator.createDeco(view),
    update(u) {
      this.decorations = filterDecorator.updateDeco(u, this.decorations);
    },
  }),
  {
    decorations: (v) => v.decorations,
  },
);

export const extensions = [
  basicSetup,
  foldOnIndentAdvanced(),
  filterPlugin,
  // keymap.of([{ key: "tab", run: acceptCompletion }]),
  keymap.of([
    {
      key: "Tab",
      run: indentOrInsertTab,
      shift: indentSelectionLess,
    },
  ]),
  EditorView.theme({
    "&.cm-editor": { width: "100%", height: "100%" },
    ".cm-scroller": { overflow: "auto" },
  }),
];
