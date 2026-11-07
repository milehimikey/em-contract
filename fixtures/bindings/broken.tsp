// bind check fixture: a binding whose augment targets a field the contract no longer has —
// the drift case where the model dropped/renamed a field and the binding was not updated.
// bind check surfaces the compile error as the finding.
import "../contracts/pricing.tsp";

using Pricing;

@@format(Pricing.SellingPriceDesignated.legacyPriceRef, "uuid");
