-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "OptionGroupKind" AS ENUM ('CHOICE', 'REMOVE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'ON_THE_WAY', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Fulfillment" AS ENUM ('PICKUP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER');

-- CreateEnum
CREATE TYPE "CancelReason" AS ENUM ('OUT_OF_STOCK', 'OUT_OF_ZONE', 'CLOSED', 'INVALID_DATA', 'DUPLICATE', 'CUSTOMER_REQUEST', 'OTHER');

-- CreateTable
CREATE TABLE "business" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "address" VARCHAR(160),
    "logo_url" TEXT,
    "primary_color" VARCHAR(7) NOT NULL DEFAULT '#c2410c',
    "whatsapp_e164" VARCHAR(20),
    "accepting_orders" BOOLEAN NOT NULL DEFAULT true,
    "pause_message" VARCHAR(200),
    "delivery_enabled" BOOLEAN NOT NULL DEFAULT false,
    "delivery_fee_cents" INTEGER NOT NULL DEFAULT 0,
    "min_order_cents" INTEGER NOT NULL DEFAULT 0,
    "accept_cash" BOOLEAN NOT NULL DEFAULT true,
    "accept_transfer" BOOLEAN NOT NULL DEFAULT false,
    "transfer_alias" VARCHAR(60),
    "transfer_holder" VARCHAR(80),
    "auto_confirm" BOOLEAN NOT NULL DEFAULT false,
    "pending_alert_minutes" SMALLINT NOT NULL DEFAULT 15,
    "show_photos" BOOLEAN NOT NULL DEFAULT true,
    "show_descriptions" BOOLEAN NOT NULL DEFAULT true,
    "menu_version" INTEGER NOT NULL DEFAULT 1,
    "timezone" VARCHAR(40) NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" CHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent" VARCHAR(300),

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_hit" (
    "id" BIGSERIAL NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_hit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscription" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_hour" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "opens_min" SMALLINT NOT NULL,
    "closes_min" SMALLINT NOT NULL,

    CONSTRAINT "opening_hour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "price_cents" INTEGER NOT NULL,
    "image_url" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_sold_out" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "option_group" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "kind" "OptionGroupKind" NOT NULL DEFAULT 'CHOICE',
    "min_select" SMALLINT NOT NULL DEFAULT 0,
    "max_select" SMALLINT NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "option_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "option" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "price_delta_cents" INTEGER NOT NULL DEFAULT 0,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_option_group" (
    "product_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_option_group_pkey" PRIMARY KEY ("product_id","group_id")
);

-- CreateTable
CREATE TABLE "customer_order" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "public_code" CHAR(4) NOT NULL,
    "public_token" CHAR(22) NOT NULL,
    "client_request_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "fulfillment" "Fulfillment" NOT NULL,
    "customer_name" VARCHAR(80),
    "customer_phone" VARCHAR(20),
    "address_street" VARCHAR(80),
    "address_number" VARCHAR(10),
    "address_neighborhood" VARCHAR(60),
    "address_unit" VARCHAR(20),
    "address_reference" VARCHAR(120),
    "note" VARCHAR(300),
    "payment_method" "PaymentMethod" NOT NULL,
    "cash_change_for_cents" INTEGER,
    "subtotal_cents" INTEGER NOT NULL,
    "delivery_fee_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "estimated_minutes" SMALLINT,
    "paid_at" TIMESTAMPTZ(3),
    "paid_by" UUID,
    "cancel_reason" "CancelReason",
    "cancel_note" VARCHAR(200),
    "anonymized_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMPTZ(3),
    "ready_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customer_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID,
    "product_name" VARCHAR(120) NOT NULL,
    "category_name" VARCHAR(60) NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "options_total_cents" INTEGER NOT NULL,
    "quantity" SMALLINT NOT NULL,
    "line_total_cents" INTEGER NOT NULL,
    "note" VARCHAR(200),
    "position" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "order_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_option" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "option_id" UUID,
    "group_name" VARCHAR(60) NOT NULL,
    "option_name" VARCHAR(80) NOT NULL,
    "kind" "OptionGroupKind" NOT NULL,
    "price_delta_cents" INTEGER NOT NULL,

    CONSTRAINT "order_item_option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "user_id" UUID,
    "reason" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(60) NOT NULL,
    "entity_type" VARCHAR(40) NOT NULL,
    "entity_id" VARCHAR(64),
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_slug_key" ON "business"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- CreateIndex
CREATE INDEX "app_user_business_id_idx" ON "app_user"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_business_id_id_key" ON "app_user"("business_id", "id");

-- CreateIndex
CREATE INDEX "session_user_id_idx" ON "session"("user_id");

-- CreateIndex
CREATE INDEX "session_expires_at_idx" ON "session"("expires_at");

-- CreateIndex
CREATE INDEX "rate_limit_hit_key_created_at_idx" ON "rate_limit_hit"("key", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscription_endpoint_key" ON "push_subscription"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "opening_hour_business_id_weekday_opens_min_key" ON "opening_hour"("business_id", "weekday", "opens_min");

-- CreateIndex
CREATE INDEX "category_business_id_position_idx" ON "category"("business_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "category_business_id_id_key" ON "category"("business_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "product_business_id_id_key" ON "product"("business_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "option_group_business_id_id_key" ON "option_group"("business_id", "id");

-- CreateIndex
CREATE INDEX "option_group_id_position_idx" ON "option"("group_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "option_business_id_id_key" ON "option"("business_id", "id");

-- CreateIndex
CREATE INDEX "product_option_group_business_id_group_id_idx" ON "product_option_group"("business_id", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_order_public_token_key" ON "customer_order"("public_token");

-- CreateIndex
CREATE INDEX "customer_order_business_id_created_at_idx" ON "customer_order"("business_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "customer_order_business_id_customer_phone_idx" ON "customer_order"("business_id", "customer_phone");

-- CreateIndex
CREATE UNIQUE INDEX "customer_order_business_id_id_key" ON "customer_order"("business_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_order_business_id_client_request_id_key" ON "customer_order"("business_id", "client_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_order_business_id_business_date_public_code_key" ON "customer_order"("business_id", "business_date", "public_code");

-- CreateIndex
CREATE INDEX "order_item_order_id_position_idx" ON "order_item"("order_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "order_item_business_id_id_key" ON "order_item"("business_id", "id");

-- CreateIndex
CREATE INDEX "order_item_option_order_item_id_idx" ON "order_item_option"("order_item_id");

-- CreateIndex
CREATE INDEX "order_status_history_order_id_created_at_idx" ON "order_status_history"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_business_id_created_at_idx" ON "audit_log"("business_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_business_id_user_id_fkey" FOREIGN KEY ("business_id", "user_id") REFERENCES "app_user"("business_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_hour" ADD CONSTRAINT "opening_hour_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_business_id_category_id_fkey" FOREIGN KEY ("business_id", "category_id") REFERENCES "category"("business_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_group" ADD CONSTRAINT "option_group_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option" ADD CONSTRAINT "option_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option" ADD CONSTRAINT "option_business_id_group_id_fkey" FOREIGN KEY ("business_id", "group_id") REFERENCES "option_group"("business_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_option_group" ADD CONSTRAINT "product_option_group_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_option_group" ADD CONSTRAINT "product_option_group_business_id_product_id_fkey" FOREIGN KEY ("business_id", "product_id") REFERENCES "product"("business_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_option_group" ADD CONSTRAINT "product_option_group_business_id_group_id_fkey" FOREIGN KEY ("business_id", "group_id") REFERENCES "option_group"("business_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_order" ADD CONSTRAINT "customer_order_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_business_id_order_id_fkey" FOREIGN KEY ("business_id", "order_id") REFERENCES "customer_order"("business_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_option" ADD CONSTRAINT "order_item_option_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_option" ADD CONSTRAINT "order_item_option_business_id_order_item_id_fkey" FOREIGN KEY ("business_id", "order_item_id") REFERENCES "order_item"("business_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_business_id_order_id_fkey" FOREIGN KEY ("business_id", "order_id") REFERENCES "customer_order"("business_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- Restricciones que Prisma no expresa en el esquema (escritas a mano).
-- ===========================================================================

-- business
ALTER TABLE "business"
  ADD CONSTRAINT "business_slug_format" CHECK ("slug" ~ '^[a-z0-9-]{3,40}$'),
  ADD CONSTRAINT "business_slug_reserved" CHECK ("slug" NOT IN ('admin', 'api', 'superadmin', 'static', 'public')),
  ADD CONSTRAINT "business_amounts_positive" CHECK ("delivery_fee_cents" >= 0 AND "min_order_cents" >= 0),
  ADD CONSTRAINT "business_pending_alert_range" CHECK ("pending_alert_minutes" BETWEEN 1 AND 240),
  ADD CONSTRAINT "business_color_format" CHECK ("primary_color" ~ '^#[0-9a-fA-F]{6}$'),
  ADD CONSTRAINT "business_menu_version_positive" CHECK ("menu_version" >= 1);

-- app_user
ALTER TABLE "app_user"
  ADD CONSTRAINT "app_user_email_lowercase" CHECK ("email" = lower("email"));

-- opening_hour
ALTER TABLE "opening_hour"
  ADD CONSTRAINT "opening_hour_weekday_range" CHECK ("weekday" BETWEEN 0 AND 6),
  ADD CONSTRAINT "opening_hour_minutes_range" CHECK ("opens_min" BETWEEN 0 AND 1439 AND "closes_min" BETWEEN 0 AND 1439),
  ADD CONSTRAINT "opening_hour_not_empty" CHECK ("opens_min" <> "closes_min");

-- product
ALTER TABLE "product"
  ADD CONSTRAINT "product_price_positive" CHECK ("price_cents" >= 0),
  ADD CONSTRAINT "product_tags_max" CHECK (cardinality("tags") <= 5);
CREATE INDEX "product_menu_idx" ON "product" ("business_id", "category_id", "position") WHERE "archived_at" IS NULL;

-- option_group y option
ALTER TABLE "option_group"
  ADD CONSTRAINT "option_group_select_range" CHECK ("min_select" >= 0 AND "max_select" >= 1 AND "max_select" >= "min_select");
ALTER TABLE "option"
  ADD CONSTRAINT "option_price_positive" CHECK ("price_delta_cents" >= 0);

-- customer_order
ALTER TABLE "customer_order"
  ADD CONSTRAINT "customer_order_code_format" CHECK ("public_code" ~ '^[A-Z0-9]{4}$'),
  ADD CONSTRAINT "customer_order_amounts_positive" CHECK (
    "subtotal_cents" >= 0 AND "delivery_fee_cents" >= 0 AND "total_cents" >= 0
    AND ("cash_change_for_cents" IS NULL OR "cash_change_for_cents" >= 0)),
  ADD CONSTRAINT "customer_order_total" CHECK ("total_cents" = "subtotal_cents" + "delivery_fee_cents"),
  ADD CONSTRAINT "customer_order_pickup_no_fee" CHECK ("fulfillment" = 'DELIVERY' OR "delivery_fee_cents" = 0),
  -- Un pedido anonimizado pierde los datos personales; uno vigente los tiene completos.
  ADD CONSTRAINT "customer_order_customer_required" CHECK (
    "anonymized_at" IS NOT NULL OR ("customer_name" IS NOT NULL AND "customer_phone" IS NOT NULL)),
  ADD CONSTRAINT "customer_order_address_required" CHECK (
    "fulfillment" = 'PICKUP' OR "anonymized_at" IS NOT NULL
    OR ("address_street" IS NOT NULL AND "address_number" IS NOT NULL AND "address_neighborhood" IS NOT NULL)),
  ADD CONSTRAINT "customer_order_cancel_reason" CHECK (("status" = 'CANCELLED') = ("cancel_reason" IS NOT NULL)),
  ADD CONSTRAINT "customer_order_estimated_range" CHECK ("estimated_minutes" IS NULL OR "estimated_minutes" BETWEEN 1 AND 480),
  ADD CONSTRAINT "customer_order_paid_consistent" CHECK (("paid_at" IS NULL) = ("paid_by" IS NULL));
CREATE INDEX "customer_order_active_idx" ON "customer_order" ("business_id", "status", "created_at")
  WHERE "status" NOT IN ('DELIVERED', 'CANCELLED');

-- order_item y order_item_option
ALTER TABLE "order_item"
  ADD CONSTRAINT "order_item_quantity_range" CHECK ("quantity" BETWEEN 1 AND 20),
  ADD CONSTRAINT "order_item_amounts_positive" CHECK ("unit_price_cents" >= 0 AND "options_total_cents" >= 0),
  ADD CONSTRAINT "order_item_line_total" CHECK ("line_total_cents" = "quantity" * ("unit_price_cents" + "options_total_cents"));
ALTER TABLE "order_item_option"
  ADD CONSTRAINT "order_item_option_price_positive" CHECK ("price_delta_cents" >= 0),
  ADD CONSTRAINT "order_item_option_remove_free" CHECK ("kind" = 'CHOICE' OR "price_delta_cents" = 0);

-- Referencias opcionales al mismo negocio. Prisma exige que una relación sea obligatoria si
-- business_id lo es, y borraría en la próxima migración cualquier FK que no conozca; por eso se
-- validan con un trigger (invisible para Prisma). Una referencia nula no se controla; una no nula
-- debe existir en el mismo negocio. Productos, opciones y usuarios no se borran: se archivan o desactivan.
CREATE FUNCTION "assert_same_business_ref"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  ref uuid := (to_jsonb(NEW) ->> TG_ARGV[1])::uuid;
  found boolean;
BEGIN
  IF ref IS NULL THEN
    RETURN NEW;
  END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE business_id = $1 AND id = $2)', TG_ARGV[0])
    INTO found USING NEW.business_id, ref;
  IF NOT found THEN
    RAISE EXCEPTION '%.% no pertenece al negocio %', TG_TABLE_NAME, TG_ARGV[1], NEW.business_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "order_item_product_same_business" BEFORE INSERT OR UPDATE OF "business_id", "product_id" ON "order_item"
  FOR EACH ROW EXECUTE FUNCTION "assert_same_business_ref"('product', 'product_id');
CREATE TRIGGER "order_item_option_option_same_business" BEFORE INSERT OR UPDATE OF "business_id", "option_id" ON "order_item_option"
  FOR EACH ROW EXECUTE FUNCTION "assert_same_business_ref"('option', 'option_id');
CREATE TRIGGER "customer_order_paid_by_same_business" BEFORE INSERT OR UPDATE OF "business_id", "paid_by" ON "customer_order"
  FOR EACH ROW EXECUTE FUNCTION "assert_same_business_ref"('app_user', 'paid_by');
CREATE TRIGGER "order_status_history_user_same_business" BEFORE INSERT OR UPDATE OF "business_id", "user_id" ON "order_status_history"
  FOR EACH ROW EXECUTE FUNCTION "assert_same_business_ref"('app_user', 'user_id');
CREATE TRIGGER "audit_log_user_same_business" BEFORE INSERT OR UPDATE OF "business_id", "user_id" ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION "assert_same_business_ref"('app_user', 'user_id');
