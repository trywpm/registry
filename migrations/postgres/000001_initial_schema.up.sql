CREATE TYPE "public"."package_visibility" AS ENUM('public', 'private');
CREATE TYPE "public"."two_factor_auth_type" AS ENUM('totp', 'webauthn');
CREATE TYPE "public"."package_type" AS ENUM('plugin', 'theme', 'mu-plugin');
CREATE TYPE "public"."package_role" AS ENUM('admin', 'maintainer', 'viewer');
CREATE TYPE "public"."package_status" AS ENUM('active', 'deprecated', 'deleted');
CREATE TYPE "public"."user_status" AS ENUM('active', 'inactive', 'banned', 'locked');

CREATE OR REPLACE FUNCTION update_modified_column() RETURNS TRIGGER AS $$
BEGIN
  NEW.modified = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TABLE "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "username" varchar(39) NOT NULL,
  "full_name" varchar(100),
  "email" varchar(100) NOT NULL,
  "password" TEXT NOT NULL,
  "status" "user_status" DEFAULT 'inactive' NOT NULL,
  "primary_2fa" "two_factor_auth_type" DEFAULT NULL,
  "activation_token" varchar(44),
  "activation_token_expiry" timestamptz,
  "reset_token" varchar(44),
  "reset_token_expiry" timestamptz,
  "created" timestamptz DEFAULT now() NOT NULL,
  "modified" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "users_email_unique" UNIQUE ("email"),
  CONSTRAINT "users_username_unique" UNIQUE ("username")
);
CREATE TRIGGER update_users_modified BEFORE UPDATE ON "users" FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

CREATE TABLE "totp" (
  "secret" varchar(56) NOT NULL,
  "user_id" integer PRIMARY KEY NOT NULL,
  "created" timestamptz DEFAULT now() NOT NULL,
  "modified" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "totp_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
CREATE TRIGGER update_totp_modified BEFORE UPDATE ON "totp" FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

CREATE TABLE "account_recovery_key" (
  "token" varchar(44) NOT NULL,
  "user_id" integer PRIMARY KEY NOT NULL,
  "used" boolean DEFAULT false,
  "created" timestamptz DEFAULT now() NOT NULL,
  "modified" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "account_recovery_key_token_unique" UNIQUE("token"),
  CONSTRAINT "account_recovery_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
CREATE TRIGGER update_account_recovery_key_modified BEFORE UPDATE ON "account_recovery_key" FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

CREATE TABLE "token" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(100) NOT NULL,
  "description" varchar(160),
  "prefix" varchar(6) NOT NULL,
  "token_hash" varchar(44) NOT NULL,
  "allowed_cidrs" cidr[],
  "scopes" text[] NOT NULL,
  "expiry" timestamptz,
  "last_used" timestamptz,
  "user_id" integer NOT NULL,
  "created" timestamptz DEFAULT now() NOT NULL,
  "modified" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "token_token_unique" UNIQUE("token_hash"),
  CONSTRAINT "token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
CREATE TRIGGER update_token_modified BEFORE UPDATE ON "token" FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

CREATE TABLE "package" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(164) NOT NULL,
  "type" "package_type" NOT NULL,
  "status" "package_status" DEFAULT 'active' NOT NULL,
  "visibility" "package_visibility" DEFAULT 'private' NOT NULL,
  "created" timestamptz DEFAULT now() NOT NULL,
  "modified" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "package_name_unique" UNIQUE("name")
);
CREATE TRIGGER update_package_modified BEFORE UPDATE ON "package" FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

CREATE TABLE "package_version" (
  "description" varchar(512),
  "version" varchar(64) NOT NULL,
  "platform" jsonb,
  "license" varchar(100),
  "homepage" varchar(200),
  "tags" text[],
  "team" text[],
  "dependencies" jsonb,
  "devDependencies" jsonb,
  "released_by" integer DEFAULT 2 NOT NULL,
  "dist" jsonb NOT NULL,
  "_wpm" varchar(64) NOT NULL,
  "yanked" boolean DEFAULT false,
  "package_id" integer NOT NULL,
  "created" timestamptz DEFAULT now() NOT NULL,
  "modified" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "package_version_pkey" PRIMARY KEY("package_id","version"),
  CONSTRAINT "package_version_released_by_user_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE set default ON UPDATE no action,
  CONSTRAINT "package_version_package_id_package_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."package"("id") ON DELETE cascade ON UPDATE no action
);
CREATE TRIGGER update_package_version_modified BEFORE UPDATE ON "package_version" FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

CREATE TABLE "package_dist_tag" (
  "tag" varchar(64) NOT NULL,
  "package_id" integer NOT NULL,
  "version" varchar(64) NOT NULL,
  "created" timestamptz DEFAULT now() NOT NULL,
  "modified" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "package_dist_tag_pkey" PRIMARY KEY("tag","package_id"),
  CONSTRAINT "package_dist_tag_package_version_fkey" FOREIGN KEY ("package_id","version") REFERENCES "public"."package_version"("package_id","version") ON DELETE cascade ON UPDATE no action
);
CREATE TRIGGER update_package_dist_tag_modified BEFORE UPDATE ON "package_dist_tag" FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

CREATE TABLE "package_access" (
  "package_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "role" "package_role" NOT NULL,
  "added_by" integer DEFAULT 2 NOT NULL,
  "created" timestamptz DEFAULT now() NOT NULL,
  "modified" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "package_access_pkey" PRIMARY KEY("package_id","user_id"),
  CONSTRAINT "package_access_package_id_package_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."package"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "package_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "package_access_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set default ON UPDATE no action
);
CREATE TRIGGER update_package_access_modified BEFORE UPDATE ON "package_access" FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
