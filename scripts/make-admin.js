/**
 * Promote a user to admin by email.
 * Usage: node scripts/make-admin.js user@example.com
 */
require("dotenv/config");
const prisma = require("../src/config/db");

async function main() {
  const email = String(process.argv[2] || "")
    .trim()
    .toLowerCase();
  if (!email) {
    console.error("Usage: node scripts/make-admin.js <email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found for email: ${email}`);
    process.exit(1);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { type: "admin" },
  });

  console.log(`OK: ${updated.email} is now type=${updated.type} (id=${updated.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
