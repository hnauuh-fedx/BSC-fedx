ALTER TABLE "users"
ADD CONSTRAINT "users_username_lowercase_check" CHECK ("username" = LOWER("username")),
ADD CONSTRAINT "users_username_format_check" CHECK ("username" ~ '^[a-z0-9._-]{3,50}$');
