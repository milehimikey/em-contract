# em-contract test fixture: a model exercising everything `em-contract augment` reads —
# public events with identity/composite/external DCB tags, `assigned` fields, a declared
# type reachable from the surface, and a tagged-but-internal event (warning path).
#
# Regenerate pricing-export.json from it with:
#   em export fixtures/pricing.em -o fixtures/pricing-export.json
# (committed output generated with em 1.21.0, export schemaVersion 1.20)

model "Pricing"

persona Pricing Admin

context Pricing

type Money {
  amount: decimal
  currency: string
}

slice "Designate Selling Price" {
  ui Price Entry @Pricing Admin
  command Designate Selling Price public {
    priceId: uuid
    productId: uuid
    price: Money
  }
  invariant INV-PRC-1 "a product carries at most one active selling price per currency"
  event Selling Price Designated @Pricing public {
    priceId: uuid tag
    productId: uuid tag
    price: Money
    designatedAt: datetime assigned
  }
  tag productPrice from productId, priceId
  tag priceRuleHash external "hash of rule kind+source+target, order-independent"
}

slice "Audit Price Changes" {
  ui Audit Entry @Pricing Admin
  command Record Price Audit {
    auditId: uuid
    priceId: uuid
  }
  # Internal-only fact with a tag: augment must warn, not emit.
  event Price Audit Recorded @Pricing {
    auditId: uuid tag
    priceId: uuid
  }
}

slice "Review Audit Log" {
  view Price Audit Log {
    auditId: uuid
    priceId: uuid
  } from "Price Audit Recorded"
  ui Audit Log Screen @Pricing Admin
}

slice "View Selling Prices" {
  view Selling Prices public from "Selling Price Designated" {
    priceId: uuid
    productId: uuid
    price: Money
  }
  ui Price List @Pricing Admin
}
