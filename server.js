require("dotenv/config");
const app = require("./src/app");

const PORT = process.env.PORT || 5000;

// Local / non-Vercel: start HTTP server. On Vercel, export the app as a function.
if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
