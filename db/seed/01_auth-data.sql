-- Seed data for auth.users — the bare identity anchor (id + email, no
-- password/token columns; see db/01_auth_storage_shim.sql). auth.identities
-- is gone, so there is nothing else to seed here.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET row_security = off;

COPY auth.users (id, email, created_at, updated_at) FROM stdin;
a4f8d79e-b5da-4b35-8917-315eb68be7db	drishtiagarwal98@gmail.com	2026-08-17 13:19:27.003854+05:30	2026-08-17 16:26:20.589039+05:30
8812718a-e5f8-438a-b8bf-4b0a5314b10d	vaibhavsharma1998@gmail.com	2026-08-12 14:14:28.677514+05:30	2026-08-18 16:25:53.378962+05:30
dc371e39-3e0e-4e95-bf30-c6c3da564997	homerinhome602@gmail.com	2026-08-08 18:27:18.675167+05:30	2026-09-03 20:54:51.451149+05:30
\.
