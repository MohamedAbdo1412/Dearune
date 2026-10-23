-- ============================================================================
-- Worker Financial and QA: independent, purpose-built data boundaries
-- ============================================================================
--
-- Financial data is the most sensitive part of the studio. It is NOT enough to
-- hide cards in React, and RLS cannot hide columns on a row a worker is
-- allowed to read. Therefore:
--
--   * no financial table gains a worker RLS policy;
--   * `worker_financial_overview()` requires `financial.view` and then adds a
--     section to its JSON result ONLY when that exact category was granted;
--   * customer payables (`projects.sale_price`) is its own permission and its
--     payload carries only the amount owed �?" no revenue, cost or profit;
--   * `financial.manage` is a separate write capability, audited;
--   * `financial.export` only controls whether the client may download the
--     figures it already received. It grants no new category by itself.
--
-- QA gets the same treatment: it resolves a printed QR to its project, units,
-- designer and delivery record, but never returns `payload`, sale price, cost,
-- profit or the public token.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The permission-filtered financial overview
-- ---------------------------------------------------------------------------
-- Every aggregation is grouped by currency, because the ledger still contains
-- historical non-EGP rows. Adding pounds to euros would be a lie.
create or replace function public.worker_financial_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker   uuid := public.current_worker_id();
  v_currency text;
  v_result   jsonb;
begin
  if v_worker is null then
    raise exception 'worker.inactive_or_unknown' using errcode = '42501';
  end if;
  if not public.worker_has_permission('financial.view') then
    raise exception 'worker.forbidden' using errcode = '42501';
  end if;

  select coalesce((select currency from public.app_settings where id = 1), 'EGP') into v_currency;
  v_result := jsonb_build_object(
    'currency', v_currency,
    'generatedAt', now(),
    'canExport', public.worker_has_permission('financial.export'),
    'canManage', public.worker_has_permission('financial.manage')
  );

  if public.worker_has_permission('financial.view_revenue') then
    v_result := v_result || jsonb_build_object(
      'revenue', jsonb_build_object(
        'totals', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'currency', currency, 'total', total, 'sales', sales
          ) order by currency), '[]'::jsonb)
          from (
            select currency, round(sum(selling_price), 2) as total, count(*)::integer as sales
            from public.sales_log
            where status = 'completed'
            group by currency
          ) totals
        ),
        'byMonth', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'month', month, 'currency', currency, 'total', total, 'sales', sales
          ) order by month, currency), '[]'::jsonb)
          from (
            select to_char(date_trunc('month', sold_at), 'YYYY-MM') as month,
                   currency, round(sum(selling_price), 2) as total, count(*)::integer as sales
            from public.sales_log
            where status = 'completed'
            group by 1, 2
          ) months
        ),
        'byDesigner', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'designerId', designer_id,
            'name', designer_name,
            'currency', currency,
            'total', total,
            'sales', sales
          ) order by total desc, designer_name), '[]'::jsonb)
          from (
            select designer_id, coalesce(designer_name, 'Unassigned') as designer_name,
                   currency, round(sum(selling_price), 2) as total, count(*)::integer as sales
            from public.sales_log
            where status = 'completed'
            group by designer_id, designer_name, currency
          ) by_designer
        )
      )
    );
  end if;

  if public.worker_has_permission('financial.view_costs') then
    v_result := v_result || jsonb_build_object(
      'costs', jsonb_build_object(
        'totals', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'currency', currency, 'total', total, 'sales', sales
          ) order by currency), '[]'::jsonb)
          from (
            select currency, round(sum(estimated_cost), 2) as total, count(*)::integer as sales
            from public.sales_log
            where status = 'completed'
            group by currency
          ) totals
        ),
        'byWrapper', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'wrapperType', wrapper_type, 'currency', currency, 'total', total, 'sales', sales
          ) order by total desc), '[]'::jsonb)
          from (
            select coalesce(wrapper_type, 'unknown') as wrapper_type,
                   currency, round(sum(estimated_cost), 2) as total, count(*)::integer as sales
            from public.sales_log
            where status = 'completed'
            group by wrapper_type, currency
          ) by_wrapper
        )
      )
    );
  end if;

  if public.worker_has_permission('financial.view_profit') then
    v_result := v_result || jsonb_build_object(
      'profit', jsonb_build_object(
        'totals', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'currency', currency,
            'total', total,
            'margin', margin,
            'sales', sales
          ) order by currency), '[]'::jsonb)
          from (
            select currency,
                   round(sum(estimated_profit), 2) as total,
                   coalesce(round(sum(estimated_profit) / nullif(sum(selling_price), 0) * 100, 2), 0) as margin,
                   count(*)::integer as sales
            from public.sales_log
            where status = 'completed'
            group by currency
          ) totals
        ),
        'byMonth', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'month', month, 'currency', currency, 'total', total
          ) order by month, currency), '[]'::jsonb)
          from (
            select to_char(date_trunc('month', sold_at), 'YYYY-MM') as month,
                   currency, round(sum(estimated_profit), 2) as total
            from public.sales_log
            where status = 'completed'
            group by 1, 2
          ) months
        )
      )
    );
  end if;

  if public.worker_has_permission('financial.view_customer_payables') then
    v_result := v_result || jsonb_build_object(
      'customerPayables', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'projectId', p.id,
          'reference', p.reference,
          'title', p.title,
          'designerName', d.name,
          'amount', p.sale_price,
          'currency', p.currency,
          'paidAt', p.paid_at,
          'outstanding', p.paid_at is null,
          'createdAt', p.created_at
        ) order by p.created_at desc), '[]'::jsonb)
        from (
          select * from public.projects
          where sale_price is not null
            and archived_at is null
          order by created_at desc
          limit 200
        ) p
        left join public.designers d on d.id = p.designer_id
      )
    );
  end if;

  if public.worker_has_permission('financial.view_payments') then
    v_result := v_result || jsonb_build_object(
      'payments', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'saleId', s.id,
          'saleReference', s.sale_reference,
          'projectId', s.project_id,
          'title', s.title,
          'designerName', s.designer_name,
          'amount', s.selling_price,
          'currency', s.currency,
          'status', s.status,
          'soldAt', s.sold_at,
          'voidedAt', s.voided_at
        ) order by s.sold_at desc), '[]'::jsonb)
        from (
          select * from public.sales_log
          order by sold_at desc
          limit 200
        ) s
      )
    );
  end if;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Financial correction: void a completed sale (maintenance only)
-- ---------------------------------------------------------------------------
-- Mirrors the admin `reverse-paid` rule: the sale is never deleted, the money
-- is never rewritten, and a manufactured/shipped unit must be corrected first.
-- The worker is recorded in `sales_log.voided_by_worker` and in the audit log.
create or replace function public.worker_void_sale(
  p_sale_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker  uuid := public.current_worker_id();
  v_reason  text := btrim(coalesce(p_reason, ''));
  v_sale    public.sales_log%rowtype;
  v_project public.projects%rowtype;
begin
  if v_worker is null then
    raise exception 'worker.inactive_or_unknown' using errcode = '42501';
  end if;
  if not public.worker_has_permission('financial.view')
     or not public.worker_has_permission('financial.manage') then
    raise exception 'worker.forbidden' using errcode = '42501';
  end if;
  if char_length(v_reason) < 3 then
    raise exception 'financial.reason_required' using errcode = '22023';
  end if;
  if char_length(v_reason) > 300 then
    raise exception 'financial.reason_too_long' using errcode = '22001';
  end if;
  if not exists (select 1 from public.app_settings where id = 1 and maintenance_mode = true) then
    raise exception 'financial.maintenance_required' using errcode = '55000';
  end if;

  select * into v_sale from public.sales_log where id = p_sale_id for update;
  if not found then
    raise exception 'financial.sale_not_found' using errcode = 'P0002';
  end if;
  if v_sale.status <> 'completed' then
    raise exception 'financial.sale_already_voided' using errcode = '55000';
  end if;
  if v_sale.project_id is not null then
    select * into v_project from public.projects where id = v_sale.project_id for update;
    if found and (v_project.manufactured_at is not null or v_project.shipped_at is not null or v_project.arrived_at is not null) then
      raise exception 'financial.production_started' using errcode = '55000';
    end if;
  end if;

  update public.sales_log
  set status = 'voided',
      voided_at = now(),
      void_reason = v_reason,
      voided_by_worker = v_worker
  where id = p_sale_id and status = 'completed';

  if v_sale.project_id is not null then
    update public.projects
    set paid_at = null, sale_price = null, estimated_cost = null
    where id = v_sale.project_id;

    insert into public.project_events (project_id, actor_type, actor_id, action, detail)
    values (
      v_sale.project_id, 'worker', v_worker, 'project.sale.voided',
      jsonb_build_object('sale_reference', v_sale.sale_reference, 'reason', v_reason)
    );
  end if;

  perform public.record_admin_audit(
    v_worker, 'worker', 'worker.sale.voided', 'sales_log', p_sale_id::text,
    jsonb_build_object(
      'sale_reference', v_sale.sale_reference,
      'project_id', v_sale.project_id,
      'reason', v_reason
    )
  );

  return jsonb_build_object(
    'saleId', p_sale_id,
    'saleReference', v_sale.sale_reference,
    'status', 'voided',
    'voidedAt', now()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. QA: resolve a scanned QR without exposing the letter or any money
-- ---------------------------------------------------------------------------
create or replace function public.worker_qa_lookup(
  p_public_id text,
  p_token text default ''
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker   uuid := public.current_worker_id();
  v_public   text := lower(btrim(coalesce(p_public_id, '')));
  v_token    text := lower(btrim(coalesce(p_token, '')));
  v_project  public.projects%rowtype;
  v_verified boolean;
  v_units    jsonb;
  v_shipping jsonb;
  v_designer jsonb;
  v_template jsonb;
  v_events   jsonb;
  v_unit_events jsonb;
begin
  if v_worker is null then
    raise exception 'worker.inactive_or_unknown' using errcode = '42501';
  end if;
  if not public.worker_has_permission('qa.view') then
    raise exception 'worker.forbidden' using errcode = '42501';
  end if;
  if v_public !~ '^[0-9a-f]{16,64}$' then
    raise exception 'qa.invalid_public_id' using errcode = '22023';
  end if;
  if v_token <> '' and v_token !~ '^[0-9a-f]{16,128}$' then
    raise exception 'qa.invalid_token' using errcode = '22023';
  end if;

  select * into v_project from public.projects where public_id = v_public;
  if not found then
    raise exception 'qa.not_found' using errcode = 'P0002';
  end if;

  if v_token = '' then
    v_verified := null;
  else
    if v_token <> lower(coalesce(v_project.public_token, '')) then
      raise exception 'qa.token_mismatch' using errcode = '55000';
    end if;
    v_verified := true;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pp.id,
    'reference', pp.reference,
    'unit_index', pp.unit_index,
    'status', pp.status::text,
    'notes', pp.notes,
    'on_hold_reason', pp.on_hold_reason,
    'cancelled_reason', pp.cancelled_reason,
    'archived_at', pp.archived_at,
    'created_at', pp.created_at,
    'updated_at', pp.updated_at
  ) order by pp.unit_index), '[]'::jsonb)
  into v_units
  from public.physical_products pp
  where pp.project_id = v_project.id;

  select to_jsonb(s) - 'label_media' into v_shipping
  from public.shipping s
  where s.project_id = v_project.id
  limit 1;

  select jsonb_build_object('id', d.id, 'name', d.name, 'code', d.code)
  into v_designer
  from public.designers d
  where d.id = v_project.designer_id;

  select jsonb_build_object('name', t.name, 'slug', t.slug)
  into v_template
  from public.templates t
  where t.slug = v_project.template_slug;

  select coalesce(jsonb_agg(jsonb_build_object(
    'action', e.action,
    'actorType', e.actor_type,
    'createdAt', e.created_at
  ) order by e.created_at), '[]'::jsonb)
  into v_events
  from public.project_events e
  where e.project_id = v_project.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'action', e.action,
    'actorType', e.actor_type,
    'createdAt', e.created_at
  ) order by e.created_at), '[]'::jsonb)
  into v_unit_events
  from public.physical_product_events e
  join public.physical_products pp on pp.id = e.physical_product_id
  where pp.project_id = v_project.id;

  return jsonb_build_object(
    'publicId', v_project.public_id,
    'tokenVerified', v_verified,
    'verified', coalesce(v_verified, false),
    'project', jsonb_build_object(
      'id', v_project.id,
      'reference', v_project.reference,
      'title', v_project.title,
      'status', v_project.status,
      'public_id', v_project.public_id,
      'wrapper_type', v_project.wrapper_type,
      'template_slug', v_project.template_slug,
      'template_version', v_project.template_version,
      'configured_at', v_project.configured_at,
      'submitted_at', v_project.submitted_at,
      'created_at', v_project.created_at,
      'updated_at', v_project.updated_at,
      'paid_at', v_project.paid_at,
      'manufactured_at', v_project.manufactured_at,
      'shipped_at', v_project.shipped_at,
      'arrived_at', v_project.arrived_at,
      'archived_at', v_project.archived_at,
      'first_activated_at', v_project.first_activated_at,
      'message_active', v_project.message_active,
      'message_protected', coalesce((v_project.payload ->> 'passwordSet')::boolean, false)
    ),
    'designer', v_designer,
    'template', v_template,
    'shipping', v_shipping,
    'units', v_units,
    'events', v_events,
    'unitEvents', v_unit_events
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.worker_financial_overview() from public, anon, authenticated;
revoke all on function public.worker_void_sale(uuid, text) from public, anon, authenticated;
revoke all on function public.worker_qa_lookup(text, text) from public, anon, authenticated;

grant execute on function public.worker_financial_overview() to authenticated;
grant execute on function public.worker_void_sale(uuid, text) to authenticated;
grant execute on function public.worker_qa_lookup(text, text) to authenticated;
