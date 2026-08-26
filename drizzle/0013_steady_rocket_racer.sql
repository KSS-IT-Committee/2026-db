CREATE TABLE "lottery_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"lottery_id" varchar(64) NOT NULL,
	"slot_id" varchar(64) NOT NULL,
	"username" varchar(32) NOT NULL,
	"applicant_type" "lottery_applicant_type" NOT NULL,
	"act_id" varchar(64) NOT NULL,
	"party_size" integer DEFAULT 1 NOT NULL,
	"choice_rank" integer NOT NULL,
	"is_priority" boolean DEFAULT false NOT NULL,
	"drawn_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lottery_results_slot_applicant_unique" UNIQUE("lottery_id","slot_id","username","applicant_type"),
	CONSTRAINT "result_party_size_positive" CHECK ("lottery_results"."party_size" >= 1),
	CONSTRAINT "result_choice_rank_range" CHECK ("lottery_results"."choice_rank" BETWEEN 1 AND 3)
);
--> statement-breakpoint
ALTER TABLE "lottery_results" ADD CONSTRAINT "lottery_results_username_users_username_fk" FOREIGN KEY ("username") REFERENCES "public"."users"("username") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lottery_results_username_idx" ON "lottery_results" USING btree ("username");--> statement-breakpoint
CREATE INDEX "lottery_results_lottery_slot_idx" ON "lottery_results" USING btree ("lottery_id","slot_id");