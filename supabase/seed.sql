insert into public.testers (id, role, experience_level, home_base, preferred_language, instruction_mode, is_new_tester)
values ('T-102', 'community health worker', 'beginner', 'Vanuatu clinic site', 'bis', 'beginner', true)
on conflict (id) do update set
  role = excluded.role,
  experience_level = excluded.experience_level,
  home_base = excluded.home_base,
  preferred_language = excluded.preferred_language,
  instruction_mode = excluded.instruction_mode,
  is_new_tester = excluded.is_new_tester;

insert into public.language_packs (code, name, downloaded, prompts_json, audio_available)
values
('en', 'English', true, '[{"id":"intro","icon":"👋","tester_instruction":"Confirm the client is ready.","client_prompt":"We will do a simple vision check.","why_this_matters":"This reduces missing data."}]', true),
('tpi', 'Tok Pisin demo', false, '[{"id":"intro","icon":"👋","tester_instruction":"Confirm the client is ready.","client_prompt":"Yumi bai mekim liklik ai test.","why_this_matters":"Local prompts reduce English dependence."}]', true),
('bis', 'Bislama demo', false, '[{"id":"intro","icon":"👋","tester_instruction":"Confirm the client is ready.","client_prompt":"Bambae yumi mekem wan smol ae test.","why_this_matters":"Local prompts reduce English dependence."}]', true)
on conflict (code) do update set
  name = excluded.name,
  downloaded = excluded.downloaded,
  prompts_json = excluded.prompts_json,
  audio_available = excluded.audio_available,
  updated_at = now();
