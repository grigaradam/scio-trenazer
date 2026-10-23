import type { AnswerMap } from "@/lib/content/public";
import type { TestResult } from "@/lib/scoring";
import type { SectionId } from "@/lib/content/types";

export interface Profile {
  id: string;
  display_name: string | null;
  /** Czech vocative of display_name for greetings ("Adame"); needs migration 0006. */
  display_name_vocative?: string | null;
  /** Public URL of the profile picture in the "avatars" bucket (needs migration 0009). */
  avatar_url?: string | null;
  exam: string;
  onboarded: boolean;
  xp: number;
  streak_current: number;
  streak_best: number;
  last_active_date: string | null;
  daily_goal_min: number;
  practice_time_limit_sec: number | null;
  created_at: string;
  /** Access expired – user must enter a new invite code (needs migration 0002). */
  blocked?: boolean;
  last_seen_at?: string | null;
  invite_code?: string | null;
}

export interface AttemptRow {
  id: string;
  user_id: string;
  exam: string;
  test_id: string;
  is_diagnostic: boolean;
  status: "in_progress" | "completed";
  section_index: number;
  time_left: { verbal: number; analytic: number };
  answers: AnswerMap;
  flags: number[];
  pause_count: number;
  active_seconds: number;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  score: number | null;
  max_score: number | null;
  result: TestResult | null;
  retake_section?: SectionId | null; // set once a one-time retake of an empty section was granted
}

export interface MistakeRow {
  id: string;
  user_id: string;
  exam: string;
  task_ref: string;
  task_type: string;
  source: "test" | "practice";
  attempt_id: string | null;
  status: "open" | "fixed";
  tries: number;
  created_at: string;
  updated_at: string;
}

export interface StudyDay {
  day: string;
  seconds: number;
  tasks: number;
  correct: number;
  xp: number;
}
