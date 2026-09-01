const { expect } = require("chai");

describe("XSS Prevention", () => {
  it("should escape HTML in user input", () => {
    const input = '<script>alert("xss")</script>';
    const escaped = W.fmt.escapeHTML(input);
    expect(escaped).to.not.include("<script>");
    expect(escaped).to.include("&lt;script&gt;");
  });
});
