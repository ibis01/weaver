const fs = require("fs");
const { JSDOM } = require("jsdom");
const dom = new JSDOM('<div id="view"></div>', {
  url: "http://localhost/#/news",
});
global.window = dom.window;
global.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;
global.location = dom.window.location;
window.W = {
  fmt: {
    escapeHTML: (value) =>
      String(value ?? "").replace(
        /[&<>\"]/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
      ),
  },
  dataHealth: { mark() {} },
  requestGuard: {
    fetch() {
      throw new Error("network disabled");
    },
  },
};
global.W = window.W;
const embedded = fs.readFileSync("js/data/news-snapshot.js", "utf8");
const news = fs.readFileSync("js/features/news.js", "utf8");
new Function(embedded)();
new Function(news)();
const view = document.getElementById("view");
view.dataset.route = "news";
window.W.news.render(view);
const count = view.querySelectorAll(".news-item").length;
console.log(JSON.stringify({ renderedImmediately: count > 0, count }));
if (count === 0) process.exit(1);
