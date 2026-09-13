const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

for (const name of fs
  .readdirSync(path.join(process.cwd(), ".github/workflows"))
  .sort()) {
  if (!name.endsWith(".yml") && !name.endsWith(".yaml")) continue;
  const file = path.join(process.cwd(), ".github/workflows", name);
  yaml.load(fs.readFileSync(file, "utf8"));
  console.log(`valid ${file}`);
}
