ALTER TABLE "borrowings" ADD COLUMN "class" "class_name" NOT NULL;--> statement-breakpoint
CREATE INDEX "class_idx" ON "borrowings" USING btree ("class");