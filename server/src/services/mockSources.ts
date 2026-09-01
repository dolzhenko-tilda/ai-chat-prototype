/**
 * Mock catalog of citable "sources" handed to the model via the system
 * prompt (see `buildSystemPrompt` in `generationService.ts`). The model
 * itself decides which of these - if any - to cite inline in its markdown
 * response; the server no longer picks/inserts sources on its behalf.
 */
export interface MockSource {
  title: string;
  url: string;
}

export const MOCK_SOURCES: MockSource[] = [
  { title: "Tilda Help Center", url: "https://www.tilda.cc/help/" },
  { title: "Getting Started with Tilda", url: "https://www.tilda.cc/help/getting-started/" },
  { title: "Tilda Blocks Overview", url: "https://www.tilda.cc/help/blocks/" },
  { title: "Zero Block Editor Guide", url: "https://www.tilda.cc/help/zero-block/" },
  { title: "Tilda Pricing Plans", url: "https://www.tilda.cc/pricing/" },
  { title: "Connecting a Custom Domain", url: "https://www.tilda.cc/help/custom-domain/" },
  { title: "Tilda SEO Guide", url: "https://www.tilda.cc/help/seo/" },
  { title: "Tilda Forms and Data Collection", url: "https://www.tilda.cc/help/forms/" },
  { title: "Tilda Members (User Accounts)", url: "https://www.tilda.cc/help/members/" },
  { title: "Tilda Store (E-commerce)", url: "https://www.tilda.cc/help/store/" },
  { title: "Tilda Mail Newsletter Guide", url: "https://www.tilda.cc/help/mail/" },
  { title: "Tilda Publishing Settings", url: "https://www.tilda.cc/help/publish/" },
  { title: "Tilda Analytics Integration", url: "https://www.tilda.cc/help/analytics/" },
  { title: "Tilda API Documentation", url: "https://www.tilda.cc/help/api/" },
  { title: "Tilda Mobile App Guide", url: "https://www.tilda.cc/help/mobile/" },
  { title: "Product Docs", url: "https://example.com/product-docs" },
  { title: "Knowledge Base", url: "https://example.com/knowledge-base" },
  { title: "API Reference", url: "https://example.com/api-reference" },
  { title: "Community Forum", url: "https://example.com/community-forum" },
  { title: "Release Notes", url: "https://example.com/release-notes" },
];
