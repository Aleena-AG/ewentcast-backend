require("dotenv/config");
const fs = require("fs");
const path = require("path");

const apiKey = process.env.POSTMAN_API_KEY;
const collectionUid = "17385817-e0f287ad-1766-4deb-b622-ddfbf6597e8a";

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

local.info = local.info || {};
local.info._postman_id = "e0f287ad-1766-4deb-b622-ddfbf6597e8a";
local.info.name = "Ewentcast API";
local.info.schema =
  local.info.schema ||
  "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";

function countRequests(items) {
  let n = 0;
  for (const it of items || []) {
    if (it.item) n += countRequests(it.item);
    else if (it.request) n += 1;
  }
  return n;
}

async function main() {
  const putRes = await fetch(
    `https://api.getpostman.com/collections/${collectionUid}`,
    {
      method: "PUT",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ collection: local }),
    }
  );

  console.log("PUT", putRes.status);
  if (!putRes.ok) {
    console.error(await putRes.text());
    process.exit(1);
  }

  const getRes = await fetch(
    `https://api.getpostman.com/collections/${collectionUid}`,
    { headers: { "X-Api-Key": apiKey } }
  );
  const data = await getRes.json();
  const folders = (data.collection?.item || []).map((i) => i.name);

  console.log("name:", data.collection?.info?.name);
  console.log("folders:", folders.join(" | "));
  console.log("requests:", countRequests(data.collection?.item));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
