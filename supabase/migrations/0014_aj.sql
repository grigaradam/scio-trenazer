-- Anglický jazyk (AJ): the one-time section retake may now also target the AJ sections.
alter table public.attempts drop constraint if exists attempts_retake_section_check;
alter table public.attempts add constraint attempts_retake_section_check
  check (retake_section in ('verbal', 'analytic', 'reading', 'english'));
