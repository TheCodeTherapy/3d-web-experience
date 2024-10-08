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
    { tag: t.comment, color: "#6a9955" }, // Green comments
    { tag: t.variableName, color: "#9cdcfe" }, // Blue variable names
    { tag: t.number, color: "#b5cea8" }, // Light green numbers
    { tag: t.integer, color: "#b5cea8" }, // Light green integers
    { tag: t.keyword, color: "#c586c0" }, // Purple keywords
    { tag: t.modifier, color: "#569cd6" }, // Blue modifiers
    { tag: t.typeName, color: "#4ec9b0" }, // Cyan types
    { tag: t.macroName, color: "#c586c0" }, // Purple macros
    { tag: t.meta, color: "#9cdcfe" }, // Blue meta
    { tag: t.operator, color: "#d4d4d4" }, // Light operators
    { tag: t.definition(t.variableName), color: "#9cdcfe" }, // Blue defined variables
    { tag: t.atom, color: "#569cd6" }, // Blue atoms
    { tag: t.string, color: "#ce9178" }, // Brownish-orange strings
    { tag: t.className, color: "#4ec9b0" }, // Cyan class names
    { tag: t.function(t.variableName), color: "#dcdcaa" }, // Yellow functions
    { tag: t.function(t.propertyName), color: "#dcdcaa" }, // Yellow function properties
    { tag: t.propertyName, color: "#9cdcfe" }, // Blue property names
    { tag: t.tagName, color: "#569cd6" }, // Blue tag names in HTML
    { tag: t.attributeName, color: "#9cdcfe" }, // Blue attribute names
    { tag: t.heading, color: "#4ec9b0" }, // Cyan headings
    { tag: t.emphasis, color: "#d4d4d4", fontStyle: "italic" }, // Italic emphasis
    { tag: t.strong, color: "#d4d4d4", fontWeight: "bold" }, // Bold strong text
    { tag: t.link, color: "#3794ff", textDecoration: "underline" }, // Blue links
    { tag: t.url, color: "#dcdcaa" }, // Yellow for URLs
    { tag: t.literal, color: "#b5cea8" }, // Light green literals
    { tag: t.bool, color: "#569cd6" }, // Blue booleans
    { tag: t.null, color: "#569cd6" }, // Blue null values
    { tag: t.punctuation, color: "#d4d4d4" }, // Light punctuation
    { tag: t.paren, color: "#d4d4d4" }, // Light parentheses
    { tag: t.bracket, color: "#d4d4d4" }, // Light brackets
    { tag: t.angleBracket, color: "#d4d4d4" }, // Light angle brackets
    { tag: t.squareBracket, color: "#d4d4d4" }, // Light square brackets
    { tag: t.separator, color: "#d4d4d4" }, // Light separators
    { tag: t.operatorKeyword, color: "#569cd6" }, // Blue operators
    { tag: t.controlKeyword, color: "#c586c0" }, // Purple control keywords (if, else, etc.)
    { tag: t.definitionKeyword, color: "#c586c0" }, // Purple definition keywords (function, var, etc.)
    { tag: t.moduleKeyword, color: "#c586c0" }, // Purple module keywords
    { tag: t.unit, color: "#b5cea8" }, // Light green units
    { tag: t.regexp, color: "#d16969" }, // Red regex
    { tag: t.escape, color: "#d7ba7d" }, // Yellow escapes
    { tag: t.invalid, color: "#f44747", textDecoration: "underline" }, // Red invalid tokens with underline
  ],
});
