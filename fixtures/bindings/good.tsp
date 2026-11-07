// bind check fixture: an honest binding — augments real contract declarations (built-in
// decorators only, so the fixture doesn't depend on a decorator library) and wraps a
// contract model instead of copying it.
import "../contracts/pricing.tsp";

using Pricing;

@@format(Pricing.SellingPriceDesignated.priceId, "uuid");
@@doc(Pricing.Events.onSellingPriceDesignated, "published on the pricing lifecycle channel");

namespace PricingBinding {
  model Envelope<T> {
    data: T;
    requestId: string;
  }

  op getSellingPricesEnvelope(): Envelope<Pricing.SellingPrices>;
}
