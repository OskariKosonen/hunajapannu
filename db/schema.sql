--
-- PostgreSQL database dump
--

\restrict cVIVOvvqeK9jM8TQEqlceSZRjCqsgkofFtCclrSJ2Z9XYXV4Kdgoj3ke3RKwKTr

-- Dumped from database version 16.10 (Ubuntu 16.10-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.10 (Ubuntu 16.10-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: cowrie_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cowrie_events (
    id integer NOT NULL,
    "timestamp" timestamp with time zone NOT NULL,
    src_ip inet NOT NULL,
    dest_port integer,
    username text,
    password text,
    command text,
    session_id text,
    raw_json jsonb,
    created_at timestamp with time zone DEFAULT now(),
    country_iso text,
    asn integer,
    org text,
    city text
);


ALTER TABLE public.cowrie_events OWNER TO postgres;

--
-- Name: cowrie_events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.cowrie_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cowrie_events_id_seq OWNER TO postgres;

--
-- Name: cowrie_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.cowrie_events_id_seq OWNED BY public.cowrie_events.id;


--
-- Name: cowrie_files; Type: TABLE; Schema: public; Owner: cowrie_user
--

CREATE TABLE public.cowrie_files (
    id integer NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    sha256 text NOT NULL,
    size_bytes bigint,
    mtime timestamp with time zone,
    mode text,
    uid integer,
    gid integer,
    full_path text,
    vt_last_fetched timestamp with time zone,
    vt_found boolean,
    vt_malicious integer,
    vt_suspicious integer,
    vt_harmless integer,
    vt_undetected integer,
    vt_timeout integer,
    vt_reputation integer,
    vt_type text,
    vt_magic text,
    vt_first_submission_date timestamp with time zone,
    vt_last_analysis_date timestamp with time zone,
    vt_tags text[]
);


ALTER TABLE public.cowrie_files OWNER TO cowrie_user;

--
-- Name: cowrie_files_id_seq; Type: SEQUENCE; Schema: public; Owner: cowrie_user
--

CREATE SEQUENCE public.cowrie_files_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cowrie_files_id_seq OWNER TO cowrie_user;

--
-- Name: cowrie_files_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: cowrie_user
--

ALTER SEQUENCE public.cowrie_files_id_seq OWNED BY public.cowrie_files.id;


--
-- Name: cowrie_unique_commands; Type: TABLE; Schema: public; Owner: cowrie_user
--

CREATE TABLE public.cowrie_unique_commands (
    command text NOT NULL,
    first_seen timestamp with time zone NOT NULL,
    last_seen timestamp with time zone NOT NULL,
    total_events bigint,
    unique_ips bigint
);


ALTER TABLE public.cowrie_unique_commands OWNER TO cowrie_user;

--
-- Name: cowrie_unique_creds; Type: TABLE; Schema: public; Owner: cowrie_user
--

CREATE TABLE public.cowrie_unique_creds (
    username text NOT NULL,
    password text NOT NULL,
    first_seen timestamp with time zone NOT NULL,
    last_seen timestamp with time zone NOT NULL
);


ALTER TABLE public.cowrie_unique_creds OWNER TO cowrie_user;

--
-- Name: cowrie_events id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cowrie_events ALTER COLUMN id SET DEFAULT nextval('public.cowrie_events_id_seq'::regclass);


--
-- Name: cowrie_files id; Type: DEFAULT; Schema: public; Owner: cowrie_user
--

ALTER TABLE ONLY public.cowrie_files ALTER COLUMN id SET DEFAULT nextval('public.cowrie_files_id_seq'::regclass);


--
-- Name: cowrie_events cowrie_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cowrie_events
    ADD CONSTRAINT cowrie_events_pkey PRIMARY KEY (id);


--
-- Name: cowrie_files cowrie_files_pkey; Type: CONSTRAINT; Schema: public; Owner: cowrie_user
--

ALTER TABLE ONLY public.cowrie_files
    ADD CONSTRAINT cowrie_files_pkey PRIMARY KEY (id);


--
-- Name: cowrie_unique_commands cowrie_unique_commands_pkey; Type: CONSTRAINT; Schema: public; Owner: cowrie_user
--

ALTER TABLE ONLY public.cowrie_unique_commands
    ADD CONSTRAINT cowrie_unique_commands_pkey PRIMARY KEY (command);


--
-- Name: cowrie_unique_creds cowrie_unique_creds_pkey; Type: CONSTRAINT; Schema: public; Owner: cowrie_user
--

ALTER TABLE ONLY public.cowrie_unique_creds
    ADD CONSTRAINT cowrie_unique_creds_pkey PRIMARY KEY (username, password);


--
-- Name: idx_cowrie_events_asn; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cowrie_events_asn ON public.cowrie_events USING btree (asn);


--
-- Name: idx_cowrie_events_country_iso; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cowrie_events_country_iso ON public.cowrie_events USING btree (country_iso);


--
-- Name: idx_cowrie_files_sha256; Type: INDEX; Schema: public; Owner: cowrie_user
--

CREATE INDEX idx_cowrie_files_sha256 ON public.cowrie_files USING btree (sha256);


--
-- Name: idx_cowrie_files_timestamp; Type: INDEX; Schema: public; Owner: cowrie_user
--

CREATE INDEX idx_cowrie_files_timestamp ON public.cowrie_files USING btree ("timestamp");


--
-- Name: idx_cowrie_src_ip; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cowrie_src_ip ON public.cowrie_events USING btree (src_ip);


--
-- Name: idx_cowrie_timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cowrie_timestamp ON public.cowrie_events USING btree ("timestamp");


--
-- Name: idx_events_timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_timestamp ON public.cowrie_events USING btree ("timestamp");


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT ALL ON SCHEMA public TO cowrie_user;


--
-- Name: TABLE cowrie_events; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.cowrie_events TO cowrie_user;


--
-- Name: SEQUENCE cowrie_events_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.cowrie_events_id_seq TO cowrie_user;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO cowrie_user;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO cowrie_user;


--
-- PostgreSQL database dump complete
--

\unrestrict cVIVOvvqeK9jM8TQEqlceSZRjCqsgkofFtCclrSJ2Z9XYXV4Kdgoj3ke3RKwKTr

