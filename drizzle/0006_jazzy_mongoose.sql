CREATE TYPE "public"."lottery_applicant_type" AS ENUM('student', 'parent');--> statement-breakpoint
CREATE TABLE "lottery_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"lottery_id" varchar(64) NOT NULL,
	"slot_id" varchar(64) NOT NULL,
	"username" varchar(32) NOT NULL,
	"applicant_type" "lottery_applicant_type" NOT NULL,
	"first_choice" varchar(64) NOT NULL,
	"second_choice" varchar(64),
	"third_choice" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lottery_entries_slot_applicant_unique" UNIQUE("lottery_id","slot_id","username","applicant_type"),
	CONSTRAINT "choice_ranks_fill_top_down" CHECK ("lottery_entries"."third_choice" IS NULL OR "lottery_entries"."second_choice" IS NOT NULL),
	CONSTRAINT "choices_are_distinct" CHECK ("lottery_entries"."second_choice" IS DISTINCT FROM "lottery_entries"."first_choice" AND "lottery_entries"."third_choice" IS DISTINCT FROM "lottery_entries"."first_choice" AND ("lottery_entries"."third_choice" IS NULL OR "lottery_entries"."second_choice" IS NULL OR "lottery_entries"."third_choice" <> "lottery_entries"."second_choice"))
);
--> statement-breakpoint
ALTER TABLE "lottery_entries" ADD CONSTRAINT "lottery_entries_username_users_username_fk" FOREIGN KEY ("username") REFERENCES "public"."users"("username") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lottery_entries_username_idx" ON "lottery_entries" USING btree ("username");