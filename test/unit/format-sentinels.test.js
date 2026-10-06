const { expect } = require("chai");
require("../../js/utils/format.js");

// The no-false-precision contract: absent values render as an em-dash,
// real zeros render as real zeros. Both money() and price() must honor
// this. A prior regression shipped a price() guard that referenced
// `amount` (money's parameter) instead of `price`, producing a
// ReferenceError on null/undefined/NaN and passing CI because no test
// exercised that path. This file exists so that failure is caught.

describe("format sentinels — no false precision", () => {
  const EMDASH = "\u2014";

  describe("W.fmt.money", () => {
    it("returns em-dash for null", () => {
      expect(W.fmt.money(null)).to.equal(EMDASH);
    });
    it("returns em-dash for undefined", () => {
      expect(W.fmt.money(undefined)).to.equal(EMDASH);
    });
    it("returns em-dash for NaN", () => {
      expect(W.fmt.money(NaN)).to.equal(EMDASH);
    });
    it("returns em-dash for empty string", () => {
      expect(W.fmt.money("")).to.equal(EMDASH);
    });
    it("returns em-dash for Infinity", () => {
      expect(W.fmt.money(Infinity)).to.equal(EMDASH);
      expect(W.fmt.money(-Infinity)).to.equal(EMDASH);
    });
    it("renders a real zero as $0.00, not em-dash", () => {
      expect(W.fmt.money(0)).to.equal("$0.00");
    });
    it("renders a real positive number", () => {
      expect(W.fmt.money(1234.5)).to.equal("$1,234.50");
    });
    it("does not throw for any of the absent sentinels", () => {
      expect(() => W.fmt.money(null)).to.not.throw();
      expect(() => W.fmt.money(undefined)).to.not.throw();
      expect(() => W.fmt.money(NaN)).to.not.throw();
    });
  });

  describe("W.fmt.price", () => {
    it("returns em-dash for null", () => {
      expect(W.fmt.price(null)).to.equal(EMDASH);
    });
    it("returns em-dash for undefined", () => {
      expect(W.fmt.price(undefined)).to.equal(EMDASH);
    });
    it("returns em-dash for NaN", () => {
      expect(W.fmt.price(NaN)).to.equal(EMDASH);
    });
    it("returns em-dash for empty string", () => {
      expect(W.fmt.price("")).to.equal(EMDASH);
    });
    it("returns em-dash for Infinity", () => {
      expect(W.fmt.price(Infinity)).to.equal(EMDASH);
      expect(W.fmt.price(-Infinity)).to.equal(EMDASH);
    });
    it("renders a real zero", () => {
      expect(W.fmt.price(0)).to.equal("$0.000000");
    });
    it("renders small values at significant precision", () => {
      expect(W.fmt.price(0.00001)).to.equal("$0.000010");
    });
    it("renders a large value at 2 decimals", () => {
      expect(W.fmt.price(65000)).to.equal("$65000.00");
    });
    it("does not throw for any of the absent sentinels", () => {
      expect(() => W.fmt.price(null)).to.not.throw();
      expect(() => W.fmt.price(undefined)).to.not.throw();
      expect(() => W.fmt.price(NaN)).to.not.throw();
    });
  });
});
