const express = require("express");
const { requireAuth } = require("../middlewares/requireAuth");
const {
  checkout,
  confirm,
  portal,
  transactions,
  refundStatus,
  refundRequest,
} = require("../controllers/billing.controller");

const router = express.Router();

router.use(requireAuth);
router.post("/checkout", checkout);
router.post("/confirm", confirm);
router.post("/portal", portal);
router.get("/transactions", transactions);
router.get("/refund", refundStatus);
router.post("/refund", refundRequest);

module.exports = router;
