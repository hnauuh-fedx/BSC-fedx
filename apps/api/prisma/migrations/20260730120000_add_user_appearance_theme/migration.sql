ALTER TABLE "users"
ADD COLUMN "appearance_theme" VARCHAR(30) NOT NULL DEFAULT 'DEFAULT';

ALTER TABLE "users"
ADD CONSTRAINT "users_appearance_theme_check"
CHECK ("appearance_theme" IN ('DEFAULT', 'REMY'));
