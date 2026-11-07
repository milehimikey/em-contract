// Hand-authored binding file for the spike: augments the generated contract (built-in
// decorators only) and wraps a contract model in a generic envelope — the two moves the
// binding-file convention (em#447) is built on. The contract file is never touched.

// Per-field augments against generated declarations (TypeSpec `@@` augment decorators).
@@doc(Pricing.SellingPriceDesignated.priceId, "correlates one price's lifecycle");
@@format(Pricing.SellingPriceDesignated.priceId, "uuid");
@@format(Pricing.SellingPriceDesignated.productId, "uuid");

namespace PricingBinding {
  /** Binding-owned response wrapper (shapes stay contract-owned). */
  model Envelope<T> {
    data: T;
    requestId: string;
  }

  /** Binding-owned op referencing a contract model through the wrapper. */
  op getSellingPrices(): Envelope<Pricing.SellingPrices>;
}
