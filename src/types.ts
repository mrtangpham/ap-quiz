export type UUID = string;

export type Room = {
  id: UUID;
  room_code: string;
  quiz_id: UUID;
  status: 'waiting' | 'running' | 'ended';
  current_question_order: number | null;
  current_question_id: UUID | null;
  question_start_at: string | null; // ISO timestamptz
  admin_secret: string;
  created_at: string;
};

export type Quiz = {
  id: UUID;
  title: string;
  created_by: string | null;
  created_at: string;
};

export type Question = {
  id: UUID;
  quiz_id: UUID;
  order: number;
  content: string;
  time_limit_sec: number;
};

export type Option = {
  id: UUID;
  question_id: UUID;
  label: 'A' | 'B' | 'C' | 'D';
  content: string;
};

export type Participant = {
  id: UUID;
  room_id: UUID;
  client_id: UUID;
  nickname: string;
  joined_at: string;
  is_present: boolean;
};

export type Score = {
  id: UUID;
  room_id: UUID;
  participant_id: UUID;
  question_id: UUID;
  points: number;
  created_at: string;
};

export type LeaderboardRow = {
  room_id: UUID;
  participant_id: UUID;
  nickname: string;
  total_points: number;
  rank: number;
};
