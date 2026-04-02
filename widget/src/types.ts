export interface WidgetSettings {
  primary_color: string;
  header_title: string;
  welcome_message: string;
  logo_url: string | null;
  privacy_policy_url: string | null;
  form_fields: FormField[];
  allowed_file_types: string[];
  max_file_size_mb: number;
}

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'tel' | 'email' | 'textarea';
  required: boolean;
}

export interface Session {
  id: string;
  visitor_token: string;
  status: string;
  created_at: string;
}

export interface Message {
  id: string;
  session_id: string;
  sender_type: 'visitor' | 'agent' | 'system';
  sender_id: string | null;
  content: string;
  is_read: boolean;
  created_at: string;
  attachments: Attachment[];
}

export interface Attachment {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
}

export interface WSEvent {
  type: 'message' | 'typing' | 'read' | 'session_closed' | 'session_reopened' | 'new_message' | 'auth_ok' | 'error';
  data: Record<string, unknown>;
}

export interface WidgetConfig {
  apiUrl: string;
  wsUrl: string;
}
