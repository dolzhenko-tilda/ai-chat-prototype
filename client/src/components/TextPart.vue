<script setup lang="ts">
import { computed } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";

type SourceData = { title: string; url: string; paragraphIndex: number; itemIndex?: number };

const props = defineProps<{
  text: string;
  state?: "streaming" | "done";
  /** Mock sources for this text part, matched to a paragraph via
   * `paragraphIndex` (not all paragraphs have one) - or, when the paragraph
   * is a markdown list, to one specific `<li>` via `itemIndex`, so each list
   * item can carry its own source instead of just one per whole list. */
  sources?: SourceData[];
}>();

const isStreaming = computed(() => props.state === "streaming");

const paragraphs = computed(() => {
  const parts = props.text.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [props.text];
});

/** Block-level tags marked can produce whose content isn't inline text flow
 * (a table's rows, a code block's literal contents, a rule, a standalone
 * image) - a source link can't be appended *inside* these, so it's inserted
 * right after the element instead. */
const NON_INLINE_BLOCK_TAGS = new Set(["TABLE", "PRE", "HR", "IMG"]);

/** Finds where to place the source link so it reads inline with the last bit
 * of visible text markdown rendered, however deeply nested (last item of a
 * list, possibly-nested lists, blockquotes, headings, loose-list paragraphs,
 * etc.), falling back to inserting after the element for block content
 * (tables, code blocks, rules, images) that can't sensibly hold inline text. */
function findSourceInsertionPoint(element: Element): { mode: "append" | "after"; target: Element } {
  if (NON_INLINE_BLOCK_TAGS.has(element.tagName)) {
    return { mode: "after", target: element };
  }
  if (element.tagName === "UL" || element.tagName === "OL") {
    const lastItem = element.querySelector(":scope > li:last-of-type");
    return lastItem ? findSourceInsertionPoint(lastItem) : { mode: "after", target: element };
  }
  // Anything else with element children (blockquote, li, div wrappers, ...)
  // - descend into the last child element to find the actual innermost
  // content, but only if it's also the element's overall last child node.
  // Otherwise there's trailing text after it (e.g. `<li><strong>Title</strong>
  // : rest of the text</li>`) which is the real last content, so the link
  // belongs here rather than inside that inner element.
  const lastElementChild = element.lastElementChild;
  if (lastElementChild && lastElementChild === element.lastChild) {
    return findSourceInsertionPoint(lastElementChild);
  }
  return { mode: "append", target: element };
}

const SOURCE_ICON_PATH_D =
  "M 19.980469 2.9902344 A 1.0001 1.0001 0 0 0 19.869141 3 L 15 3 A 1.0001 1.0001 0 1 0 15 5 L 17.585938 5 L 8.2929688 14.292969 A 1.0001 1.0001 0 1 0 9.7070312 15.707031 L 19 6.4140625 L 19 9 A 1.0001 1.0001 0 1 0 21 9 L 21 4.1269531 A 1.0001 1.0001 0 0 0 19.980469 2.9902344 z M 5 3 C 3.9069372 3 3 3.9069372 3 5 L 3 19 C 3 20.093063 3.9069372 21 5 21 L 19 21 C 20.093063 21 21 20.093063 21 19 L 21 13 A 1.0001 1.0001 0 1 0 19 13 L 19 19 L 5 19 L 5 5 L 11 5 A 1.0001 1.0001 0 1 0 11 3 L 5 3 z";
const SVG_NS = "http://www.w3.org/2000/svg";

/** Builds the "external link" icon shown at the end of a source link. SVG
 * elements need `createElementNS` (unlike HTML elements) since `createElement`
 * would produce a non-rendering `HTMLUnknownElement` for them. */
function buildSourceIcon(document: Document): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "text-part__source-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", SOURCE_ICON_PATH_D);
  svg.append(path);
  return svg;
}

/** Builds the source `<a>` link element (label + external-link icon) for a
 * single mock source. */
function buildSourceLink(document: Document, sourceData: SourceData): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "text-part__source";
  link.href = sourceData.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = sourceData.title;

  const label = document.createElement("span");
  label.textContent = sourceData.title;
  link.append(label, buildSourceIcon(document));
  return link;
}

/** Inserts `link` at the innermost sensible spot within/after `element` (see
 * `findSourceInsertionPoint`). */
function insertSourceLink(document: Document, element: Element, sourceData: SourceData): void {
  const link = buildSourceLink(document, sourceData);
  const { mode, target } = findSourceInsertionPoint(element);
  if (mode === "after") {
    target.after(' ', link);
  } else {
    target.append(' ', link);
  }
}

/** Renders a single paragraph's markdown to sanitized HTML. Each paragraph is
 * parsed independently (rather than the whole message at once) so it can
 * still be paired one-to-one with its mock source/cursor, same as before
 * markdown support was added.
 *
 * A paragraph can contain a markdown list, optionally preceded by an intro
 * line with no blank line before the list (e.g. "Some intro:\n- item one").
 * In that case the intro text and each list item are separate units and can
 * each carry their own source: the intro's source (if any) attaches right
 * before the list, and each item's source attaches to its own `<li>`. */
function renderMarkdown(source: string, paragraphIndex: number): string {
  const sanitizedMarkdown = DOMPurify.sanitize(marked.parse(source, { async: false, breaks: true }));
  const document = new DOMParser().parseFromString(sanitizedMarkdown, "text/html");

  const list = document.body.querySelector(":scope > ul, :scope > ol");
  const itemSources = sourcesForParagraphItems(paragraphIndex);
  for (const sourceData of itemSources) {
    const item = list?.children[sourceData.itemIndex!];
    if (item) insertSourceLink(document, item, sourceData);
  }

  const sourceData = sourceForParagraph(paragraphIndex);
  if (sourceData) {
    // With a list present, the paragraph-level source belongs to the intro
    // text right above it (the element right before the list), not the list
    // itself - falling back to the paragraph's last element if there's no
    // list (the previous, simpler behavior).
    const introElement = list?.previousElementSibling ?? document.body.lastElementChild;
    if (introElement) insertSourceLink(document, introElement, sourceData);
  }

  return document.body.innerHTML;
}

/** The source attached to `index`'s paragraph as a whole (i.e. not one of its
 * list items - see `sourcesForParagraphItems`). */
function sourceForParagraph(index: number): SourceData | undefined {
  return props.sources?.find((source) => source.paragraphIndex === index && source.itemIndex === undefined);
}

/** Sources attached to individual list items of `index`'s paragraph. */
function sourcesForParagraphItems(index: number): SourceData[] {
  return props.sources?.filter((source) => source.paragraphIndex === index && source.itemIndex !== undefined) ?? [];
}
</script>

<template>
  <div class="text-part" :class="{ 'text-part--streaming': isStreaming }">
    <div v-for="(paragraph, i) in paragraphs" :key="i" class="text-part__paragraph">
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="text-part__markdown" v-html="renderMarkdown(paragraph, i)"></div>
      <span v-if="isStreaming && i === paragraphs.length - 1" class="cursor">▍</span>
    </div>
  </div>
</template>

<style scoped>
.text-part {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.text-part__paragraph {
  word-break: break-word;
  margin: 0;
  line-height: 1.5;
}
.text-part__markdown :deep(.text-part__source) {
  display: inline-flex;
  align-items: center;
  padding: 0 6px;
  border: 1px solid var(--accent);
  border-radius: 10px;
  font-size: 0.6em;
  font-weight: 600;
  color: var(--accent);
  text-decoration: none;
  vertical-align: text-bottom;
}
.text-part__markdown :deep(.text-part__source:hover) {
  text-decoration: underline;
}
.text-part__markdown :deep(.text-part__source-icon) {
  width: 10px;
  height: 10px;
  margin-left: 0.25rem;
  fill: var(--accent);
}
.cursor {
  display: inline-block;
  animation: blink 1s step-start infinite;
  color: var(--accent);
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}

/* Rendered markdown content (v-html), styled via :deep since Vue's scoped
 * CSS doesn't otherwise reach into innerHTML. */
.text-part__markdown :deep(> :first-child) {
  margin-top: 0;
}
.text-part__markdown :deep(> :last-child) {
  margin-bottom: 0;
}
.text-part__markdown :deep(p) {
  margin: 0.5em 0;
  line-height: 1.5;
}
.text-part__markdown :deep(h1),
.text-part__markdown :deep(h2),
.text-part__markdown :deep(h3),
.text-part__markdown :deep(h4),
.text-part__markdown :deep(h5),
.text-part__markdown :deep(h6) {
  margin: 0.75em 0 0.35em;
  line-height: 1.3;
}
.text-part__markdown :deep(ul),
.text-part__markdown :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.4em;
}
.text-part__markdown :deep(li) {
  margin: 0.15em 0;
}
.text-part__markdown :deep(li > p) {
  margin: 0;
}
.text-part__markdown :deep(a) {
  color: var(--accent);
}
.text-part__markdown :deep(strong) {
  font-weight: 700;
}
.text-part__markdown :deep(blockquote) {
  margin: 0.5em 0;
  padding: 0.1rem 0.85rem;
  border-left: 3px solid var(--border);
  color: var(--text-muted);
}
.text-part__markdown :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.9em;
  background: var(--surface-2);
  border-radius: 4px;
  padding: 0.1em 0.35em;
}
.text-part__markdown :deep(pre) {
  margin: 0.5em 0;
  padding: 0.75rem;
  border-radius: 8px;
  background: var(--surface-2);
  overflow-x: auto;
}
.text-part__markdown :deep(pre code) {
  background: none;
  padding: 0;
  font-size: 0.85em;
}
.text-part__markdown :deep(table) {
  border-collapse: collapse;
  margin: 0.5em 0;
}
.text-part__markdown :deep(th),
.text-part__markdown :deep(td) {
  border: 1px solid var(--border);
  padding: 0.3em 0.6em;
}
.text-part__markdown :deep(hr) {
  border: none;
  border-top: 1px solid var(--border);
  margin: 0.75em 0;
}
.text-part__markdown :deep(img) {
  max-width: 100%;
  border-radius: 6px;
}
</style>
