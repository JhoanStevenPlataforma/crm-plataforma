import { marked } from "marked";

// Importing ./Markdown registers the sanitising postprocess hook on `marked`.
import "./Markdown";

/**
 * The words of a Markdown note without its markup, for one-line previews (the
 * activity feed, the phone's note list). Rendering then reading `textContent`
 * reuses the sanitiser, so a preview never shows `**bold**` or `<img …>` source
 * and never executes anything either.
 */
export const markdownToPlainText = (markdown: string): string => {
  const html = marked.parse(markdown) as string;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
};
