export interface Agent {
  id: string;
  username: string;
  display_name: string;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  visitor_name: string;
  visitor_phone: string | null;
  visitor_org: string | null;
  initial_message: string;
  status: 'open' | 'closed';
  rating: number | null;
  consent_given: boolean;
  custom_fields: Record<string, unknown> | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  unread_count: number;
}

export interface SessionList {
  items: Session[];
  total: number;
  offset: number;
  limit: number;
}

export interface Message {
  id: string;
  session_id: string;
  sender_type: 'visitor' | 'agent' | 'system';
  sender_id: string | null;
  content: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  attachments: Attachment[];
}

export interface Attachment {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  created_at: string;
}

export interface Note {
  id: string;
  session_id: string;
  agent_id: string | null;
  agent_name: string | null;
  content: string;
  created_at: string;
}

export interface DashboardStats {
  total_sessions: number;
  open_sessions: number;
  closed_sessions: number;
  total_messages: number;
  avg_rating: number | null;
  avg_response_time_seconds: number | null;
}

export interface DailyStats {
  date: string;
  sessions: number;
  messages: number;
  avg_rating: number | null;
}

export interface WidgetSettings {
  primary_color: string;
  header_title: string;
  welcome_message: string;
  logo_url: string | null;
  auto_close_minutes: number;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  allowed_file_types: string[];
  max_file_size_mb: number;
  privacy_policy_url: string | null;
  form_fields: unknown[];
  allowed_origins: string[];
  admin_ip_whitelist: string[];
  smartcaptcha_key: string | null;
  updated_at: string;
}

export interface WSEvent {
  type: string;
  data: Record<string, unknown>;
}
