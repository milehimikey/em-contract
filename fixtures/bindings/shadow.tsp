// bind check fixture: a binding that re-declares a contract shape instead of referencing
// it — the silent-drift pattern the shadow-model rule exists to catch (the hand-copied
// request body from em#443's original workaround).
import "../contracts/pricing.tsp";

using Pricing;

namespace PricingBinding {
  // Copies Pricing.SellingPrices field-for-field.
  model SellingPricesCopy {
    priceId: string;
    productId: string;
    price: Money;
  }

  op getSellingPrices(): SellingPricesCopy;
}
