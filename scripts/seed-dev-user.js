require("dotenv/config");
const prisma = require("../src/config/db");

async function main() {
  const existing = await prisma.user.findUnique({
    where: { email: "dev@ewentcast.test" },
  });
  if (existing) {
    console.log(`USER_ID=${existing.id.toString()}`);
    return;
  }
  const user = await prisma.user.create({
    data: {
      email: "dev@ewentcast.test",
      name: "Dev User",
      passwordHash: "dev-hash",
    },
  });
  console.log(`USER_ID=${user.id.toString()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
