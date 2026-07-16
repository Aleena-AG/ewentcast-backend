const prisma = require("../config/db");
const { getAccountView } = require("./auth.service");

const REFUND_DAYS = Number(process.env.EWENTCAST_MONEY_BACK_DAYS || 14);

function requireStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    const err = new Error(
      "Billing is not configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID on the backend."
    );
    err.statusCode = 503;
    throw err;
  }
  // Lazy require so install without stripe still boots until billing is hit
  // eslint-disable-next-line global-require
  const Stripe = require("stripe");
  return new Stripe(key);
}

async function getOrCreateCustomer(stripe, user) {
  const sub = await prisma.subscription.findUnique({
    where: { userId: user.id },
  });
  if (sub?.stripeCustomerId) {
    return { customerId: sub.stripeCustomerId, sub };
  }

  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: { ewentcast_user_id: String(user.id) },
  });

  const updated = await prisma.subscription.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      stripeCustomerId: customer.id,
      status: "trialing",
      plan: "pro_monthly_20",
    },
    update: { stripeCustomerId: customer.id },
  });

  return { customerId: customer.id, sub: updated };
}

async function createCheckoutSession(user, { success_url, cancel_url }) {
  const stripe = requireStripe();
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    const err = new Error("STRIPE_PRICE_ID is not configured");
    err.statusCode = 503;
    throw err;
  }

  const account = await getAccountView(user.id);
  if (account.subscription_status === "active" && account.subscription_active) {
    return {
      already_active: true,
      message: "Subscription already active",
    };
  }

  const { customerId } = await getOrCreateCustomer(stripe, user);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url:
      success_url ||
      `${process.env.APP_URL || "http://localhost:3000"}/subscribe?success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:
      cancel_url ||
      `${process.env.APP_URL || "http://localhost:3000"}/subscribe?canceled=1`,
    metadata: { ewentcast_user_id: String(user.id) },
    subscription_data: {
      metadata: { ewentcast_user_id: String(user.id) },
    },
  });

  return { checkout_url: session.url, session_id: session.id };
}

async function confirmCheckoutSession(user, sessionId) {
  const stripe = requireStripe();
  if (!sessionId) {
    const err = new Error("session_id is required");
    err.statusCode = 422;
    throw err;
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  });

  if (String(session.metadata?.ewentcast_user_id || "") !== String(user.id)) {
    const err = new Error("Checkout session does not belong to this user");
    err.statusCode = 403;
    throw err;
  }

  if (session.payment_status !== "paid" && session.status !== "complete") {
    const err = new Error("Payment not completed yet");
    err.statusCode = 400;
    throw err;
  }

  const stripeSub =
    typeof session.subscription === "object" ? session.subscription : null;
  const periodEnd = stripeSub?.current_period_end
    ? new Date(stripeSub.current_period_end * 1000)
    : null;

  await prisma.subscription.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      status: "active",
      plan: "pro_monthly_20",
      stripeCustomerId: String(session.customer || ""),
      stripeSubscriptionId: stripeSub ? String(stripeSub.id) : String(session.subscription || ""),
      currentPeriodEnd: periodEnd,
    },
    update: {
      status: "active",
      stripeCustomerId: session.customer ? String(session.customer) : undefined,
      stripeSubscriptionId: stripeSub
        ? String(stripeSub.id)
        : session.subscription
          ? String(session.subscription)
          : undefined,
      currentPeriodEnd: periodEnd || undefined,
    },
  });

  return {
    success: true,
    ewentcast: await getAccountView(user.id),
  };
}

async function createBillingPortal(user, return_url) {
  const stripe = requireStripe();
  const { customerId } = await getOrCreateCustomer(stripe, user);
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url:
      return_url ||
      `${process.env.APP_URL || "http://localhost:3000"}/billing`,
  });
  return { portal_url: session.url, url: session.url };
}

async function listTransactions(user) {
  const stripe = requireStripe();
  const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
  if (!sub?.stripeCustomerId) {
    return { success: true, transactions: [] };
  }

  const invoices = await stripe.invoices.list({
    customer: sub.stripeCustomerId,
    limit: 24,
  });

  const transactions = (invoices.data || []).map((inv) => ({
    id: inv.id,
    amount: (inv.amount_paid || 0) / 100,
    currency: (inv.currency || "usd").toUpperCase(),
    status: inv.status,
    created_at: new Date(inv.created * 1000).toISOString(),
    invoice_url: inv.hosted_invoice_url || null,
    pdf_url: inv.invoice_pdf || null,
  }));

  return { success: true, transactions };
}

async function getRefundStatus(user) {
  const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
  const refundDays = REFUND_DAYS;
  if (!sub) {
    return {
      eligible: false,
      already_refunded: false,
      days_remaining: null,
      refund_days: refundDays,
      first_payment_at: null,
      refund_deadline: null,
      reason: "No subscription",
    };
  }

  if (sub.moneyBackRefundedAt) {
    return {
      eligible: false,
      already_refunded: true,
      days_remaining: 0,
      refund_days: refundDays,
      first_payment_at: sub.createdAt.toISOString(),
      refund_deadline: null,
      reason: "Already refunded",
    };
  }

  if (sub.status !== "active") {
    return {
      eligible: false,
      already_refunded: false,
      days_remaining: null,
      refund_days: refundDays,
      first_payment_at: null,
      refund_deadline: null,
      reason: "Subscription is not active",
    };
  }

  const firstPaymentAt = sub.updatedAt || sub.createdAt;
  const deadline = new Date(firstPaymentAt);
  deadline.setDate(deadline.getDate() + refundDays);
  const remainingMs = deadline.getTime() - Date.now();
  const daysRemaining = Math.max(0, Math.ceil(remainingMs / 86400000));
  const eligible = remainingMs > 0;

  return {
    eligible,
    already_refunded: false,
    days_remaining: daysRemaining,
    refund_days: refundDays,
    first_payment_at: firstPaymentAt.toISOString(),
    refund_deadline: deadline.toISOString(),
    reason: eligible ? null : "Money-back window expired",
  };
}

async function requestRefund(user) {
  const stripe = requireStripe();
  const status = await getRefundStatus(user);
  if (!status.eligible) {
    const err = new Error(status.reason || "Not eligible for refund");
    err.statusCode = 400;
    throw err;
  }

  const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
  if (!sub?.stripeSubscriptionId) {
    const err = new Error("No Stripe subscription to refund");
    err.statusCode = 400;
    throw err;
  }

  const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
  const latestInvoiceId =
    typeof stripeSub.latest_invoice === "string"
      ? stripeSub.latest_invoice
      : stripeSub.latest_invoice?.id;

  let refundedAmount = 0;
  if (latestInvoiceId) {
    const invoice = await stripe.invoices.retrieve(latestInvoiceId);
    const paymentIntent =
      typeof invoice.payment_intent === "string"
        ? invoice.payment_intent
        : invoice.payment_intent?.id;
    if (paymentIntent) {
      const refund = await stripe.refunds.create({ payment_intent: paymentIntent });
      refundedAmount = (refund.amount || 0) / 100;
    }
  }

  await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
  await prisma.subscription.update({
    where: { userId: user.id },
    data: {
      status: "canceled",
      moneyBackRefundedAt: new Date(),
      stripeSubscriptionId: null,
    },
  });

  return {
    success: true,
    message: "Refund processed",
    refunded_amount: refundedAmount,
    account: await getAccountView(user.id),
    ewentcast: await getAccountView(user.id),
  };
}

async function handleStripeWebhook(rawBody, signature) {
  const stripe = requireStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    const err = new Error("STRIPE_WEBHOOK_SECRET not configured");
    err.statusCode = 503;
    throw err;
  }

  const event = stripe.webhooks.constructEvent(rawBody, signature, secret);

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.deleted"
  ) {
    const stripeSub = event.data.object;
    const userId = stripeSub.metadata?.ewentcast_user_id;
    let subRow = null;
    if (userId) {
      subRow = await prisma.subscription.findUnique({
        where: { userId: BigInt(userId) },
      });
    }
    if (!subRow && stripeSub.customer) {
      subRow = await prisma.subscription.findFirst({
        where: { stripeCustomerId: String(stripeSub.customer) },
      });
    }
    if (subRow) {
      let status = "active";
      if (stripeSub.status === "canceled" || event.type === "customer.subscription.deleted") {
        status = "canceled";
      } else if (stripeSub.status === "past_due") {
        status = "past_due";
      } else if (stripeSub.status === "trialing") {
        status = "trialing";
      }

      await prisma.subscription.update({
        where: { userId: subRow.userId },
        data: {
          status,
          stripeSubscriptionId: stripeSub.id,
          currentPeriodEnd: stripeSub.current_period_end
            ? new Date(stripeSub.current_period_end * 1000)
            : undefined,
        },
      });
    }
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.metadata?.ewentcast_user_id;
    if (userId && session.subscription) {
      await prisma.subscription.upsert({
        where: { userId: BigInt(userId) },
        create: {
          userId: BigInt(userId),
          status: "active",
          plan: "pro_monthly_20",
          stripeCustomerId: session.customer ? String(session.customer) : null,
          stripeSubscriptionId: String(session.subscription),
        },
        update: {
          status: "active",
          stripeCustomerId: session.customer ? String(session.customer) : undefined,
          stripeSubscriptionId: String(session.subscription),
        },
      });
    }
  }

  return { received: true };
}

module.exports = {
  createCheckoutSession,
  confirmCheckoutSession,
  createBillingPortal,
  listTransactions,
  getRefundStatus,
  requestRefund,
  handleStripeWebhook,
};
