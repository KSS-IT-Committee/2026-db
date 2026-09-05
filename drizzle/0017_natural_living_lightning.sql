CREATE TYPE "public"."lottery_transfer_status" AS ENUM('pending', 'claimed', 'cancelled', 'declined');--> statement-breakpoint
CREATE TABLE "lottery_ticket_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"result_id" integer NOT NULL,
	"from_username" varchar(32) NOT NULL,
	"to_username" varchar(32) NOT NULL,
	"status" "lottery_transfer_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "transfer_not_to_self" CHECK ("lottery_ticket_transfers"."from_username" <> "lottery_ticket_transfers"."to_username"),
	CONSTRAINT "transfer_resolved_at_matches_status" CHECK (("lottery_ticket_transfers"."status" = 'pending') = ("lottery_ticket_transfers"."resolved_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "lottery_ticket_transfers" ADD CONSTRAINT "lottery_ticket_transfers_result_id_lottery_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."lottery_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_ticket_transfers" ADD CONSTRAINT "lottery_ticket_transfers_from_username_users_username_fk" FOREIGN KEY ("from_username") REFERENCES "public"."users"("username") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_ticket_transfers" ADD CONSTRAINT "lottery_ticket_transfers_to_username_users_username_fk" FOREIGN KEY ("to_username") REFERENCES "public"."users"("username") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lottery_ticket_transfers_one_pending_per_result" ON "lottery_ticket_transfers" USING btree ("result_id") WHERE "lottery_ticket_transfers"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "lottery_ticket_transfers_to_username_idx" ON "lottery_ticket_transfers" USING btree ("to_username");--> statement-breakpoint
CREATE INDEX "lottery_ticket_transfers_from_username_idx" ON "lottery_ticket_transfers" USING btree ("from_username");