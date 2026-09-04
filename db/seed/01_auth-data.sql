--
-- PostgreSQL database dump
--

\restrict B5IE8dgI6ExQZZ1ckBH1g2IPrvgT8FRMY1AqMv4AV0EJsg2tm4LBkG8EZWFdVjJ

-- Dumped from database version 17.11 (Homebrew)
-- Dumped by pg_dump version 17.11 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at, email_change_token_new, email_change, email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, phone_change, phone_change_token, phone_change_sent_at, email_change_token_current, email_change_confirm_status, banned_until, reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous) FROM stdin;
00000000-0000-0000-0000-000000000000	a4f8d79e-b5da-4b35-8917-315eb68be7db	authenticated	authenticated	drishtiagarwal98@gmail.com	$2a$10$CQLH.T00iLB/CFwMYRhMB.l6nV4MmDuFLP1lOrxMBu1WauikStwV.	2026-08-17 13:33:00.036726+05:30	\N		2026-08-17 13:31:56.202119+05:30		\N			\N	2026-08-17 16:26:20.559049+05:30	{"provider": "email", "providers": ["email"]}	{"sub": "a4f8d79e-b5da-4b35-8917-315eb68be7db", "email": "drishtiagarwal98@gmail.com", "full_name": "Drishti", "email_verified": true, "phone_verified": false}	\N	2026-08-17 13:19:27.003854+05:30	2026-08-17 16:26:20.589039+05:30	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	8812718a-e5f8-438a-b8bf-4b0a5314b10d	authenticated	authenticated	vaibhavsharma1998@gmail.com	$2a$10$De4XBfbnr15lBStEdXywSuU2hcqLwTu5B3YIlfipFjveo4FZyjjAO	2026-08-12 14:15:26.34537+05:30	\N		2026-08-12 14:14:28.752727+05:30		2026-08-12 15:15:20.205752+05:30			\N	2026-08-18 16:25:53.356636+05:30	{"provider": "email", "providers": ["email"]}	{"sub": "8812718a-e5f8-438a-b8bf-4b0a5314b10d", "email": "vaibhavsharma1998@gmail.com", "full_name": "Vaibhav Sharma", "email_verified": true, "phone_verified": false}	\N	2026-08-12 14:14:28.677514+05:30	2026-08-18 16:25:53.378962+05:30	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	dc371e39-3e0e-4e95-bf30-c6c3da564997	authenticated	authenticated	homerinhome602@gmail.com	$2b$10$SaWVuKKq00lohaOCRUbJIe7o1ZtZqIocEjXIx74WvhwE1yB0.nWz.	2026-08-08 18:27:18.701144+05:30	\N		\N		2026-09-04 14:49:48.636664+05:30			\N	2026-08-18 17:05:06.529738+05:30	{"provider": "email", "providers": ["email"]}	{"email_verified": true}	\N	2026-08-08 18:27:18.675167+05:30	2026-09-03 20:54:51.451149+05:30	\N	\N			\N		0	\N		\N	f	\N	f
\.


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id) FROM stdin;
dc371e39-3e0e-4e95-bf30-c6c3da564997	dc371e39-3e0e-4e95-bf30-c6c3da564997	{"sub": "dc371e39-3e0e-4e95-bf30-c6c3da564997", "email": "homerinhome602@gmail.com", "email_verified": false, "phone_verified": false}	email	2026-08-08 18:27:18.69421+05:30	2026-08-08 18:27:18.694266+05:30	2026-08-08 18:27:18.694266+05:30	8e436ba8-3d48-49ec-bcc4-624a16a4b49e
8812718a-e5f8-438a-b8bf-4b0a5314b10d	8812718a-e5f8-438a-b8bf-4b0a5314b10d	{"sub": "8812718a-e5f8-438a-b8bf-4b0a5314b10d", "email": "vaibhavsharma1998@gmail.com", "full_name": "Vaibhav Sharma", "email_verified": false, "phone_verified": false}	email	2026-08-12 14:14:28.733797+05:30	2026-08-12 14:14:28.733864+05:30	2026-08-12 14:14:28.733864+05:30	f9e1152e-d369-43ba-b406-873014ba03a2
a4f8d79e-b5da-4b35-8917-315eb68be7db	a4f8d79e-b5da-4b35-8917-315eb68be7db	{"sub": "a4f8d79e-b5da-4b35-8917-315eb68be7db", "email": "drishtiagarwal98@gmail.com", "full_name": "Drishti", "email_verified": true, "phone_verified": false}	email	2026-08-17 13:19:27.027845+05:30	2026-08-17 13:19:27.027891+05:30	2026-08-17 13:19:27.027891+05:30	28d2781b-a98f-4cc7-84b9-85b64e90a6d3
\.


--
-- PostgreSQL database dump complete
--

\unrestrict B5IE8dgI6ExQZZ1ckBH1g2IPrvgT8FRMY1AqMv4AV0EJsg2tm4LBkG8EZWFdVjJ

