CREATE TYPE "public"."stamp_method" AS ENUM('scan', 'passphrase');--> statement-breakpoint
CREATE TABLE "sousakuten_stamp_passphrases" (
	"spot_id" varchar(64) PRIMARY KEY NOT NULL,
	"passphrase" varchar(64) NOT NULL,
	"updated_by" varchar(32),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sousakuten_stamps" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(32) NOT NULL,
	"spot_id" varchar(64) NOT NULL,
	"method" "stamp_method" NOT NULL,
	"granted_by" varchar(32),
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sousakuten_stamps_username_spot_unique" UNIQUE("username","spot_id"),
	CONSTRAINT "sousakuten_stamps_not_self_granted" CHECK ("sousakuten_stamps"."granted_by" IS NULL OR "sousakuten_stamps"."granted_by" <> "sousakuten_stamps"."username"),
	CONSTRAINT "sousakuten_stamps_passphrase_has_no_granter" CHECK ("sousakuten_stamps"."method" <> 'passphrase' OR "sousakuten_stamps"."granted_by" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "sousakuten_stamp_passphrases" ADD CONSTRAINT "sousakuten_stamp_passphrases_updated_by_users_username_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("username") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sousakuten_stamps" ADD CONSTRAINT "sousakuten_stamps_username_users_username_fk" FOREIGN KEY ("username") REFERENCES "public"."users"("username") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sousakuten_stamps" ADD CONSTRAINT "sousakuten_stamps_granted_by_users_username_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("username") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sousakuten_stamps_username_idx" ON "sousakuten_stamps" USING btree ("username");--> statement-breakpoint
CREATE INDEX "sousakuten_stamps_spot_idx" ON "sousakuten_stamps" USING btree ("spot_id");