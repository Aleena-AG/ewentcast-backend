const { PrismaClient } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");
const { getDatabaseConfig } = require("./database");

const db = getDatabaseConfig();

const adapter = new PrismaMariaDb({
  host: db.host,
  port: db.port,
  user: db.user,
  password: db.password,
  database: db.database,
  connectionLimit: db.connectionLimit,
});

const prisma = new PrismaClient({ adapter });

module.exports = prisma;
