ALTER TABLE "groups" ADD COLUMN "invite_token_hash" text;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_invite_token_hash_unique" UNIQUE("invite_token_hash");