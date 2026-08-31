-- PostgreSQL logical schema for Master Data Platform.
-- This is an architectural baseline for Fase 0.
-- Do not connect this script to production until reviewed.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS mdm;
CREATE SCHEMA IF NOT EXISTS profit_staging;
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TYPE mdm.item_status AS ENUM (
  'PENDING_REVIEW',
  'ACTIVE',
  'INACTIVE',
  'MERGED',
  'REJECTED'
);

CREATE TYPE mdm.request_status AS ENUM (
  'DRAFT',
  'PENDING_MANAGER',
  'MANAGER_APPROVED',
  'PENDING_WAREHOUSE',
  'WAREHOUSE_APPROVED',
  'PENDING_ACCOUNTING',
  'ACCOUNTING_APPROVED',
  'PENDING_FINAL_REVIEW',
  'APPROVED',
  'MASTER_ACTIVE',
  'RETURNED',
  'REJECTED'
);

CREATE TYPE mdm.approval_action AS ENUM (
  'APPROVE',
  'REJECT',
  'RETURN',
  'REQUEST_CHANGES'
);

CREATE TYPE mdm.source_record_status AS ENUM (
  'IMPORTED',
  'NORMALIZED',
  'MATCHED',
  'REVIEW_REQUIRED',
  'LINKED',
  'IGNORED'
);

CREATE TYPE mdm.match_status AS ENUM (
  'NEW',
  'AUTO_CANDIDATE',
  'PENDING_REVIEW',
  'CONFIRMED_SAME',
  'CONFIRMED_DIFFERENT',
  'IGNORED'
);

CREATE TABLE mdm.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(200) NOT NULL,
  code varchar(50) NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mdm.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES mdm.organizations(id),
  name varchar(200) NOT NULL,
  code varchar(50) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE mdm.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES mdm.companies(id),
  name varchar(150) NOT NULL,
  code varchar(50) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (company_id, code)
);

CREATE TABLE mdm.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username varchar(120) NOT NULL UNIQUE,
  display_name varchar(200) NOT NULL,
  email varchar(254),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mdm.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(80) NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  description text
);

CREATE TABLE mdm.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(120) NOT NULL UNIQUE,
  description text
);

CREATE TABLE mdm.user_roles (
  user_id uuid NOT NULL REFERENCES mdm.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES mdm.roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE mdm.role_permissions (
  role_id uuid NOT NULL REFERENCES mdm.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES mdm.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE mdm.catalog_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(50) NOT NULL UNIQUE,
  name varchar(150) NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE mdm.catalog_subgroups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES mdm.catalog_groups(id),
  code varchar(50) NOT NULL,
  name varchar(150) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (group_id, code)
);

CREATE TABLE mdm.catalog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subgroup_id uuid NOT NULL REFERENCES mdm.catalog_subgroups(id),
  code varchar(50) NOT NULL,
  name varchar(150) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (subgroup_id, code)
);

CREATE TABLE mdm.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(150) NOT NULL,
  normalized_name varchar(150) NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE mdm.units_of_measure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(30) NOT NULL UNIQUE,
  name varchar(100) NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE mdm.master_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_code varchar(40) NOT NULL UNIQUE,
  master_description varchar(500) NOT NULL,
  normalized_description varchar(500) NOT NULL,
  status mdm.item_status NOT NULL DEFAULT 'PENDING_REVIEW',
  group_id uuid REFERENCES mdm.catalog_groups(id),
  subgroup_id uuid REFERENCES mdm.catalog_subgroups(id),
  category_id uuid REFERENCES mdm.catalog_categories(id),
  brand_id uuid REFERENCES mdm.brands(id),
  unit_id uuid REFERENCES mdm.units_of_measure(id),
  manufacturer varchar(200),
  model varchar(200),
  part_number varchar(150),
  application text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  merged_into_id uuid REFERENCES mdm.master_items(id),
  created_by uuid REFERENCES mdm.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_master_items_normalized_description
  ON mdm.master_items (normalized_description);

CREATE INDEX idx_master_items_attributes
  ON mdm.master_items USING gin (attributes);

CREATE TABLE profit_staging.sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES mdm.companies(id),
  source_name varchar(150) NOT NULL,
  connection_alias varchar(150) NOT NULL,
  read_only boolean NOT NULL DEFAULT true,
  schema_version varchar(100),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, source_name)
);

CREATE TABLE profit_staging.import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES profit_staging.sources(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status varchar(40) NOT NULL,
  rows_read integer NOT NULL DEFAULT 0,
  rows_imported integer NOT NULL DEFAULT 0,
  rows_failed integer NOT NULL DEFAULT 0,
  error_summary text
);

CREATE TABLE profit_staging.source_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES profit_staging.sources(id),
  import_run_id uuid REFERENCES profit_staging.import_runs(id),
  source_item_id varchar(150) NOT NULL,
  source_code varchar(150),
  original_description text,
  normalized_description text,
  source_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status mdm.source_record_status NOT NULL DEFAULT 'IMPORTED',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, source_item_id)
);

CREATE INDEX idx_source_items_source_code
  ON profit_staging.source_items (source_id, source_code);

CREATE TABLE mdm.master_item_source_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_item_id uuid NOT NULL REFERENCES mdm.master_items(id),
  source_item_id uuid NOT NULL REFERENCES profit_staging.source_items(id),
  relation_type varchar(40) NOT NULL DEFAULT 'EQUIVALENT',
  confidence numeric(5,2),
  confirmed_by uuid REFERENCES mdm.users(id),
  confirmed_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (master_item_id, source_item_id)
);

CREATE UNIQUE INDEX uq_active_source_item_master
  ON mdm.master_item_source_map(source_item_id)
  WHERE active = true;

CREATE TABLE mdm.item_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_item_id uuid NOT NULL REFERENCES mdm.master_items(id),
  alias text NOT NULL,
  normalized_alias text NOT NULL,
  source varchar(80),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_item_aliases_normalized
  ON mdm.item_aliases(normalized_alias);

CREATE TABLE mdm.requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  company_id uuid NOT NULL REFERENCES mdm.companies(id),
  department_id uuid NOT NULL REFERENCES mdm.departments(id),
  requester_id uuid NOT NULL REFERENCES mdm.users(id),
  requested_description text NOT NULL,
  purpose text NOT NULL,
  reference_photo_uri text,
  suggested_master_item_id uuid REFERENCES mdm.master_items(id),
  status mdm.request_status NOT NULL DEFAULT 'DRAFT',
  priority smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mdm.request_data (
  request_id uuid PRIMARY KEY REFERENCES mdm.requests(id) ON DELETE CASCADE,
  group_id uuid REFERENCES mdm.catalog_groups(id),
  subgroup_id uuid REFERENCES mdm.catalog_subgroups(id),
  category_id uuid REFERENCES mdm.catalog_categories(id),
  unit_id uuid REFERENCES mdm.units_of_measure(id),
  brand_id uuid REFERENCES mdm.brands(id),
  model varchar(200),
  manufacturer varchar(200),
  part_number varchar(150),
  application text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  final_description text
);

CREATE TABLE mdm.workflow_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES mdm.requests(id) ON DELETE CASCADE,
  current_step_code varchar(80) NOT NULL,
  current_status varchar(80) NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id)
);

CREATE TABLE mdm.approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES mdm.requests(id) ON DELETE CASCADE,
  step_code varchar(80) NOT NULL,
  actor_id uuid NOT NULL REFERENCES mdm.users(id),
  action mdm.approval_action NOT NULL,
  from_status varchar(80) NOT NULL,
  to_status varchar(80) NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_approvals_request
  ON mdm.approvals(request_id, created_at DESC);

CREATE TABLE mdm.match_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_item_id uuid NOT NULL REFERENCES profit_staging.source_items(id),
  master_item_id uuid NOT NULL REFERENCES mdm.master_items(id),
  score numeric(5,2) NOT NULL,
  status mdm.match_status NOT NULL DEFAULT 'NEW',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  algorithm_version varchar(80),
  reviewed_by uuid REFERENCES mdm.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_item_id, master_item_id)
);

CREATE INDEX idx_match_candidates_source_score
  ON mdm.match_candidates(source_item_id, score DESC);

CREATE TABLE audit.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES mdm.users(id),
  action varchar(120) NOT NULL,
  entity_type varchar(120) NOT NULL,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_events_entity
  ON audit.events(entity_type, entity_id, created_at DESC);

CREATE INDEX idx_audit_events_actor
  ON audit.events(actor_id, created_at DESC);
