require("dotenv/config");
const fs = require("fs");
const path = require("path");

const collectionPath = path.join(__dirname, "..", "postman", "Ewentcast-API.postman_collection.json");
const collection = JSON.parse(fs.readFileSync(collectionPath, "utf8"));

collection.info.description =
  "Express + Prisma API for Luma, Eventbrite, Hightribe channels.\\n\\n" +
  "**Auth:** Prefer `Authorization: Bearer {{authToken}}` after login/register. " +
  "`x-user-id` still works for legacy calls.\\n\\n" +
  "**Base:** `{{baseUrl}}/api/v1`\\n\\n" +
  "**Local domain:** http://api.ewentcast.test";

const vars = collection.variable || [];
const ensureVar = (key, value) => {
  const existing = vars.find((v) => v.key === key);
  if (existing) existing.value = value;
  else vars.push({ key, value });
};
ensureVar("baseUrl", "http://api.ewentcast.test");
ensureVar("authToken", "");
ensureVar("resetToken", "");
ensureVar("verifyToken", "");
ensureVar("authEmail", "demo@ewentcast.test");
ensureVar("authPassword", "Password123!");
ensureVar("userId", "1");
collection.variable = vars;

const authFolder = {
  name: "Auth",
  description:
    "Full auth flow: register → verify email → login → me → forgot → reset → logout",
  item: [
    {
      name: "Register",
      event: [
        {
          listen: "test",
          script: {
            type: "text/javascript",
            exec: [
              "if (pm.response.code === 201 || pm.response.code === 200) {",
              "  const j = pm.response.json();",
              "  if (j.token) pm.collectionVariables.set('authToken', j.token);",
              "  if (j.user && j.user.id) pm.collectionVariables.set('userId', String(j.user.id));",
              "  if (j.verifyToken) pm.collectionVariables.set('verifyToken', j.verifyToken);",
              "}",
            ],
          },
        },
      ],
      request: {
        method: "POST",
        header: [{ key: "Content-Type", value: "application/json" }],
        body: {
          mode: "raw",
          raw: JSON.stringify(
            {
              name: "Demo User",
              email: "{{authEmail}}",
              password: "{{authPassword}}",
            },
            null,
            2
          ),
        },
        url: "{{baseUrl}}/api/v1/auth/register",
        description: "Creates user + trial subscription + session. Saves authToken + verifyToken.",
      },
    },
    {
      name: "Login",
      event: [
        {
          listen: "test",
          script: {
            type: "text/javascript",
            exec: [
              "if (pm.response.code === 200) {",
              "  const j = pm.response.json();",
              "  if (j.token) pm.collectionVariables.set('authToken', j.token);",
              "  if (j.user && j.user.id) pm.collectionVariables.set('userId', String(j.user.id));",
              "}",
            ],
          },
        },
      ],
      request: {
        method: "POST",
        header: [{ key: "Content-Type", value: "application/json" }],
        body: {
          mode: "raw",
          raw: JSON.stringify(
            {
              email: "{{authEmail}}",
              password: "{{authPassword}}",
            },
            null,
            2
          ),
        },
        url: "{{baseUrl}}/api/v1/auth/login",
      },
    },
    {
      name: "Me",
      request: {
        method: "GET",
        header: [{ key: "Authorization", value: "Bearer {{authToken}}" }],
        url: "{{baseUrl}}/api/v1/auth/me",
      },
    },
    {
      name: "Resend Verification Email",
      event: [
        {
          listen: "test",
          script: {
            type: "text/javascript",
            exec: [
              "if (pm.response.code === 200) {",
              "  const j = pm.response.json();",
              "  if (j.verifyToken) pm.collectionVariables.set('verifyToken', j.verifyToken);",
              "}",
            ],
          },
        },
      ],
      request: {
        method: "POST",
        header: [{ key: "Content-Type", value: "application/json" }],
        body: {
          mode: "raw",
          raw: JSON.stringify({ email: "{{authEmail}}" }, null, 2),
        },
        url: "{{baseUrl}}/api/v1/auth/resend-verification",
      },
    },
    {
      name: "Verify Email (POST)",
      request: {
        method: "POST",
        header: [{ key: "Content-Type", value: "application/json" }],
        body: {
          mode: "raw",
          raw: JSON.stringify({ token: "{{verifyToken}}" }, null, 2),
        },
        url: "{{baseUrl}}/api/v1/auth/verify-email",
      },
    },
    {
      name: "Verify Email (GET link)",
      request: {
        method: "GET",
        header: [],
        url: "{{baseUrl}}/api/v1/auth/verify-email?token={{verifyToken}}",
      },
    },
    {
      name: "Forgot Password",
      event: [
        {
          listen: "test",
          script: {
            type: "text/javascript",
            exec: [
              "if (pm.response.code === 200) {",
              "  const j = pm.response.json();",
              "  if (j.resetToken) pm.collectionVariables.set('resetToken', j.resetToken);",
              "}",
            ],
          },
        },
      ],
      request: {
        method: "POST",
        header: [{ key: "Content-Type", value: "application/json" }],
        body: {
          mode: "raw",
          raw: JSON.stringify({ email: "{{authEmail}}" }, null, 2),
        },
        url: "{{baseUrl}}/api/v1/auth/forgot-password",
        description: "In non-production returns resetToken for testing.",
      },
    },
    {
      name: "Reset Password",
      request: {
        method: "POST",
        header: [{ key: "Content-Type", value: "application/json" }],
        body: {
          mode: "raw",
          raw: JSON.stringify(
            {
              token: "{{resetToken}}",
              password: "Password123!",
            },
            null,
            2
          ),
        },
        url: "{{baseUrl}}/api/v1/auth/reset-password",
      },
    },
    {
      name: "Logout",
      request: {
        method: "POST",
        header: [{ key: "Authorization", value: "Bearer {{authToken}}" }],
        url: "{{baseUrl}}/api/v1/auth/logout",
      },
    },
  ],
};

collection.item = collection.item.filter((f) => f.name !== "Auth");
collection.item.unshift(authFolder);

fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2));
console.log("Local Postman collection updated with Auth folder");
