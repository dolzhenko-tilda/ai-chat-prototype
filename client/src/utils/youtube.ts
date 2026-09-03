import { reactive } from "vue";

/** Only URLs matching this are ever turned into an embedded `<iframe>` (see
 * `TextPart.vue`) - guards against the model hallucinating an arbitrary
 * (potentially malicious) iframe `src`, since the video catalog it's given
 * (see `llm.ts`'s `getVideos`) is meant to be copied verbatim but nothing
 * stops it from inventing a URL instead. */
export const YOUTUBE_EMBED_URL_PATTERN = /^https:\/\/www\.youtube\.com\/embed\/[\w-]+(?:[?#].*)?$/;

/** Extracts the video ID from a `youtube.com/embed/<id>` URL, or `null` if it
 * doesn't match. */
export function getYoutubeVideoId(url: string): string | null {
  const match = YOUTUBE_EMBED_URL_PATTERN.test(url) ? /\/embed\/([\w-]+)/.exec(url) : null;
  return match?.[1] ?? null;
}

/** Module-level cache of video titles fetched from YouTube's public oEmbed
 * endpoint, keyed by video ID and shared across every `TextPart` instance so
 * a given video's title is only ever fetched once per page load. `reactive`
 * so components reading it during render re-render once a fetch resolves. */
const titleCache = reactive<Record<string, string | null>>({});
const fetchesInFlight = new Set<string>();

async function fetchTitle(videoId: string): Promise<void> {
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`
    );
    const data = response.ok ? await response.json() : null;
    titleCache[videoId] = typeof data?.title === "string" ? data.title : null;
  } catch {
    titleCache[videoId] = null;
  } finally {
    fetchesInFlight.delete(videoId);
  }
}

/** Returns the video's real title once fetched (`undefined` while still
 * loading, `null` if it couldn't be determined), kicking off a background
 * fetch the first time a given video ID is requested. Meant to be called
 * during a component's render (e.g. from a template expression or a
 * function it calls) so the reactive cache read is tracked and the
 * component re-renders once the title arrives. */
export function useYoutubeTitle(videoId: string): string | null | undefined {
  if (!(videoId in titleCache) && !fetchesInFlight.has(videoId)) {
    fetchesInFlight.add(videoId);
    void fetchTitle(videoId);
  }
  return titleCache[videoId];
}
