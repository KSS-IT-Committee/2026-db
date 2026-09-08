CREATE TABLE "taiikusai_scores" (
	"program" integer PRIMARY KEY NOT NULL,
	"blue" integer,
	"red" integer,
	"green" integer,
	"white" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
