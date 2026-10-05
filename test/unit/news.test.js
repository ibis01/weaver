const { expect } = require("chai");

const newsPath = require.resolve("../../js/features/news.js");

describe("News provenance and freshness", () => {
  before(() => {
    delete require.cache[newsPath];
    require(newsPath);
  });

  it("retains provider identity, canonical URL, publication time, and fetch time", () => {
    const fetchedAt = Date.parse("2026-10-04T12:00:00Z");
    const xml = `<?xml version="1.0"?><rss><channel><item><title>Example</title><link>https://example.com/story?utm_source=rss</link><description><![CDATA[<b>Body</b>]]></description><pubDate>Sun, 04 Oct 2026 11:00:00 GMT</pubDate></item></channel></rss>`;
    const [article] = global.W.news._internal.parseRSS(
      xml,
      "ExampleFeed",
      fetchedAt,
    );

    expect(article.providerId).to.equal("ExampleFeed");
    expect(article.publisher).to.equal("ExampleFeed");
    expect(article.canonicalUrl).to.equal(
      "https://example.com/story?utm_source=rss",
    );
    expect(article.publishedAt).to.equal("2026-10-04T11:00:00.000Z");
    expect(article.fetchedAt).to.equal(fetchedAt);
    expect(article.observedAt).to.equal(fetchedAt);
    expect(article.provenanceConfidence).to.equal("high");
  });

  it("keeps unknown publication time explicit instead of treating it as current", () => {
    const [article] = global.W.news._internal.parseRSS(
      "<rss><channel><item><title>No date</title><link>https://example.com/no-date</link></item></channel></rss>",
      "ExampleFeed",
      123,
    );
    expect(article.publishedAt).to.equal(null);
    expect(article.provenanceConfidence).to.equal("partial");
    expect(article.fetchedAt).to.equal(123);
  });
});
