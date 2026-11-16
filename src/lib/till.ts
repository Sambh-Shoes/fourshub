// The till's money rules. Pure logic with no database, shared by the screen and the server so both always agree.
// All money is in whole cents. Prices include 21% VAT.

export const VAT_PERCENT = 21;
export const STAFF_MAX_DISCOUNT = 30; // percent; more needs a manager
export const QUICK_DISCOUNTS = [5, 10, 15, 20, 30, 40, 50, 70];
export const POINTS_PER_EURO = 0.5; // "Fours Loyalty": 0.5 points for each euro paid
export const REWARD_POINTS = 100; // 100 points ...
export const REWARD_CENTS = 1000; // ... take 10 euros off the ticket
export const MAX_QTY = 20;

export type CartInput = { variantId: number; unitCents: number; qty: number; discount: number };
export type PricedLine = CartInput & { listCents: number; lineCents: number; savedCents: number };

export type Pricing = {
  lines: PricedLine[];
  subtotalCents: number; // after line discounts
  rewards: number; // loyalty rewards used
  rewardCents: number;
  totalCents: number; // what the customer pays, VAT included
  vatCents: number;
  savedCents: number; // line discounts, for the receipt
  pointsSpent: number;
  pointsEarned: number; // 0 without a customer
  maxRewards: number; // how many the customer could use on this ticket
  needsApproval: boolean; // a discount above the staff limit
  errors: string[];
};

export const euroText = (cents: number) =>
  (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

export function priceCart(
  input: CartInput[],
  opts: { hasCustomer: boolean; customerPoints: number; rewards: number },
): Pricing {
  const errors: string[] = [];
  const lines: PricedLine[] = input.map((l) => {
    if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > MAX_QTY) errors.push(`Quantity must be 1 to ${MAX_QTY}.`);
    if (!Number.isInteger(l.discount) || l.discount < 0 || l.discount > 100) errors.push("A discount is 0 to 100 percent.");
    if (!Number.isInteger(l.unitCents) || l.unitCents < 0) errors.push("A price is missing.");
    const listCents = l.unitCents * l.qty;
    const lineCents = Math.round((listCents * (100 - l.discount)) / 100);
    return { ...l, listCents, lineCents, savedCents: listCents - lineCents };
  });
  const subtotalCents = lines.reduce((n, l) => n + l.lineCents, 0);
  const savedCents = lines.reduce((n, l) => n + l.savedCents, 0);

  // A reward is 100 points for 10 euros, never more than the ticket is worth.
  const byPoints = opts.hasCustomer ? Math.floor(opts.customerPoints / REWARD_POINTS) : 0;
  const maxRewards = Math.max(0, Math.min(byPoints, Math.floor(subtotalCents / REWARD_CENTS)));
  const rewards = Math.max(0, Math.min(opts.rewards, maxRewards));
  const rewardCents = rewards * REWARD_CENTS;

  const totalCents = subtotalCents - rewardCents;
  const vatCents = totalCents - Math.round((totalCents * 100) / (100 + VAT_PERCENT));
  const pointsEarned = opts.hasCustomer && totalCents > 0 ? Math.round(totalCents * POINTS_PER_EURO) / 100 : 0;

  return {
    lines, subtotalCents, rewards, rewardCents, totalCents, vatCents, savedCents,
    pointsSpent: rewards * REWARD_POINTS, pointsEarned, maxRewards,
    needsApproval: lines.some((l) => l.discount > STAFF_MAX_DISCOUNT),
    errors: [...new Set(errors)],
  };
}

export type PaymentInput = { cardCents: number; cashGivenCents: number };
export type PaymentResult = { ok: boolean; cashCents: number; cardCents: number; changeCents: number; error?: string };

/** Card is an amount; cash is whatever is left, and the change is what was handed over above it. */
export function settle(totalCents: number, pay: PaymentInput): PaymentResult {
  const card = pay.cardCents;
  const bad = (error: string): PaymentResult => ({ ok: false, cashCents: 0, cardCents: card, changeCents: 0, error });
  if (!Number.isInteger(card) || card < 0 || !Number.isInteger(pay.cashGivenCents) || pay.cashGivenCents < 0) return bad("Check the amounts.");
  if (card > totalCents) return bad("The card amount is more than the ticket.");
  const cashDue = totalCents - card;
  if (pay.cashGivenCents < cashDue) return bad(`${euroText(cashDue - pay.cashGivenCents)} still to pay.`);
  return { ok: true, cashCents: cashDue, cardCents: card, changeCents: pay.cashGivenCents - cashDue };
}
