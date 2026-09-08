CREATE TABLE "taiikusai_progress" (
	"id" integer PRIMARY KEY NOT NULL,
	"program_id" varchar(32),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "taiikusai_progress_single_row" CHECK ("taiikusai_progress"."id" = 1)
);
