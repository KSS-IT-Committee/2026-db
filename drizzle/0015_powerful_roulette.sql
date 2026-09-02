CREATE TYPE "public"."performance" AS ENUM('A', 'B', 'C', 'D', 'E');--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE 'Geinousai';--> statement-breakpoint
CREATE TABLE "seats" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(32) NOT NULL,
	"performance" "performance" NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seat" text NOT NULL,
	CONSTRAINT "seats_username_performance_unique" UNIQUE("username","performance"),
	CONSTRAINT "seats_performance_seat_unique" UNIQUE("performance","seat")
);
--> statement-breakpoint
ALTER TABLE "seats" ADD CONSTRAINT "seats_username_users_username_fk" FOREIGN KEY ("username") REFERENCES "public"."users"("username") ON DELETE cascade ON UPDATE no action;