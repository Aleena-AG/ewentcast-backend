require("dotenv/config");

/**
 * Build MySQL connection from discrete env vars (preferred for live/local).
 * Required: DB_HOST, DB_USER, DB_NAME
 * Optional: DB_PORT (3306), DB_PASSWORD, DB_CONNECTION_LIMIT (5)
 */
function getDatabaseConfig() {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const database = process.env.DB_NAME;
  const port = Number(process.env.DB_PORT || 3306);
  const password = process.env.DB_PASSWORD ?? "";
  const connectionLimit = Number(process.env.DB_CONNECTION_LIMIT || 5);

  if (!host || !user || !database) {
    throw new Error(
      "Missing DB config. Set DB_HOST, DB_USER, and DB_NAME in .env (DB_PASSWORD optional)."
    );
  }

  return {
    host,
    port,
    user,
    password,
    database,
    connectionLimit,
  };
}

/** Prisma migrate / prisma.config datasource URL built from DB_* vars. */
function getDatabaseUrl() {
  const { host, port, user, password, database } = getDatabaseConfig();
  const encUser = encodeURIComponent(user);
  const encPass = encodeURIComponent(password);
  const auth = password === "" ? encUser : `${encUser}:${encPass}`;
  return `mysql://${auth}@${host}:${port}/${database}`;
}

module.exports = {
  getDatabaseConfig,
  getDatabaseUrl,
};
