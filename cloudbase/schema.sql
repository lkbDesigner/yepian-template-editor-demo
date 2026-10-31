-- Execute once in the CloudBase PostgreSQL SQL editor. No credentials in this file.
BEGIN;
CREATE TABLE IF NOT EXISTS public.yepian_accounts (
 phone text PRIMARY KEY CHECK(phone ~ '^[0-9]{11}$'), site_id text UNIQUE NOT NULL,
 password_salt text NOT NULL, password_hash text NOT NULL, edit_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.yepian_sessions (
 token_hash text PRIMARY KEY, site_id text NOT NULL REFERENCES public.yepian_accounts(site_id),
 expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS public.yepian_pages (
 site_id text PRIMARY KEY REFERENCES public.yepian_accounts(site_id),
 payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.yepian_jobs (
 id text PRIMARY KEY, seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 site_id text NOT NULL REFERENCES public.yepian_accounts(site_id),
 request_id text NOT NULL, payload jsonb, state text NOT NULL DEFAULT 'queued',
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
 result jsonb, error text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(site_id,request_id), CHECK(state IN ('queued','processing','done','failed'))
);
CREATE TABLE IF NOT EXISTS public.yepian_worker (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 holder text, job_id text, lease_until timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.yepian_worker(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.yepian_limits (
 key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS yepian_jobs_pending ON public.yepian_jobs(seq) WHERE state IN ('queued','processing');
ALTER TABLE public.yepian_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yepian_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yepian_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yepian_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yepian_worker ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yepian_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.yepian_accounts,public.yepian_sessions,public.yepian_pages,public.yepian_jobs,public.yepian_worker,public.yepian_limits FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.yepian_accounts,public.yepian_sessions,public.yepian_pages,public.yepian_jobs,public.yepian_worker,public.yepian_limits TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.yepian_jobs_seq_seq TO service_role;

CREATE OR REPLACE FUNCTION public.yepian_rpc(action text,args jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE account public.yepian_accounts; job public.yepian_jobs; lease public.yepian_worker;
 sid text; found_id text; n integer; keyname text; allowed boolean:=true;
BEGIN
 IF action='health' THEN RETURN jsonb_build_object('ready',true); END IF;
 IF action='limit' THEN
  FOREACH keyname IN ARRAY ARRAY['phone:'||(args->>'phone'),'ip:'||(args->>'ip')] LOOP
   INSERT INTO public.yepian_limits(key,count,expires_at) VALUES(keyname,1,now()+interval '10 minutes')
   ON CONFLICT(key) DO UPDATE SET count=CASE WHEN yepian_limits.expires_at<now() THEN 1 ELSE yepian_limits.count+1 END,
    expires_at=CASE WHEN yepian_limits.expires_at<now() THEN now()+interval '10 minutes' ELSE yepian_limits.expires_at END
   RETURNING count INTO n;
   IF n>(CASE WHEN keyname LIKE 'phone:%' THEN 30 ELSE 1000 END) THEN allowed:=false; END IF;
  END LOOP;
  RETURN jsonb_build_object('allowed',allowed);
 END IF;
 IF action='lookup' THEN
  SELECT * INTO account FROM public.yepian_accounts WHERE phone=args->>'phone';
  RETURN CASE WHEN FOUND THEN to_jsonb(account) ELSE 'null'::jsonb END;
 END IF;
 IF action='register' THEN
  INSERT INTO public.yepian_accounts(phone,site_id,password_salt,password_hash,edit_key)
  VALUES(args->>'phone',args->>'siteId',args->>'salt',args->>'hash',args->>'editKey') ON CONFLICT(phone) DO NOTHING
  RETURNING site_id INTO sid;
  RETURN jsonb_build_object('created',sid IS NOT NULL);
 END IF;
 IF action='session' THEN
  INSERT INTO public.yepian_sessions(token_hash,site_id,expires_at) VALUES(args->>'tokenHash',args->>'siteId',now()+interval '8 hours');
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF action='authenticate' THEN
  SELECT site_id INTO sid FROM public.yepian_sessions WHERE token_hash=args->>'tokenHash' AND expires_at>now();
  RETURN CASE WHEN sid IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('siteId',sid) END;
 END IF;
 IF action='logout' THEN
  DELETE FROM public.yepian_sessions WHERE token_hash=args->>'tokenHash'; RETURN jsonb_build_object('ok',true);
 END IF;
 IF action='load' THEN
  SELECT payload INTO args FROM public.yepian_pages WHERE site_id=args->>'siteId';
  RETURN coalesce(args,jsonb_build_object('fields','{}'::jsonb,'assets','[]'::jsonb));
 END IF;
 IF action='enqueue' THEN
  -- Serialize saves for this page so database state and queue order cannot diverge.
  PERFORM 1 FROM public.yepian_accounts WHERE site_id=args->>'siteId' FOR UPDATE;
  SELECT id INTO found_id FROM public.yepian_jobs WHERE site_id=args->>'siteId' AND request_id=args->>'requestId';
  IF found_id IS NOT NULL THEN RETURN jsonb_build_object('id',found_id); END IF;
  INSERT INTO public.yepian_jobs(id,site_id,request_id,payload) VALUES(args->>'id',args->>'siteId',args->>'requestId',args->'payload');
  INSERT INTO public.yepian_pages(site_id,payload) VALUES(args->>'siteId',args->'payload')
   ON CONFLICT(site_id) DO UPDATE SET payload=excluded.payload,updated_at=now();
  RETURN jsonb_build_object('id',args->>'id');
 END IF;
 IF action='job' THEN
  SELECT * INTO job FROM public.yepian_jobs WHERE id=args->>'id' AND site_id=args->>'siteId';
  IF NOT FOUND THEN RETURN 'null'::jsonb; END IF;
  SELECT count(*)::integer INTO n FROM public.yepian_jobs WHERE seq<job.seq AND state IN ('queued','processing');
  RETURN jsonb_build_object('state',job.state,'ahead',n,'result',job.result,'error',job.error);
 END IF;
 IF action='claim' THEN
  SELECT * INTO lease FROM public.yepian_worker WHERE singleton FOR UPDATE;
  IF lease.holder IS NOT NULL AND lease.lease_until>now() THEN RETURN 'null'::jsonb; END IF;
  -- Expired job is retried first, preserving global queue ordering after restart.
  SELECT * INTO job FROM public.yepian_jobs WHERE state IN ('queued','processing') ORDER BY seq LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR job.available_at>now() THEN RETURN 'null'::jsonb; END IF;
  UPDATE public.yepian_worker SET holder=args->>'holder',job_id=job.id,lease_until=now()+interval '10 minutes' WHERE singleton;
  UPDATE public.yepian_jobs SET state='processing',attempts=attempts+1 WHERE id=job.id RETURNING * INTO job;
  SELECT * INTO account FROM public.yepian_accounts WHERE site_id=job.site_id;
  RETURN jsonb_build_object('id',job.id,'payload',job.payload,'editKey',account.edit_key,'attempts',job.attempts);
 END IF;
 IF action='finish' OR action='fail' OR action='heartbeat' THEN
  SELECT * INTO lease FROM public.yepian_worker WHERE singleton FOR UPDATE;
  IF lease.holder IS DISTINCT FROM args->>'holder' OR lease.job_id IS DISTINCT FROM args->>'id' THEN RETURN jsonb_build_object('ok',false); END IF;
  IF action='heartbeat' THEN
   UPDATE public.yepian_worker SET lease_until=now()+interval '10 minutes' WHERE singleton; RETURN jsonb_build_object('ok',true);
  END IF;
  IF action='finish' THEN
   UPDATE public.yepian_jobs SET state='done',result=args->'result',payload=NULL,error=NULL WHERE id=lease.job_id;
  ELSE
   UPDATE public.yepian_jobs SET state=CASE WHEN attempts>=5 THEN 'failed' ELSE 'queued' END,
    error='GitHub 同步未完成，请稍后重新保存',available_at=now()+interval '30 seconds' WHERE id=lease.job_id;
  END IF;
  UPDATE public.yepian_worker SET holder=NULL,job_id=NULL,lease_until=now() WHERE singleton;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF action='cleanup' THEN
  DELETE FROM public.yepian_sessions WHERE expires_at<now();
  DELETE FROM public.yepian_limits WHERE expires_at<now();
  DELETE FROM public.yepian_jobs WHERE state IN ('done','failed') AND created_at<now()-interval '7 days';
  RETURN jsonb_build_object('ok',true);
 END IF;
 RAISE EXCEPTION 'Unknown action';
END; $$;
REVOKE ALL ON FUNCTION public.yepian_rpc(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.yepian_rpc(text,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
