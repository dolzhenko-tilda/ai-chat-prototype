<script setup lang="ts">
import { computed } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { YOUTUBE_EMBED_URL_PATTERN, getYoutubeVideoId, useYoutubeTitle } from "../utils/youtube";

const props = defineProps<{
  text: string;
  state?: "streaming" | "done";
}>();

const isStreaming = computed(() => props.state === "streaming");

const paragraphs = computed(() => {
  const parts = props.text.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [props.text];
});

interface SourceLink {
  url: string;
  title: string;
}

/**
 * GitHub-style "alert" blockquotes: `> [!NOTE]` / `[!TIP]` / `[!IMPORTANT]` /
 * `[!WARNING]` / `[!CAUTION]` as the first line of a blockquote (see the
 * system prompt built in `generationService.ts`'s `buildSystemPrompt`).
 * `marked` renders these as an ordinary `<blockquote><p>[!NOTE]<br>...`; the
 * marker line is detected and stripped below, and the blockquote is swapped
 * for a callout styled purely by color (left border + tinted background per
 * type) - no icon or type label, matching the reference design.
 */
const ALERT_MARKER_PATTERN = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(?:<br\s*\/?>\s*)?/i;

interface RenderedParagraph {
  html: string;
  sources: SourceLink[];
}

/** Renders a single paragraph's markdown to sanitized HTML. Each paragraph is
 * parsed independently (rather than the whole message at once) so it can
 * still be paired one-to-one with the streaming cursor, same as before
 * markdown support was added.
 *
 * Source citations are no longer inserted by the client: the model itself
 * writes them inline as regular markdown links in the exact format
 * `[title](url "source:title")` (see the system prompt built in
 * `generationService.ts`'s `buildSystemPrompt`), which `marked` renders as
 * `<a href="url" title="source:title">title</a>`. The `source:` prefix is
 * only a marker for the client to recognize a citation link - it's stripped
 * from the (user-visible-on-hover) `title` here, and a `text-part__source-link`
 * class is added instead so both these inline links and the aggregated
 * "Sources:" line below can share the same styling. */
function renderMarkdown(source: string): RenderedParagraph {
  const sanitizedMarkdown = DOMPurify.sanitize(marked.parse(source, { async: false, breaks: true }));
  const document = new DOMParser().parseFromString(sanitizedMarkdown, "text/html");
  const sources: SourceLink[] = [];
  for (const link of document.querySelectorAll('a[title^="source:"]')) {
    const title = link.getAttribute("title")!.slice("source:".length);
    link.setAttribute("title", title);
    link.classList.add("text-part__source-link");
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
    sources.push({ url: link.getAttribute("href") ?? "", title });
  }
  // Images the model embeds via `![description](url)` get wrapped in a
  // figure with the description shown as a caption underneath, instead of
  // relying on the (invisible unless hovered) native `alt`/`title` text.
  for (const img of document.querySelectorAll("img")) {
    const figure = document.createElement("figure");
    figure.className = "text-part__image";
    img.replaceWith(figure);
    figure.appendChild(img);
    if (img.alt) {
      const caption = document.createElement("figcaption");
      caption.className = "text-part__image-caption";
      caption.textContent = img.alt;
      figure.appendChild(caption);
    }
  }
  // Videos the model embeds via `[Video](url "video:description")` (there's
  // no native markdown video syntax - see `llm.ts`'s `getVideos`) get turned
  // into a real embedded player. The video's title isn't known to the model,
  // so it's fetched live from YouTube's oEmbed API (`useYoutubeTitle`); the
  // description came from the tool call and is rendered as a caption below.
  for (const link of document.querySelectorAll('a[title^="video:"]')) {
    const url = link.getAttribute("href") ?? "";
    const description = link.getAttribute("title")!.slice("video:".length);
    // Only ever embed an `<iframe>` for a URL matching YouTube's own embed
    // path - guards against rendering an arbitrary/hallucinated URL as a
    // live iframe. Anything else falls back to a plain link.
    if (!YOUTUBE_EMBED_URL_PATTERN.test(url)) continue;
    const videoId = getYoutubeVideoId(url);
    const title = (videoId && useYoutubeTitle(videoId)) || "YouTube video";

    const figure = document.createElement("figure");
    figure.className = "text-part__video";

    const frame = document.createElement("div");
    frame.className = "text-part__video-frame";
    const iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.title = title;
    iframe.loading = "lazy";
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    frame.appendChild(iframe);
    figure.appendChild(frame);

    const caption = document.createElement("figcaption");
    caption.className = "text-part__video-caption";
    const titleEl = document.createElement("div");
    titleEl.className = "text-part__video-title";
    titleEl.textContent = title;
    const descriptionEl = document.createElement("div");
    descriptionEl.className = "text-part__video-description";
    descriptionEl.textContent = description;
    caption.append(titleEl, descriptionEl);
    figure.appendChild(caption);

    link.replaceWith(figure);
  }
  for (const blockquote of document.querySelectorAll("blockquote")) {
    const firstParagraph = blockquote.querySelector("p");
    const match = firstParagraph?.innerHTML.match(ALERT_MARKER_PATTERN);
    if (!firstParagraph || !match) continue;
    const type = match[1].toLowerCase();
    firstParagraph.innerHTML = firstParagraph.innerHTML.slice(match[0].length);

    const alert = document.createElement("div");
    alert.className = `text-part__alert text-part__alert--${type}`;
    alert.append(...blockquote.childNodes);
    blockquote.replaceWith(alert);
  }
  return { html: document.body.innerHTML, sources };
}

const renderedParagraphs = computed(() => paragraphs.value.map(renderMarkdown));

/** All source citations found across the whole message, deduplicated by
 * url (first occurrence wins), additionally rendered as a "Sources: ..."
 * line at the end of the text block, alongside the same links left inline. */
const sources = computed<SourceLink[]>(() => {
  const seen = new Map<string, SourceLink>();
  for (const { sources: paragraphSources } of renderedParagraphs.value) {
    for (const source of paragraphSources) {
      if (source.url && !seen.has(source.url)) seen.set(source.url, source);
    }
  }
  return [...seen.values()];
});
</script>

<template>
  <div class="text-part" :class="{ 'text-part--streaming': isStreaming }">
    <div v-for="(paragraph, i) in renderedParagraphs" :key="i" class="text-part__paragraph">
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="text-part__markdown" v-html="paragraph.html"></div>
      <span v-if="isStreaming && i === renderedParagraphs.length - 1" class="cursor">▍</span>
    </div>
    <div v-if="sources.length > 0" class="text-part__sources">
      <span class="text-part__sources-label">Sources:</span>
      <a
        v-for="source in sources"
        :key="source.url"
        class="text-part__source-link"
        :href="source.url"
        :title="source.title"
        target="_blank"
        rel="noopener noreferrer"
        >{{ source.title }}</a
      >
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
.text-part__markdown :deep(.text-part__source-link),
.text-part__source-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0 6px;
  border: 1px solid var(--accent);
  border-radius: 10px;
  font-size: 0.6em;
  font-weight: 600;
  color: var(--accent);
  text-decoration: none;
  vertical-align: text-bottom;
}
.text-part__markdown :deep(.text-part__source-link):hover,
.text-part__source-link:hover {
  text-decoration: underline;
}
.text-part__markdown :deep(.text-part__source-link)::after,
.text-part__source-link::after {
  content: "↗";
}
.text-part__sources {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85em;
  color: var(--text-muted);
}
.text-part__sources-label {
  font-weight: 600;
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
.text-part__markdown :deep(.text-part__alert) {
  --alert-color: var(--text-muted);
  margin: 0.5em 0;
  padding: 0.75rem 1rem;
  border-left: 3px solid var(--alert-color);
  background: color-mix(in srgb, var(--alert-color) 12%, transparent);
}
.text-part__markdown :deep(.text-part__alert--note) {
  --alert-color: #4493f8;
}
.text-part__markdown :deep(.text-part__alert--tip) {
  --alert-color: #3fb950;
}
.text-part__markdown :deep(.text-part__alert--important) {
  --alert-color: #986ee2;
}
.text-part__markdown :deep(.text-part__alert--warning) {
  --alert-color: #d29922;
}
.text-part__markdown :deep(.text-part__alert--caution) {
  --alert-color: #e5534b;
}
.text-part__markdown :deep(.text-part__alert > :first-child) {
  margin-top: 0;
}
.text-part__markdown :deep(.text-part__alert > :last-child) {
  margin-bottom: 0;
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
.text-part__markdown :deep(.text-part__image) {
  margin: 0.5em 0;
  padding: 0.5rem;
  border-radius: 10px;
  /* Lighter than the surrounding message bubble background in both color
   * schemes (surface-1), regardless of whether "lighter" means towards
   * white or towards the next surface step in dark mode. */
  background: color-mix(in srgb, var(--surface-1), white 12%);
  display: inline-flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.35rem;
  max-width: 100%;
}
.text-part__markdown :deep(.text-part__image img) {
  max-width: 100%;
  display: block;
  border-radius: 6px;
}
.text-part__markdown :deep(.text-part__image-caption) {
  font-style: italic;
  font-size: 0.75em;
  color: var(--text-muted);
}
.text-part__markdown :deep(.text-part__video) {
  margin: 0.5em 0;
  padding: 0.5rem;
  border-radius: 10px;
  /* Same "lighter than the message bubble" treatment as image captions. */
  background: color-mix(in srgb, var(--surface-1), white 12%);
}
.text-part__markdown :deep(.text-part__video-frame) {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 6px;
  overflow: hidden;
  background: #000;
}
.text-part__markdown :deep(.text-part__video-frame iframe) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: none;
}
.text-part__markdown :deep(.text-part__video-caption) {
  margin-top: 0.35rem;
}
.text-part__markdown :deep(.text-part__video-title) {
  font-size: 0.85em;
  font-weight: 600;
}
.text-part__markdown :deep(.text-part__video-description) {
  font-style: italic;
  font-size: 0.75em;
  color: var(--text-muted);
  margin-top: 0.1rem;
}
</style>
