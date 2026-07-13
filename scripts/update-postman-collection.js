require("dotenv/config");
const fs = require("fs");
const path = require("path");

const apiKey = process.env.POSTMAN_API_KEY;
const collectionUid = "17385817-7225f527-33bb-44e6-ab00-c7bae7fb16ee";

if (!apiKey) {
  console.error("POSTMAN_API_KEY missing");
  process.exit(1);
}

const local = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "..", "postman", "Ewentcast-API.postman_collection.json"),
    "utf8"
  )
);

// Keep Postman cloud id stable if present
if (!local.info) local.info = {};
local.info._postman_id = "7225f527-33bb-44e6-ab00-c7bae7fb16ee";
local.info.name = local.info.name || "Ewentcast API";

async function main() {
  const res = await fetch(`https://api.getpostman.com/collections/${collectionUid}`, {
    method: "PUT",
    headers: {
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ collection: local }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    console.error("FAILED", res.status, JSON.stringify(data).slice(0, 1000));
    process.exit(1);
  }

  const vars = (data.collection?.variable || []).filter((v) => v.key === "baseUrl");
  console.log("UPDATED:", data.collection?.info?.name);
  console.log("UID:", data.collection?.info?.uid);
  console.log("baseUrl:", vars[0]?.value || "(missing)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
