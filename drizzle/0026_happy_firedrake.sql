CREATE TABLE "lottery_external_result_checkins" (
	"external_result_id" integer PRIMARY KEY NOT NULL,
	"checked_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_in_by" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "lottery_external_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"lottery_id" varchar(64) NOT NULL,
	"slot_id" varchar(64) NOT NULL,
	"receipt_number" varchar(32) NOT NULL,
	"lottery_number" varchar(16) NOT NULL,
	"act_id" varchar(64) NOT NULL,
	"party_size" integer NOT NULL,
	"choice_rank" integer NOT NULL,
	"drawn_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lottery_external_results_slot_receipt_unique" UNIQUE("lottery_id","slot_id","receipt_number"),
	CONSTRAINT "external_result_party_size_positive" CHECK ("lottery_external_results"."party_size" >= 1),
	CONSTRAINT "external_result_choice_rank_range" CHECK ("lottery_external_results"."choice_rank" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "lottery_result_checkins" (
	"result_id" integer PRIMARY KEY NOT NULL,
	"checked_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_in_by" varchar(32)
);
--> statement-breakpoint
ALTER TABLE "lottery_external_result_checkins" ADD CONSTRAINT "lottery_external_result_checkins_external_result_id_lottery_external_results_id_fk" FOREIGN KEY ("external_result_id") REFERENCES "public"."lottery_external_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_external_result_checkins" ADD CONSTRAINT "lottery_external_result_checkins_checked_in_by_users_username_fk" FOREIGN KEY ("checked_in_by") REFERENCES "public"."users"("username") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_result_checkins" ADD CONSTRAINT "lottery_result_checkins_result_id_lottery_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."lottery_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_result_checkins" ADD CONSTRAINT "lottery_result_checkins_checked_in_by_users_username_fk" FOREIGN KEY ("checked_in_by") REFERENCES "public"."users"("username") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lottery_external_results_lottery_slot_idx" ON "lottery_external_results" USING btree ("lottery_id","slot_id");