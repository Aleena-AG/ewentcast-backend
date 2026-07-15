const {
  createCheckoutSession,
  confirmCheckoutSession,
  createBillingPortal,
  listTransactions,
  getRefundStatus,
  requestRefund,
  handleStripeWebhook,
} = require("../services/billing.service");

async function checkout(req, res, next) {
  try {
    const result = await createCheckoutSession(req.user, req.body || {});
    if (result.already_active) {
      return res.json({
        success: true,
        status: true,
        message: result.message,
      });
    }
    res.json({
      success: true,
      status: true,
      checkout_url: result.checkout_url,
      session_id: result.session_id,
    });
  } catch (err) {
    next(err);
  }
}

async function confirm(req, res, next) {
  try {
    const sessionId = req.body?.session_id || req.body?.sessionId;
    const result = await confirmCheckoutSession(req.user, sessionId);
    res.json({
      success: true,
      status: true,
      ewentcast: result.ewentcast,
    });
  } catch (err) {
    next(err);
  }
}

async function portal(req, res, next) {
  try {
    const result = await createBillingPortal(req.user, req.body?.return_url);
    res.json({
      success: true,
      status: true,
      portal_url: result.portal_url,
      url: result.url,
    });
  } catch (err) {
    next(err);
  }
}

async function transactions(req, res, next) {
  try {
    const result = await listTransactions(req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function refundStatus(req, res, next) {
  try {
    const refund = await getRefundStatus(req.user);
    res.json({ success: true, status: true, refund });
  } catch (err) {
    next(err);
  }
}

async function refundRequest(req, res, next) {
  try {
    const result = await requestRefund(req.user);
    res.json({
      success: true,
      status: true,
      message: result.message,
      refunded_amount: result.refunded_amount,
      account: result.account,
      ewentcast: result.ewentcast,
    });
  } catch (err) {
    next(err);
  }
}

async function stripeWebhook(req, res, next) {
  try {
    const signature = req.headers["stripe-signature"];
    const result = await handleStripeWebhook(req.body, signature);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  checkout,
  confirm,
  portal,
  transactions,
  refundStatus,
  refundRequest,
  stripeWebhook,
};
