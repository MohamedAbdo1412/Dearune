insert into public.templates (id, name, slug, description, image_url, print_config, enabled, sort_order)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'The Classic Letter',
    'classic-letter',
    'A timeless handwritten letter, printed on warm cream paper and delivered in a crisp envelope.',
    'templates/classic-letter.png',
    '{"page":{"width":595.28,"height":841.89},"margin":56,"qr":{"x":0.78,"y":0.9,"size":0.12},"heading":{"fontSize":26},"body":{"fontSize":13,"lineHeight":1.6},"signature":{"fontSize":15},"seal":{"enabled":false},"watermark":{"enabled":true,"text":"Dearune"}}'::jsonb,
    true,
    1
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'Word & Wax',
    'word-and-wax',
    'An heirloom-worthy letter finished with a hand-stamped wax seal in deep ink.',
    'templates/word-and-wax.png',
    '{"page":{"width":595.28,"height":841.89},"margin":56,"qr":{"x":0.78,"y":0.9,"size":0.12},"heading":{"fontSize":28},"body":{"fontSize":13.5,"lineHeight":1.65},"signature":{"fontSize":16},"seal":{"enabled":true,"color":"#2b1d3a"},"watermark":{"enabled":true,"text":"Dearune"}}'::jsonb,
    true,
    2
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    'The Silent Card',
    'silent-card',
    'A quiet, elegant card for words better left unwritten aloud.',
    'templates/silent-card.png',
    '{"page":{"width":595.28,"height":841.89},"margin":64,"qr":{"x":0.76,"y":0.88,"size":0.14},"heading":{"fontSize":30},"body":{"fontSize":14,"lineHeight":1.7},"signature":{"fontSize":16},"seal":{"enabled":false},"watermark":{"enabled":true,"text":"Dearune"}}'::jsonb,
    true,
    3
  )
on conflict (id) do nothing;

insert into public.template_pricing (template_id, wrapper_type, price, cost)
values
  ('10000000-0000-0000-0000-000000000001', 'digital', 8.00, 0.00),
  ('10000000-0000-0000-0000-000000000001', 'open_letter', 12.00, 2.80),
  ('10000000-0000-0000-0000-000000000001', 'sealed_letter', 18.00, 4.20),
  ('10000000-0000-0000-0000-000000000001', 'open_card', 10.00, 2.40),
  ('10000000-0000-0000-0000-000000000002', 'digital', 12.00, 0.00),
  ('10000000-0000-0000-0000-000000000002', 'open_letter', 18.00, 4.00),
  ('10000000-0000-0000-0000-000000000002', 'sealed_letter', 26.00, 7.50),
  ('10000000-0000-0000-0000-000000000002', 'open_card', 16.00, 3.60),
  ('10000000-0000-0000-0000-000000000003', 'digital', 9.00, 0.00),
  ('10000000-0000-0000-0000-000000000003', 'open_letter', 14.00, 3.00),
  ('10000000-0000-0000-0000-000000000003', 'sealed_letter', 22.00, 5.50),
  ('10000000-0000-0000-0000-000000000003', 'open_card', 12.00, 2.70)
on conflict (template_id, wrapper_type) do nothing;

insert into public.app_settings (id, maintenance_mode, allow_new_orders, business_name, currency)
values (1, false, true, 'Dearune', 'GBP')
on conflict (id) do nothing;