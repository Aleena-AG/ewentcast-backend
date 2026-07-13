require("dotenv/config");
const fs = require("fs");
const path = require("path");

const collectionPath = path.join(__dirname, "..", "postman", "Ewentcast-API.postman_collection.json");
const c = JSON.parse(fs.readFileSync(collectionPath, "utf8"));

c.auth = {
  type: "bearer",
  bearer: [{ key: "token", value: "{{authToken}}", type: "string" }],
};

c.info.name = "Ewentcast API — Auth + Channels";
c.info.description =
  "Login/Register auto-saves {{authToken}}. Collection Authorization = Bearer Token {{authToken}}. " +
  "Use Inherit auth from parent on Me and other protected requests. Flow: Login → Me.";

const saveTokenScript = [
  "const j = pm.response.json();",
  "if (pm.response.code === 200 || pm.response.code === 201) {",
  "  if (j.token) {",
  '    pm.collectionVariables.set("authToken", j.token);',
  '    console.log("authToken updated");',
  "  }",
  '  if (j.user && j.user.id) pm.collectionVariables.set("userId", String(j.user.id));',
  '  if (j.verifyToken) pm.collectionVariables.set("verifyToken", j.verifyToken);',
  '  if (j.resetToken) pm.collectionVariables.set("resetToken", j.resetToken);',
  "}",
];

function walk(items) {
  for (const it of items || []) {
    if (it.item) {
      if (it.name === "Auth") {
        // folder itself noauth; each request sets own auth
        it.auth = { type: "noauth" };
      }
      walk(it.item);
      continue;
    }
    if (!it.request) continue;

    const name = it.name || "";
    it.request.header = (it.request.header || []).filter(
      (h) => h.key !== "Authorization" && h.key !== "x-user-id"
    );

    const publicAuth = [
      "Register",
      "Login",
      "Forgot Password",
      "Reset Password",
      "Resend Verification Email",
      "Verify Email (POST)",
      "Verify Email (GET link)",
    ];
    const publicOther =
      name === "Root" ||
      name === "Health Check" ||
      name === "List Webhook Logs" ||
      name.startsWith("Luma") ||
      name.startsWith("Eventbrite") ||
      name.startsWith("Hightribe");

    if (publicAuth.includes(name) || publicOther) {
      it.request.auth = { type: "noauth" };
    } else {
      // Omit auth so Postman inherits Bearer {{authToken}} from collection
      delete it.request.auth;
    }

    if (name === "Login" || name === "Register") {
      it.event = [
        {
          listen: "test",
          script: { type: "text/javascript", exec: saveTokenScript },
        },
      ];
    }
    if (name === "Forgot Password") {
      it.event = [
        {
          listen: "test",
          script: {
            type: "text/javascript",
            exec: [
              "if (pm.response.code === 200) {",
              "  const j = pm.response.json();",
              '  if (j.resetToken) pm.collectionVariables.set("resetToken", j.resetToken);',
              "}",
            ],
          },
        },
      ];
    }
    if (name === "Resend Verification Email") {
      it.event = [
        {
          listen: "test",
          script: {
            type: "text/javascript",
            exec: [
              "if (pm.response.code === 200) {",
              "  const j = pm.response.json();",
              '  if (j.verifyToken) pm.collectionVariables.set("verifyToken", j.verifyToken);',
              "}",
            ],
          },
        },
      ];
    }
  }
}

walk(c.item);
fs.writeFileSync(collectionPath, JSON.stringify(c, null, 2));
console.log("Local collection updated: collection Bearer auth + Login/Register token scripts");

async function push(uid, id, name) {
  const apiKey = process.env.POSTMAN_API_KEY;
  const body = JSON.parse(JSON.stringify(c));
  body.info._postman_id = id;
  body.info.name = name;

  const put = await fetch(`https://api.getpostman.com/collections/${uid}`, {
    method: "PUT",
    headers: {
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ collection: body }),
  });
  console.log(name, "PUT", put.status);
  if (!put.ok) {
    console.error(await put.text());
    return;
  }

  const get = await fetch(`https://api.getpostman.com/collections/${uid}`, {
    headers: { "X-Api-Key": apiKey },
  });
  const d = await get.json();
  const authFolder = (d.collection?.item || []).find((f) => f.name === "Auth");
  const login = (authFolder?.item || []).find((i) => i.name === "Login");
  const me = (authFolder?.item || []).find((i) => i.name === "Me");
  console.log(
    "  auth=",
    d.collection?.auth?.type,
    "loginScript=",
    !!(login?.event || []).find((e) => e.listen === "test"),
    "meAuth=",
    me?.request?.auth?.type || "none"
  );
}

const shouldPush = process.argv.includes("--push");

if (shouldPush) {
  (async () => {
    await push(
      "17385817-e0f287ad-1766-4deb-b622-ddfbf6597e8a",
      "e0f287ad-1766-4deb-b622-ddfbf6597e8a",
      "Ewentcast API — Auth + Channels"
    );
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  console.log("Local only. Re-run with --push to update Postman cloud.");
}
