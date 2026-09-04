--
-- PostgreSQL database dump
--

\restrict YTeBUn59j6tEnkc6srZjmYiaSiVtJLD3DH7L2CNzEh2es0bgRZLmhXH60OHPruL

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
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: -
--

COPY storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type, versioning_status) FROM stdin;
attachments	attachments	\N	2026-08-08 19:11:23.390298+05:30	2026-08-08 19:11:23.390298+05:30	f	f	52428800	{image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime}	\N	STANDARD	DISABLED
\.


--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: -
--

COPY storage.objects (id, bucket_id, name, owner, created_at, updated_at, last_accessed_at, metadata, version, owner_id, user_metadata, archived_at, is_delete_marker, is_versioned) FROM stdin;
4500ade8-321e-4f8d-8fe6-269bdbb4e45a	attachments	8f25ba18-4b57-45ca-a243-b6b36ef43355/a471d587-2f0a-419b-9c27-c88b2c224b6e/4996cd52.jpg	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-08 19:21:30.339033+05:30	2026-08-08 19:21:30.339033+05:30	2026-08-08 19:21:30.339033+05:30	{"eTag": "\\"d63160aca44681f5828ab4518f1793f9\\"", "size": 53749, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-08-08T13:51:31.000Z", "contentLength": 53749, "httpStatusCode": 200}	5b5b9e1c-a27b-443e-b3e1-28d0a2d1b82c	dc371e39-3e0e-4e95-bf30-c6c3da564997	{}	\N	f	f
bf80314d-5b8d-49e3-895a-5d415f47a8ac	attachments	8f25ba18-4b57-45ca-a243-b6b36ef43355/a471d587-2f0a-419b-9c27-c88b2c224b6e/4996cd52-thumb.jpg	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-08 19:21:30.362496+05:30	2026-08-08 19:21:30.362496+05:30	2026-08-08 19:21:30.362496+05:30	{"eTag": "\\"1fc458391100d4791a62141b71d5011a\\"", "size": 4531, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-08-08T13:51:31.000Z", "contentLength": 4531, "httpStatusCode": 200}	3ab664a7-ba95-41d6-a265-339450a7b382	dc371e39-3e0e-4e95-bf30-c6c3da564997	{}	\N	f	f
bda6b555-1323-4206-ac7c-778a331c898a	attachments	8f25ba18-4b57-45ca-a243-b6b36ef43355/a471d587-2f0a-419b-9c27-c88b2c224b6e/4996cd52-original.jpg	dc371e39-3e0e-4e95-bf30-c6c3da564997	2026-08-08 19:21:30.435839+05:30	2026-08-08 19:21:30.435839+05:30	2026-08-08 19:21:30.435839+05:30	{"eTag": "\\"04fe28fb865e6c39d817a503ef689aa1\\"", "size": 47220, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-08-08T13:51:31.000Z", "contentLength": 47220, "httpStatusCode": 200}	52d567b8-3da7-4872-b7a2-ad9f539ad6ac	dc371e39-3e0e-4e95-bf30-c6c3da564997	{}	\N	f	f
c106faf0-90eb-4222-be9b-1752f2fb2c68	attachments	8f25ba18-4b57-45ca-a243-b6b36ef43355/7e45f6a5-d1a1-4f6d-8718-37117f24dc93/30dff004-thumb.jpg	a4f8d79e-b5da-4b35-8917-315eb68be7db	2026-08-17 16:41:27.745249+05:30	2026-08-17 16:41:27.745249+05:30	2026-08-17 16:41:27.745249+05:30	{"eTag": "\\"486188608a2c3648ba31d027f20d64f5\\"", "size": 8346, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-08-17T11:11:28.000Z", "contentLength": 8346, "httpStatusCode": 200}	01d0fe20-f68b-4d40-8e94-975dca985245	a4f8d79e-b5da-4b35-8917-315eb68be7db	{}	\N	f	f
170a03f2-a51a-4800-ad59-15656e405fb5	attachments	8f25ba18-4b57-45ca-a243-b6b36ef43355/7e45f6a5-d1a1-4f6d-8718-37117f24dc93/30dff004-original.jpg	a4f8d79e-b5da-4b35-8917-315eb68be7db	2026-08-17 16:41:27.790063+05:30	2026-08-17 16:41:27.790063+05:30	2026-08-17 16:41:27.790063+05:30	{"eTag": "\\"6d325ed1bec6c6ab58af2adc98548565\\"", "size": 108996, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-08-17T11:11:28.000Z", "contentLength": 108996, "httpStatusCode": 200}	fd5143ba-d3e2-4e80-bf09-f545f2c41739	a4f8d79e-b5da-4b35-8917-315eb68be7db	{}	\N	f	f
0da122b4-7bd8-48c5-a888-220c5dd771ac	attachments	8f25ba18-4b57-45ca-a243-b6b36ef43355/7e45f6a5-d1a1-4f6d-8718-37117f24dc93/30dff004.jpg	a4f8d79e-b5da-4b35-8917-315eb68be7db	2026-08-17 16:41:27.795336+05:30	2026-08-17 16:41:27.795336+05:30	2026-08-17 16:41:27.795336+05:30	{"eTag": "\\"6d325ed1bec6c6ab58af2adc98548565\\"", "size": 108996, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-08-17T11:11:28.000Z", "contentLength": 108996, "httpStatusCode": 200}	e5b444a2-2f4c-499f-a29b-522a71d092d7	a4f8d79e-b5da-4b35-8917-315eb68be7db	{}	\N	f	f
c8700a6c-2810-4046-b9b0-2dbe5a59ed64	attachments	8f25ba18-4b57-45ca-a243-b6b36ef43355/7e45f6a5-d1a1-4f6d-8718-37117f24dc93/3dfc082f.jpg	a4f8d79e-b5da-4b35-8917-315eb68be7db	2026-08-17 16:41:28.378512+05:30	2026-08-17 16:41:28.378512+05:30	2026-08-17 16:41:28.378512+05:30	{"eTag": "\\"e61ad01670f5002027c3aaec6746edd9\\"", "size": 108503, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-08-17T11:11:29.000Z", "contentLength": 108503, "httpStatusCode": 200}	bce2cd5e-c5b3-4990-acc8-b08dfa7c9659	a4f8d79e-b5da-4b35-8917-315eb68be7db	{}	\N	f	f
8ca6a55d-fda8-449f-b611-b3258318f5ae	attachments	8f25ba18-4b57-45ca-a243-b6b36ef43355/7e45f6a5-d1a1-4f6d-8718-37117f24dc93/3dfc082f-original.jpg	a4f8d79e-b5da-4b35-8917-315eb68be7db	2026-08-17 16:41:28.411472+05:30	2026-08-17 16:41:28.411472+05:30	2026-08-17 16:41:28.411472+05:30	{"eTag": "\\"e61ad01670f5002027c3aaec6746edd9\\"", "size": 108503, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-08-17T11:11:29.000Z", "contentLength": 108503, "httpStatusCode": 200}	cb9cf568-c9e0-4be1-9c98-f44b67497d22	a4f8d79e-b5da-4b35-8917-315eb68be7db	{}	\N	f	f
cbb09eb0-73bd-4568-8171-5607660e012b	attachments	8f25ba18-4b57-45ca-a243-b6b36ef43355/7e45f6a5-d1a1-4f6d-8718-37117f24dc93/3dfc082f-thumb.jpg	a4f8d79e-b5da-4b35-8917-315eb68be7db	2026-08-17 16:41:28.682349+05:30	2026-08-17 16:41:28.682349+05:30	2026-08-17 16:41:28.682349+05:30	{"eTag": "\\"3ea74fd17f2f6cc9ceaa3bd77697af3f\\"", "size": 7982, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-08-17T11:11:29.000Z", "contentLength": 7982, "httpStatusCode": 200}	78966620-dfa3-4fde-86d4-9d1cd8d99b84	a4f8d79e-b5da-4b35-8917-315eb68be7db	{}	\N	f	f
1cf828e7-bfd0-463f-9745-82e14ab92ffe	attachments	8f25ba18-4b57-45ca-a243-b6b36ef43355/7e45f6a5-d1a1-4f6d-8718-37117f24dc93/84d915af-original.jpg	a4f8d79e-b5da-4b35-8917-315eb68be7db	2026-08-17 17:11:10.856695+05:30	2026-08-17 17:11:10.856695+05:30	2026-08-17 17:11:10.856695+05:30	{"eTag": "\\"4bac86e60c94a62b7e7ccd99aae56cd6\\"", "size": 107931, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-08-17T11:41:11.000Z", "contentLength": 107931, "httpStatusCode": 200}	97b4ad54-f30b-465a-8bcb-801efec0d148	a4f8d79e-b5da-4b35-8917-315eb68be7db	{}	\N	f	f
b7ed0b96-edf5-4394-a351-b426fbaff712	attachments	8f25ba18-4b57-45ca-a243-b6b36ef43355/7e45f6a5-d1a1-4f6d-8718-37117f24dc93/84d915af.jpg	a4f8d79e-b5da-4b35-8917-315eb68be7db	2026-08-17 17:11:11.045873+05:30	2026-08-17 17:11:11.045873+05:30	2026-08-17 17:11:11.045873+05:30	{"eTag": "\\"4bac86e60c94a62b7e7ccd99aae56cd6\\"", "size": 107931, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-08-17T11:41:12.000Z", "contentLength": 107931, "httpStatusCode": 200}	7353730b-2ecc-4c44-8758-ce1bcbc80d87	a4f8d79e-b5da-4b35-8917-315eb68be7db	{}	\N	f	f
2b91b9f9-5a99-4786-8c17-c96a1dbbe897	attachments	8f25ba18-4b57-45ca-a243-b6b36ef43355/7e45f6a5-d1a1-4f6d-8718-37117f24dc93/84d915af-thumb.jpg	a4f8d79e-b5da-4b35-8917-315eb68be7db	2026-08-17 17:11:10.959021+05:30	2026-08-17 17:11:10.959021+05:30	2026-08-17 17:11:10.959021+05:30	{"eTag": "\\"f60842a603e80279dd31fe99f5c0e22c\\"", "size": 8288, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-08-17T11:41:11.000Z", "contentLength": 8288, "httpStatusCode": 200}	51bee0bc-a2c2-47b9-9722-7781cd3797db	a4f8d79e-b5da-4b35-8917-315eb68be7db	{}	\N	f	f
8520f437-473e-461c-b9cc-c7c494f86c25	attachments	8f25ba18-4b57-45ca-a243-b6b36ef43355/7e45f6a5-d1a1-4f6d-8718-37117f24dc93/4595ba48.jpg	8812718a-e5f8-438a-b8bf-4b0a5314b10d	2026-08-18 11:48:39.20399+05:30	2026-08-18 11:48:39.20399+05:30	2026-08-18 11:48:39.20399+05:30	{"eTag": "\\"24ea705ec943e09ce25834955a548a06\\"", "size": 29822, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-08-18T06:18:40.000Z", "contentLength": 29822, "httpStatusCode": 200}	4f86ed3e-e1e9-4e6b-88f5-90bc5b191ab3	8812718a-e5f8-438a-b8bf-4b0a5314b10d	{}	\N	f	f
e1ab38d7-f620-49f9-87b5-825eaac2c261	attachments	8f25ba18-4b57-45ca-a243-b6b36ef43355/7e45f6a5-d1a1-4f6d-8718-37117f24dc93/4595ba48-thumb.jpg	8812718a-e5f8-438a-b8bf-4b0a5314b10d	2026-08-18 11:48:39.294238+05:30	2026-08-18 11:48:39.294238+05:30	2026-08-18 11:48:39.294238+05:30	{"eTag": "\\"e8059ddf846f56479f6a04c0c3accc0d\\"", "size": 2842, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-08-18T06:18:40.000Z", "contentLength": 2842, "httpStatusCode": 200}	f0555313-428b-4414-aa71-64e1f72ed867	8812718a-e5f8-438a-b8bf-4b0a5314b10d	{}	\N	f	f
640a6e7e-6b5f-4070-a14b-0d36992df829	attachments	8f25ba18-4b57-45ca-a243-b6b36ef43355/7e45f6a5-d1a1-4f6d-8718-37117f24dc93/4595ba48-original.jpg	8812718a-e5f8-438a-b8bf-4b0a5314b10d	2026-08-18 11:48:39.459427+05:30	2026-08-18 11:48:39.459427+05:30	2026-08-18 11:48:39.459427+05:30	{"eTag": "\\"baddd362583ae4b47d06eb2a0f3b1c34\\"", "size": 24493, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-08-18T06:18:40.000Z", "contentLength": 24493, "httpStatusCode": 200}	b9073208-eb5a-4726-8bf4-c1fe6cfab81b	8812718a-e5f8-438a-b8bf-4b0a5314b10d	{}	\N	f	f
\.


--
-- PostgreSQL database dump complete
--

\unrestrict YTeBUn59j6tEnkc6srZjmYiaSiVtJLD3DH7L2CNzEh2es0bgRZLmhXH60OHPruL

