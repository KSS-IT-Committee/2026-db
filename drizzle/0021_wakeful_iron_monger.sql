CREATE TABLE "taiikusai_lost_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"description" text,
	"content_type" varchar(64) NOT NULL,
	"image_bytes" "bytea" NOT NULL,
	"uploaded_by" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
