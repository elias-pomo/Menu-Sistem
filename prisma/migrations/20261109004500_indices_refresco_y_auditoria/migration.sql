-- CreateIndex
CREATE INDEX "audit_log_business_id_entity_type_entity_id_idx" ON "audit_log"("business_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "customer_order_business_id_updated_at_idx" ON "customer_order"("business_id", "updated_at");

