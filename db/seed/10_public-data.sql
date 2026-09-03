--
-- PostgreSQL database dump
--

\restrict 5nhYTvh55tozn5Wpvv1c7o3D282aefOAyNscvbooeB4rbWhLefQRPLcza8EMRlN

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
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: -
--

SET SESSION AUTHORIZATION DEFAULT;

ALTER TABLE public.profiles DISABLE TRIGGER ALL;

COPY public.profiles (id, email, full_name, is_dashboard_admin, default_role, is_active, created_at) FROM stdin;
dc371e39-3e0e-4e95-bf30-c6c3da564997	homerinhome602@gmail.com	homerinhome602@gmail.com	t	warehouse_admin	t	2026-08-08 18:27:18.673999+05:30
a4f8d79e-b5da-4b35-8917-315eb68be7db	drishtiagarwal98@gmail.com	Drishti	f	warehouse_admin	t	2026-08-17 13:19:27.002237+05:30
8812718a-e5f8-438a-b8bf-4b0a5314b10d	vaibhavsharma1998@gmail.com	Vaibhav Sharma	f	hvac_engineer	t	2026-08-12 14:14:28.675918+05:30
\.


ALTER TABLE public.profiles ENABLE TRIGGER ALL;

--
-- Data for Name: warehouses; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.warehouses DISABLE TRIGGER ALL;

COPY public.warehouses (id, name, go_live_date, snag_counter, site_location, created_by, created_at, is_active) FROM stdin;
da37cb72-b6fa-40bb-87d4-c6badc075e41	Nagpur frozen DC	\N	0	\N	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-08 18:39:12.182791+05:30	t
ce6dd705-1fb3-48f7-9658-310f26439cd6	raiser	\N	1	\N	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-09 01:33:27.247987+05:30	t
1b43d12b-bd23-4f7f-beb5-9ac1c06fb485	CPC-LDH4	\N	0	\N	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-12 15:01:28.88716+05:30	t
8f25ba18-4b57-45ca-a243-b6b36ef43355	Bhiwandi cold store 1	2026-09-10	9	\N	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-08 18:40:52.337409+05:30	t
\.


ALTER TABLE public.warehouses ENABLE TRIGGER ALL;

--
-- Data for Name: snags; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.snags DISABLE TRIGGER ALL;

COPY public.snags (id, warehouse_id, serial_no, date_raised, raised_by, description, category, sub_category, sub_category_other, location, scope, severity, status, etc_date, verified_by, verified_at, closed_at, created_at, updated_at) FROM stdin;
220c3468-5ef5-4c62-aa0d-805fb8d89f3c	8f25ba18-4b57-45ca-a243-b6b36ef43355	1	2026-08-08	dc371e39-3e0e-4e95-bf30-c6c3da564997	Evaporator fan not coming back on after defrost cycle in chamber 1	hvac	odu	\N	frozen_chamber	infra	high	closed	\N	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-08 19:08:44.436234+05:30	2026-08-08 19:08:44.436234+05:30	2026-08-08 18:49:49.074102+05:30	2026-08-08 19:08:44.436234+05:30
50200924-9c08-4687-89c1-171dcb93abe6	8f25ba18-4b57-45ca-a243-b6b36ef43355	5	2026-08-08	dc371e39-3e0e-4e95-bf30-c6c3da564997	Evaporator fan not coming back on after defrost cycle	hvac	odu	\N	frozen_chamber	infra	high	closed	\N	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-09 00:30:49.658934+05:30	2026-08-09 00:30:49.658934+05:30	2026-08-09 00:04:54.884451+05:30	2026-08-09 00:30:49.658934+05:30
1ea83126-fda3-44ee-85b9-f37554c8f0f1	ce6dd705-1fb3-48f7-9658-310f26439cd6	1	2026-08-08	dc371e39-3e0e-4e95-bf30-c6c3da564997	fds	hvac	odu	\N	frozen_chamber	infra	medium	open	\N	\N	\N	\N	2026-08-09 01:33:42.040505+05:30	2026-08-09 01:33:42.040505+05:30
e4f1774c-eb84-4fe8-af4a-9a12f4f532b9	8f25ba18-4b57-45ca-a243-b6b36ef43355	6	2026-08-08	dc371e39-3e0e-4e95-bf30-c6c3da564997	Batch 2 test snag: verifying auto-dismiss banner	hvac	odu	\N	frozen_chamber	infra	medium	closed	\N	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-09 09:09:37.900012+05:30	2026-08-09 09:09:37.900012+05:30	2026-08-09 01:59:51.568124+05:30	2026-08-09 09:09:37.900012+05:30
a118859f-10f4-41f8-8ea6-dae689ed9832	8f25ba18-4b57-45ca-a243-b6b36ef43355	7	2026-08-09	dc371e39-3e0e-4e95-bf30-c6c3da564997	the issue is that there is np diamond clamp used across the warwehpsue and the pipes will vibrate.	hvac	piping	\N	odu_area	oem	high	closed	\N	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-09 09:10:04.123637+05:30	2026-08-09 09:10:04.123637+05:30	2026-08-09 09:04:38.355784+05:30	2026-08-09 09:10:04.123637+05:30
4ca7ddb0-0202-433f-b0d3-562dc043aa42	8f25ba18-4b57-45ca-a243-b6b36ef43355	4	2026-08-08	dc371e39-3e0e-4e95-bf30-c6c3da564997	Door seal torn on chamber 2 entry, ambient air ingress suspected	hvac	odu	\N	frozen_chamber	infra	medium	closed	\N	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-09 09:36:09.91156+05:30	2026-08-09 09:36:09.91156+05:30	2026-08-08 19:42:49.440067+05:30	2026-08-09 09:36:09.91156+05:30
a471d587-2f0a-419b-9c27-c88b2c224b6e	8f25ba18-4b57-45ca-a243-b6b36ef43355	2	2026-08-08	dc371e39-3e0e-4e95-bf30-c6c3da564997	Door seal torn on chamber 2 entry, ambient air ingress suspected.	hvac	odu	\N	frozen_chamber	infra	medium	closed	\N	8812718a-e5f8-438a-b8bf-4b0a5314b10d	2026-08-17 11:46:58.398441+05:30	2026-08-17 11:46:58.398441+05:30	2026-08-08 19:21:29.837102+05:30	2026-08-17 11:46:58.398441+05:30
044a6a4e-b455-4464-97ee-d3ed40e69522	8f25ba18-4b57-45ca-a243-b6b36ef43355	3	2026-08-08	dc371e39-3e0e-4e95-bf30-c6c3da564997	Offline test: rack upright dented aisle 3.	hvac	odu	\N	frozen_chamber	infra	medium	closed	\N	8812718a-e5f8-438a-b8bf-4b0a5314b10d	2026-08-17 12:07:43.722637+05:30	2026-08-17 12:07:43.722637+05:30	2026-08-08 19:29:11.341391+05:30	2026-08-17 12:07:43.722637+05:30
7e45f6a5-d1a1-4f6d-8718-37117f24dc93	8f25ba18-4b57-45ca-a243-b6b36ef43355	8	2026-08-12	8812718a-e5f8-438a-b8bf-4b0a5314b10d	fan breakdown	hvac	odu	\N	frozen_chamber	oem	medium	wip	2026-08-31	\N	\N	\N	2026-08-12 14:57:34.011818+05:30	2026-08-17 16:29:24.370062+05:30
7fcbf962-615b-4c9a-bc1b-cdd965c20f4e	8f25ba18-4b57-45ca-a243-b6b36ef43355	9	2026-08-18	dc371e39-3e0e-4e95-bf30-c6c3da564997	expansion valve is not working	hvac	others	camera	frozen_chamber	infra	high	closed	2026-08-19	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-18 12:21:15.27043+05:30	2026-08-18 12:21:15.27043+05:30	2026-08-18 12:19:51.479208+05:30	2026-08-18 12:21:15.27043+05:30
\.


ALTER TABLE public.snags ENABLE TRIGGER ALL;

--
-- Data for Name: snag_updates; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.snag_updates DISABLE TRIGGER ALL;

COPY public.snag_updates (id, snag_id, body, author_id, created_at, author_side) FROM stdin;
1d876362-2ca4-4ae2-8b97-a6795786d3ee	220c3468-5ef5-4c62-aa0d-805fb8d89f3c	Motor replaced. Running two defrost cycles to confirm before closing.	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-08 19:05:16.83494+05:30	admin
2e160987-ccf7-47ee-98a7-a1c5ea069c66	220c3468-5ef5-4c62-aa0d-805fb8d89f3c	Motor replaced. Running two defrost cycles to confirm before closing.	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-08 19:07:16.633856+05:30	admin
737d4953-7f60-4d40-8622-38424f55712c	220c3468-5ef5-4c62-aa0d-805fb8d89f3c	Both defrost cycles completed with no fault. Ready for sign-off.	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-08 19:08:19.53658+05:30	admin
18bd4add-7e09-43ff-8a68-2331b0bdd7c5	50200924-9c08-4687-89c1-171dcb93abe6	work done	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-09 00:30:32.366719+05:30	admin
0a045b9d-d809-4697-9f75-563811e4b68c	a471d587-2f0a-419b-9c27-c88b2c224b6e	nice	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-09 03:01:42.370328+05:30	admin
4f308265-3aa2-45a5-9d4e-7c9c52feef4e	e4f1774c-eb84-4fe8-af4a-9a12f4f532b9	gg	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-09 09:09:16.522833+05:30	admin
bc3c179b-175d-473e-a664-4cbaab90b608	a118859f-10f4-41f8-8ea6-dae689ed9832	dd	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-09 09:09:55.263353+05:30	admin
b012f709-e1a1-4a61-9650-b22e02ea90d4	a118859f-10f4-41f8-8ea6-dae689ed9832	dd	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-09 09:09:59.445469+05:30	admin
22a67b8d-1569-41d3-afbf-0277e29710ae	7e45f6a5-d1a1-4f6d-8718-37117f24dc93	issue still exists and has not been resolved	8812718a-e5f8-438a-b8bf-4b0a5314b10d	2026-08-17 12:26:01.826261+05:30	reporter
621a0377-be96-45d7-a588-59543d9f9bdf	7e45f6a5-d1a1-4f6d-8718-37117f24dc93	issue still persists and need to type a long text to check the scrolling framework so typing a long message here	8812718a-e5f8-438a-b8bf-4b0a5314b10d	2026-08-17 12:29:39.930789+05:30	reporter
785bf6cb-5c73-4d4f-91ee-290ee0a803d5	7e45f6a5-d1a1-4f6d-8718-37117f24dc93	check	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-17 13:06:29.112909+05:30	admin
2d1f04b5-82ec-48ce-b8fa-ecb65df48f81	7e45f6a5-d1a1-4f6d-8718-37117f24dc93	hello	a4f8d79e-b5da-4b35-8917-315eb68be7db	2026-08-17 16:29:24.370062+05:30	resolver
3a141609-cfae-46b9-8234-4e3b05eae0e6	7e45f6a5-d1a1-4f6d-8718-37117f24dc93	testing multi-photo attach	a4f8d79e-b5da-4b35-8917-315eb68be7db	2026-08-17 16:41:27.152411+05:30	resolver
3406e778-f242-43a1-8f37-f9ebdc246c1e	7e45f6a5-d1a1-4f6d-8718-37117f24dc93	testing refresh fix	a4f8d79e-b5da-4b35-8917-315eb68be7db	2026-08-17 17:11:10.339121+05:30	resolver
3fa73d6f-7160-4229-91fe-d65a32a96b6f	7e45f6a5-d1a1-4f6d-8718-37117f24dc93	the issue still exists	8812718a-e5f8-438a-b8bf-4b0a5314b10d	2026-08-18 11:48:38.657941+05:30	reporter
b6319b52-3ab6-4b49-849f-b6050bfb27b4	7fcbf962-615b-4c9a-bc1b-cdd965c20f4e	the import is success	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-18 12:20:23.023266+05:30	admin
6305efe5-6053-4b4c-b9f0-26902250cc05	7fcbf962-615b-4c9a-bc1b-cdd965c20f4e	yes	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-18 12:20:53.568398+05:30	admin
b238fd0d-6004-4a98-a547-a45f827fc9bd	7fcbf962-615b-4c9a-bc1b-cdd965c20f4e	pls close	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-18 12:21:08.096766+05:30	admin
\.


ALTER TABLE public.snag_updates ENABLE TRIGGER ALL;

--
-- Data for Name: attachments; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.attachments DISABLE TRIGGER ALL;

COPY public.attachments (id, snag_id, update_id, media_type, file_url, original_url, thumbnail_url, file_name, file_size, duration_seconds, uploaded_by, created_at) FROM stdin;
8bde812a-569e-4238-9d99-ed96934add9d	a471d587-2f0a-419b-9c27-c88b2c224b6e	\N	image	8f25ba18-4b57-45ca-a243-b6b36ef43355/a471d587-2f0a-419b-9c27-c88b2c224b6e/4996cd52.jpg	8f25ba18-4b57-45ca-a243-b6b36ef43355/a471d587-2f0a-419b-9c27-c88b2c224b6e/4996cd52-original.jpg	8f25ba18-4b57-45ca-a243-b6b36ef43355/a471d587-2f0a-419b-9c27-c88b2c224b6e/4996cd52-thumb.jpg	snag-photo.jpg	\N	\N	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-08 19:21:30.587609+05:30
84bb328b-6308-49e6-8e88-b78cc06da8b2	7e45f6a5-d1a1-4f6d-8718-37117f24dc93	3a141609-cfae-46b9-8234-4e3b05eae0e6	image	8f25ba18-4b57-45ca-a243-b6b36ef43355/7e45f6a5-d1a1-4f6d-8718-37117f24dc93/30dff004.jpg	8f25ba18-4b57-45ca-a243-b6b36ef43355/7e45f6a5-d1a1-4f6d-8718-37117f24dc93/30dff004-original.jpg	8f25ba18-4b57-45ca-a243-b6b36ef43355/7e45f6a5-d1a1-4f6d-8718-37117f24dc93/30dff004-thumb.jpg	snag-photo-1.jpg	\N	\N	a4f8d79e-b5da-4b35-8917-315eb68be7db	2026-08-17 16:41:27.966121+05:30
e25d2548-e999-4ee9-abcf-27e5125c87d1	7e45f6a5-d1a1-4f6d-8718-37117f24dc93	3a141609-cfae-46b9-8234-4e3b05eae0e6	image	8f25ba18-4b57-45ca-a243-b6b36ef43355/7e45f6a5-d1a1-4f6d-8718-37117f24dc93/3dfc082f.jpg	8f25ba18-4b57-45ca-a243-b6b36ef43355/7e45f6a5-d1a1-4f6d-8718-37117f24dc93/3dfc082f-original.jpg	8f25ba18-4b57-45ca-a243-b6b36ef43355/7e45f6a5-d1a1-4f6d-8718-37117f24dc93/3dfc082f-thumb.jpg	snag-photo-2.jpg	\N	\N	a4f8d79e-b5da-4b35-8917-315eb68be7db	2026-08-17 16:41:28.910256+05:30
961f3f85-3ebd-4367-8b62-4227a8a2bbba	7e45f6a5-d1a1-4f6d-8718-37117f24dc93	3406e778-f242-43a1-8f37-f9ebdc246c1e	image	8f25ba18-4b57-45ca-a243-b6b36ef43355/7e45f6a5-d1a1-4f6d-8718-37117f24dc93/84d915af.jpg	8f25ba18-4b57-45ca-a243-b6b36ef43355/7e45f6a5-d1a1-4f6d-8718-37117f24dc93/84d915af-original.jpg	8f25ba18-4b57-45ca-a243-b6b36ef43355/7e45f6a5-d1a1-4f6d-8718-37117f24dc93/84d915af-thumb.jpg	snag-photo-1.jpg	\N	\N	a4f8d79e-b5da-4b35-8917-315eb68be7db	2026-08-17 17:11:11.281622+05:30
eb67d8fd-2a59-49ab-a713-aa3a9a8f148d	7e45f6a5-d1a1-4f6d-8718-37117f24dc93	3fa73d6f-7160-4229-91fe-d65a32a96b6f	image	8f25ba18-4b57-45ca-a243-b6b36ef43355/7e45f6a5-d1a1-4f6d-8718-37117f24dc93/4595ba48.jpg	8f25ba18-4b57-45ca-a243-b6b36ef43355/7e45f6a5-d1a1-4f6d-8718-37117f24dc93/4595ba48-original.jpg	8f25ba18-4b57-45ca-a243-b6b36ef43355/7e45f6a5-d1a1-4f6d-8718-37117f24dc93/4595ba48-thumb.jpg	snag-photo.jpg	\N	\N	8812718a-e5f8-438a-b8bf-4b0a5314b10d	2026-08-18 11:48:39.712399+05:30
\.


ALTER TABLE public.attachments ENABLE TRIGGER ALL;

--
-- Data for Name: invitations; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.invitations DISABLE TRIGGER ALL;

COPY public.invitations (id, email, default_role, grant_dashboard_admin, invited_by, created_at, accepted_at, warehouse_ids) FROM stdin;
d3e8e9f8-9b5c-4c08-a88b-21d1c7cb3194	priya@company.com	pmo	f	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-08 18:42:50.065749+05:30	\N	{}
a24a4209-adbd-4845-b001-8824f1730567	h@comp.com	pmc	t	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-09 02:31:02.222654+05:30	\N	{}
694ceb6b-1e54-40d0-855b-f2189cd90118	vaibhavsharma1998@gmail.com	hvac_engineer	f	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-11 12:57:46.191507+05:30	2026-08-12 14:14:28.675918+05:30	{}
bd743503-c2c5-455b-8ef6-9839fab3c62b	homerinhome602@gmail.com	\N	t	\N	2026-08-08 17:41:46.981522+05:30	2026-08-08 18:27:18.673999+05:30	{}
37169dd1-a31d-42ea-aa87-1725371296ee	drishtiagarwal98@gmail.com	pmo	f	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-17 13:18:51.667062+05:30	2026-08-17 13:19:27.002237+05:30	{}
084f36a9-3134-43af-ab57-5111ac833001	sample@gmail.com	pmc	f	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-18 17:50:49.294349+05:30	\N	{1b43d12b-bd23-4f7f-beb5-9ac1c06fb485}
\.


ALTER TABLE public.invitations ENABLE TRIGGER ALL;

--
-- Data for Name: people_activity; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.people_activity DISABLE TRIGGER ALL;

COPY public.people_activity (id, email, actor_id, action, detail, created_at) FROM stdin;
dd6ceb0b-0998-4c62-9aba-bb518908b043	vaibhavsharma1998@gmail.com	dc371e39-3e0e-4e95-bf30-c6c3da564997	warehouse_added	Tagged to Nagpur frozen DC	2026-08-18 17:49:12.932271+05:30
c600186b-ea3e-4c93-9b69-e072128ca396	sample@gmail.com	dc371e39-3e0e-4e95-bf30-c6c3da564997	invited	Invited as PMC, tagged to CPC-LDH4	2026-08-18 17:50:49.704552+05:30
\.


ALTER TABLE public.people_activity ENABLE TRIGGER ALL;

--
-- Data for Name: snag_activity; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.snag_activity DISABLE TRIGGER ALL;

COPY public.snag_activity (id, snag_id, actor_id, action, field, old_value, new_value, created_at) FROM stdin;
06db7753-9fec-4440-b356-fb42858e13bc	220c3468-5ef5-4c62-aa0d-805fb8d89f3c	dc371e39-3e0e-4e95-bf30-c6c3da564997	raise	\N	\N	\N	2026-08-08 18:49:49.074102+05:30
c6360a8f-7e1d-48c5-9534-3f4b14a2314a	220c3468-5ef5-4c62-aa0d-805fb8d89f3c	dc371e39-3e0e-4e95-bf30-c6c3da564997	status_change	status	open	wip	2026-08-08 19:05:16.83494+05:30
656f9ac4-2dbe-42f7-a4ed-5842a5a497c6	220c3468-5ef5-4c62-aa0d-805fb8d89f3c	dc371e39-3e0e-4e95-bf30-c6c3da564997	status_change	status	wip	ready_to_close	2026-08-08 19:08:19.53658+05:30
9b7cd520-d9b0-4bcd-a1b4-07c9c16a6434	220c3468-5ef5-4c62-aa0d-805fb8d89f3c	dc371e39-3e0e-4e95-bf30-c6c3da564997	verify_closure	status	ready_to_close	closed	2026-08-08 19:08:44.436234+05:30
e83ea31b-2e74-4bc3-9913-f4be08cff267	a471d587-2f0a-419b-9c27-c88b2c224b6e	dc371e39-3e0e-4e95-bf30-c6c3da564997	raise	\N	\N	\N	2026-08-08 19:21:29.837102+05:30
e0d252fa-d2f4-4752-88c6-5d51109c2827	044a6a4e-b455-4464-97ee-d3ed40e69522	dc371e39-3e0e-4e95-bf30-c6c3da564997	raise	\N	\N	\N	2026-08-08 19:29:11.341391+05:30
8e51adfc-84bf-4ccf-941f-227a67f0907d	4ca7ddb0-0202-433f-b0d3-562dc043aa42	dc371e39-3e0e-4e95-bf30-c6c3da564997	raise	\N	\N	\N	2026-08-08 19:42:49.440067+05:30
f83888f4-ed55-4dea-8d1e-425f2d35e588	4ca7ddb0-0202-433f-b0d3-562dc043aa42	dc371e39-3e0e-4e95-bf30-c6c3da564997	duplicate_suppressed	duplicate_of	\N	a471d587-2f0a-419b-9c27-c88b2c224b6e	2026-08-08 19:42:49.440067+05:30
d068b29e-ad37-4269-acf8-2cd7f7b3cac3	50200924-9c08-4687-89c1-171dcb93abe6	dc371e39-3e0e-4e95-bf30-c6c3da564997	raise	\N	\N	\N	2026-08-09 00:04:54.884451+05:30
e16d8aef-c7a5-4dbc-951b-a5fddbd5ec34	50200924-9c08-4687-89c1-171dcb93abe6	dc371e39-3e0e-4e95-bf30-c6c3da564997	status_change	status	open	ready_to_close	2026-08-09 00:30:32.366719+05:30
a4541f72-7c24-4cf2-8494-4dbcacbfa622	50200924-9c08-4687-89c1-171dcb93abe6	dc371e39-3e0e-4e95-bf30-c6c3da564997	verify_closure	status	ready_to_close	closed	2026-08-09 00:30:49.658934+05:30
4e1e9ddb-d71f-4173-a647-9e5cea1286e5	1ea83126-fda3-44ee-85b9-f37554c8f0f1	dc371e39-3e0e-4e95-bf30-c6c3da564997	raise	\N	\N	\N	2026-08-09 01:33:42.040505+05:30
d0ccf09b-fba0-411f-a6b7-a44942cd5d29	e4f1774c-eb84-4fe8-af4a-9a12f4f532b9	dc371e39-3e0e-4e95-bf30-c6c3da564997	raise	\N	\N	\N	2026-08-09 01:59:51.568124+05:30
1e4be35b-c1b9-4f5d-8ef9-170ff7690937	a118859f-10f4-41f8-8ea6-dae689ed9832	dc371e39-3e0e-4e95-bf30-c6c3da564997	raise	\N	\N	\N	2026-08-09 09:04:38.355784+05:30
142668ac-c3cb-4aab-836e-377a5113dc36	e4f1774c-eb84-4fe8-af4a-9a12f4f532b9	dc371e39-3e0e-4e95-bf30-c6c3da564997	status_change	status	open	ready_to_close	2026-08-09 09:09:16.522833+05:30
95d38b54-63b2-4559-9449-cbf9ffe9b4cd	e4f1774c-eb84-4fe8-af4a-9a12f4f532b9	dc371e39-3e0e-4e95-bf30-c6c3da564997	verify_closure	status	ready_to_close	closed	2026-08-09 09:09:37.900012+05:30
9857b07c-0e3e-49ff-a172-052c3796684e	a118859f-10f4-41f8-8ea6-dae689ed9832	dc371e39-3e0e-4e95-bf30-c6c3da564997	status_change	status	open	ready_to_close	2026-08-09 09:09:59.445469+05:30
682f9bde-e5bc-4681-821c-274be8be4873	a118859f-10f4-41f8-8ea6-dae689ed9832	dc371e39-3e0e-4e95-bf30-c6c3da564997	verify_closure	status	ready_to_close	closed	2026-08-09 09:10:04.123637+05:30
47a0b60f-72d7-4404-8ba1-2c7dde0c2bbf	4ca7ddb0-0202-433f-b0d3-562dc043aa42	dc371e39-3e0e-4e95-bf30-c6c3da564997	verify_closure	status	open	closed	2026-08-09 09:36:09.91156+05:30
64154b97-1f56-4fda-a34e-0b9948f45bb1	7e45f6a5-d1a1-4f6d-8718-37117f24dc93	8812718a-e5f8-438a-b8bf-4b0a5314b10d	raise	\N	\N	\N	2026-08-12 14:57:34.011818+05:30
fc6734f3-b5b0-4167-8694-221decc93738	a471d587-2f0a-419b-9c27-c88b2c224b6e	8812718a-e5f8-438a-b8bf-4b0a5314b10d	verify_closure	status	open	closed	2026-08-17 11:46:58.398441+05:30
25f228f6-66c6-4c95-8fe7-f52befdfd01d	044a6a4e-b455-4464-97ee-d3ed40e69522	8812718a-e5f8-438a-b8bf-4b0a5314b10d	verify_closure	status	open	closed	2026-08-17 12:07:43.722637+05:30
b13ccecb-4b95-45f8-b9a3-48478ca4589c	7e45f6a5-d1a1-4f6d-8718-37117f24dc93	dc371e39-3e0e-4e95-bf30-c6c3da564997	status_change	status	open	ready_to_close	2026-08-17 13:06:29.112909+05:30
604f053d-1c18-49ac-a36a-9673cb6c793d	7e45f6a5-d1a1-4f6d-8718-37117f24dc93	dc371e39-3e0e-4e95-bf30-c6c3da564997	etc_update	etc_date	\N	2026-08-18	2026-08-17 13:06:29.112909+05:30
8e639b5f-7ce6-4d27-885f-a7d8b65d99ca	7e45f6a5-d1a1-4f6d-8718-37117f24dc93	dc371e39-3e0e-4e95-bf30-c6c3da564997	reject_closure	status	ready_to_close	wip	2026-08-17 13:06:41.768038+05:30
87384549-490b-426c-a952-41d068a837e8	7e45f6a5-d1a1-4f6d-8718-37117f24dc93	a4f8d79e-b5da-4b35-8917-315eb68be7db	etc_update	etc_date	2026-08-18	2026-08-31	2026-08-17 16:29:24.370062+05:30
6823b310-0b4c-4aec-adcd-24e3faecc5d4	7fcbf962-615b-4c9a-bc1b-cdd965c20f4e	dc371e39-3e0e-4e95-bf30-c6c3da564997	raise	\N	\N	\N	2026-08-18 12:19:51.479208+05:30
773e2209-7e8b-4823-aaa3-f2e40f341b79	7fcbf962-615b-4c9a-bc1b-cdd965c20f4e	dc371e39-3e0e-4e95-bf30-c6c3da564997	status_change	status	open	wip	2026-08-18 12:20:53.568398+05:30
5cb71667-04ad-46b4-90c2-2475fdcf1bd8	7fcbf962-615b-4c9a-bc1b-cdd965c20f4e	dc371e39-3e0e-4e95-bf30-c6c3da564997	etc_update	etc_date	\N	2026-08-19	2026-08-18 12:20:53.568398+05:30
c605b42d-538f-4b3c-82b0-c76ab0e80320	7fcbf962-615b-4c9a-bc1b-cdd965c20f4e	dc371e39-3e0e-4e95-bf30-c6c3da564997	status_change	status	wip	ready_to_close	2026-08-18 12:21:08.096766+05:30
ae0b6fec-b771-4a11-926e-254ccd0b1407	7fcbf962-615b-4c9a-bc1b-cdd965c20f4e	dc371e39-3e0e-4e95-bf30-c6c3da564997	verify_closure	status	ready_to_close	closed	2026-08-18 12:21:15.27043+05:30
\.


ALTER TABLE public.snag_activity ENABLE TRIGGER ALL;

--
-- Data for Name: snag_daily_snapshot; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.snag_daily_snapshot DISABLE TRIGGER ALL;

COPY public.snag_daily_snapshot (warehouse_id, snapshot_date, total_raised, total_closed, open_count, open_high_count) FROM stdin;
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-08	1	0	1	1
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-07-30	3	0	3	1
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-07-31	5	0	5	1
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-01	8	1	7	2
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-02	11	2	9	2
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-03	13	4	9	2
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-04	15	6	9	2
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-05	17	9	8	1
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-06	18	11	7	1
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-07	19	14	5	1
ce6dd705-1fb3-48f7-9658-310f26439cd6	2026-08-09	1	0	1	0
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-09	6	2	4	0
ce6dd705-1fb3-48f7-9658-310f26439cd6	2026-08-10	1	0	1	0
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-10	7	5	2	0
ce6dd705-1fb3-48f7-9658-310f26439cd6	2026-08-11	1	0	1	0
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-11	7	5	2	0
ce6dd705-1fb3-48f7-9658-310f26439cd6	2026-08-12	1	0	1	0
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-12	7	5	2	0
ce6dd705-1fb3-48f7-9658-310f26439cd6	2026-08-13	1	0	1	0
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-13	8	5	3	0
ce6dd705-1fb3-48f7-9658-310f26439cd6	2026-08-14	1	0	1	0
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-14	8	5	3	0
ce6dd705-1fb3-48f7-9658-310f26439cd6	2026-08-15	1	0	1	0
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-15	8	5	3	0
ce6dd705-1fb3-48f7-9658-310f26439cd6	2026-08-16	1	0	1	0
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-16	8	5	3	0
ce6dd705-1fb3-48f7-9658-310f26439cd6	2026-08-17	1	0	1	0
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-17	8	5	3	0
ce6dd705-1fb3-48f7-9658-310f26439cd6	2026-08-18	1	0	1	0
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-18	8	7	1	0
ce6dd705-1fb3-48f7-9658-310f26439cd6	2026-08-19	1	0	1	0
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-19	9	8	1	0
ce6dd705-1fb3-48f7-9658-310f26439cd6	2026-08-20	1	0	1	0
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-20	9	8	1	0
ce6dd705-1fb3-48f7-9658-310f26439cd6	2026-08-21	1	0	1	0
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-21	9	8	1	0
ce6dd705-1fb3-48f7-9658-310f26439cd6	2026-08-22	1	0	1	0
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-22	9	8	1	0
ce6dd705-1fb3-48f7-9658-310f26439cd6	2026-08-23	1	0	1	0
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-23	9	8	1	0
ce6dd705-1fb3-48f7-9658-310f26439cd6	2026-08-24	1	0	1	0
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-24	9	8	1	0
ce6dd705-1fb3-48f7-9658-310f26439cd6	2026-08-25	1	0	1	0
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-25	9	8	1	0
ce6dd705-1fb3-48f7-9658-310f26439cd6	2026-08-26	1	0	1	0
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-26	9	8	1	0
ce6dd705-1fb3-48f7-9658-310f26439cd6	2026-08-27	1	0	1	0
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-27	9	8	1	0
ce6dd705-1fb3-48f7-9658-310f26439cd6	2026-08-28	1	0	1	0
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-28	9	8	1	0
ce6dd705-1fb3-48f7-9658-310f26439cd6	2026-08-29	1	0	1	0
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-29	9	8	1	0
ce6dd705-1fb3-48f7-9658-310f26439cd6	2026-08-30	1	0	1	0
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-30	9	8	1	0
ce6dd705-1fb3-48f7-9658-310f26439cd6	2026-08-31	1	0	1	0
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-08-31	9	8	1	0
ce6dd705-1fb3-48f7-9658-310f26439cd6	2026-09-01	1	0	1	0
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-09-01	9	8	1	0
ce6dd705-1fb3-48f7-9658-310f26439cd6	2026-09-02	1	0	1	0
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-09-02	9	8	1	0
ce6dd705-1fb3-48f7-9658-310f26439cd6	2026-09-03	1	0	1	0
8f25ba18-4b57-45ca-a243-b6b36ef43355	2026-09-03	9	8	1	0
\.


ALTER TABLE public.snag_daily_snapshot ENABLE TRIGGER ALL;

--
-- Data for Name: warehouse_activity; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.warehouse_activity DISABLE TRIGGER ALL;

COPY public.warehouse_activity (id, warehouse_id, actor_id, action, field, old_value, new_value, created_at) FROM stdin;
4d2732e0-30cb-472d-b255-7b475ef33395	1b43d12b-bd23-4f7f-beb5-9ac1c06fb485	dc371e39-3e0e-4e95-bf30-c6c3da564997	create	\N	\N	\N	2026-08-12 15:01:29.090264+05:30
ae27596d-f263-474c-8b05-6ab977808407	1b43d12b-bd23-4f7f-beb5-9ac1c06fb485	dc371e39-3e0e-4e95-bf30-c6c3da564997	deactivate	is_active	true	false	2026-08-12 15:01:44.433517+05:30
40da1e16-21b1-48e1-a42f-8357f91fb6cd	1b43d12b-bd23-4f7f-beb5-9ac1c06fb485	dc371e39-3e0e-4e95-bf30-c6c3da564997	activate	is_active	false	true	2026-08-12 15:02:02.881485+05:30
680581f8-8fd8-4f2d-878e-9a373fceee72	ce6dd705-1fb3-48f7-9658-310f26439cd6	dc371e39-3e0e-4e95-bf30-c6c3da564997	deactivate	is_active	true	false	2026-08-12 15:13:16.077955+05:30
22f2f7f5-f742-4151-bf4f-88205446f61b	ce6dd705-1fb3-48f7-9658-310f26439cd6	dc371e39-3e0e-4e95-bf30-c6c3da564997	activate	is_active	false	true	2026-08-12 15:13:40.706728+05:30
bd2e71ef-3335-4721-825d-9c184aec87e6	8f25ba18-4b57-45ca-a243-b6b36ef43355	dc371e39-3e0e-4e95-bf30-c6c3da564997	deactivate	is_active	true	false	2026-08-12 17:43:02.561761+05:30
9898be26-27f7-4474-ae30-2f4efa52de0b	8f25ba18-4b57-45ca-a243-b6b36ef43355	dc371e39-3e0e-4e95-bf30-c6c3da564997	activate	is_active	false	true	2026-08-12 17:43:04.395117+05:30
9c7f96f4-94e2-4e9c-8520-1deade4d8a6e	1b43d12b-bd23-4f7f-beb5-9ac1c06fb485	dc371e39-3e0e-4e95-bf30-c6c3da564997	deactivate	is_active	true	false	2026-08-12 17:43:07.818584+05:30
3ae32677-48c3-436f-bbdf-733d5de7c41c	1b43d12b-bd23-4f7f-beb5-9ac1c06fb485	dc371e39-3e0e-4e95-bf30-c6c3da564997	activate	is_active	false	true	2026-08-12 17:43:19.028333+05:30
b1ed2cbb-57a4-4b21-a22a-a81b5f35a0cf	1b43d12b-bd23-4f7f-beb5-9ac1c06fb485	dc371e39-3e0e-4e95-bf30-c6c3da564997	deactivate	is_active	true	false	2026-08-12 22:51:33.554553+05:30
6616c6c7-8174-4025-8830-5cfc121d0b91	8f25ba18-4b57-45ca-a243-b6b36ef43355	dc371e39-3e0e-4e95-bf30-c6c3da564997	deactivate	is_active	true	false	2026-08-12 22:51:49.710522+05:30
5a3e7b87-a6ac-45d9-9a0a-118ab1aab883	8f25ba18-4b57-45ca-a243-b6b36ef43355	dc371e39-3e0e-4e95-bf30-c6c3da564997	activate	is_active	false	true	2026-08-12 22:52:02.436152+05:30
2baa1ab3-fb69-462d-84e1-9e1ad395bfc3	1b43d12b-bd23-4f7f-beb5-9ac1c06fb485	dc371e39-3e0e-4e95-bf30-c6c3da564997	activate	is_active	false	true	2026-08-12 22:52:04.025996+05:30
81669e02-bb40-44a8-9358-01bd25c1f5ee	8f25ba18-4b57-45ca-a243-b6b36ef43355	dc371e39-3e0e-4e95-bf30-c6c3da564997	go_live_date_change	go_live_date	2026-08-31	2026-09-03	2026-08-18 17:48:15.214254+05:30
0bfc2cdd-60fb-4eb6-a67b-59063c15a720	8f25ba18-4b57-45ca-a243-b6b36ef43355	dc371e39-3e0e-4e95-bf30-c6c3da564997	go_live_date_change	go_live_date	2026-09-03	2026-09-10	2026-08-18 17:48:29.682603+05:30
\.


ALTER TABLE public.warehouse_activity ENABLE TRIGGER ALL;

--
-- Data for Name: warehouse_members; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.warehouse_members DISABLE TRIGGER ALL;

COPY public.warehouse_members (id, warehouse_id, user_id, role, created_at) FROM stdin;
45e6c2b4-1da0-4b5a-acdf-28b7f286f99b	1b43d12b-bd23-4f7f-beb5-9ac1c06fb485	a4f8d79e-b5da-4b35-8917-315eb68be7db	warehouse_admin	2026-08-17 15:40:21.016344+05:30
847e9363-91d6-438f-aa9a-4e720c87c4a3	da37cb72-b6fa-40bb-87d4-c6badc075e41	a4f8d79e-b5da-4b35-8917-315eb68be7db	warehouse_admin	2026-08-17 15:40:21.016344+05:30
b662ef47-01c3-4973-b358-edf5e1ddca43	ce6dd705-1fb3-48f7-9658-310f26439cd6	a4f8d79e-b5da-4b35-8917-315eb68be7db	warehouse_admin	2026-08-17 15:40:21.016344+05:30
c52f6f3e-e7dd-482f-90c0-db92609b6f1f	8f25ba18-4b57-45ca-a243-b6b36ef43355	a4f8d79e-b5da-4b35-8917-315eb68be7db	warehouse_admin	2026-08-17 15:40:21.016344+05:30
e9ebe0d5-42bf-4fa7-b62f-bd1bd8dc43d7	8f25ba18-4b57-45ca-a243-b6b36ef43355	8812718a-e5f8-438a-b8bf-4b0a5314b10d	hvac_engineer	2026-08-18 17:49:12.587173+05:30
1765d38c-a5dc-4493-83a1-84160d0d7c9a	1b43d12b-bd23-4f7f-beb5-9ac1c06fb485	8812718a-e5f8-438a-b8bf-4b0a5314b10d	hvac_engineer	2026-08-18 17:49:12.587173+05:30
11d2aed4-8e99-4107-8bb2-12f5e88bcb72	da37cb72-b6fa-40bb-87d4-c6badc075e41	8812718a-e5f8-438a-b8bf-4b0a5314b10d	hvac_engineer	2026-08-18 17:49:12.587173+05:30
\.


ALTER TABLE public.warehouse_members ENABLE TRIGGER ALL;

--
-- PostgreSQL database dump complete
--

\unrestrict 5nhYTvh55tozn5Wpvv1c7o3D282aefOAyNscvbooeB4rbWhLefQRPLcza8EMRlN

