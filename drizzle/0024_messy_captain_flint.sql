CREATE TABLE "sousakuten_lost_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"description" text,
	"file_name" varchar(160) NOT NULL,
	"uploaded_by" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sousakuten_lost_items" ADD CONSTRAINT "sousakuten_lost_items_uploaded_by_users_username_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("username") ON DELETE set null ON UPDATE no action;