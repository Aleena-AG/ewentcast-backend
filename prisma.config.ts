import "dotenv/config";
import { defineConfig } from "prisma/config";

function buildDatabaseUrl() {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const database = process.env.DB_NAME;
  const port = process.env.DB_PORT || "3306";
  const password = process.env.DB_PASSWORD ?? "";

  if (!host || !user || !database) {
    throw new Error(
      "Missing DB config. Set DB_HOST, DB_USER, and DB_NAME in .env"
    );
  }

  const encUser = encodeURIComponent(user);
  const encPass = encodeURIComponent(password);
  const auth = password === "" ? encUser : `${encUser}:${encPass}`;
  return `mysql://${auth}@${host}:${port}/${database}`;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: buildDatabaseUrl(),
  },
});
