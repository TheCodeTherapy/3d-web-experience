import { tags as t } from "@lezer/highlight";
import { createTheme } from "@uiw/codemirror-themes";

export const editorTheme = createTheme({
  theme: "dark",
  settings: {
    backgroundImage: "",
    foreground: "#ffffff",
    caret: "#88ff88",
    selection: "#ffffffbb",
    selectionMatch: "#ffffff70",
    lineHighlight: "#8a91991a",
    gutterBackground: "rgba(0, 0, 0, 0)",
    gutterForeground: "#aaaaaa70",
  },
  styles: [
    { tag: t.comment, class: "comment" },
    { tag: t.variableName, color: "#a7c9ff" },
    { tag: t.number, color: "#faa29a" },
    { tag: t.integer, color: "#fac290" },
    { tag: t.keyword, color: "#cbb5ff" },
    { tag: t.modifier, color: "#ffff00" },
    { tag: t.typeName, color: "#74db74" },
    { tag: t.macroName, color: "#74db74" },
    { tag: t.meta, color: "#44ddff" },
    { tag: t.operator, color: "#e7c09c" },
    { tag: t.definition(t.variableName), color: "#ffffaa" },
    { tag: t.atom, color: "#c5ff7a" },
  ],
});
