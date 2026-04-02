import { Close as CloseIcon, Refresh as RefreshIcon, Send as SendIcon } from '@mui/icons-material';
import {
  Box, Button, Chip, Divider, IconButton, Paper, TextField, Typography,
} from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import Header from '../components/Layout/Header';
import { useSessionStore } from '../store/sessionStore';
import { useWebSocket } from '../hooks/useWebSocket';

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const {
    activeSession, messages, notes, fetchSession, fetchMessages, fetchNotes,
    sendMessage, closeSession, reopenSession, addNote, markRead,
  } = useSessionStore();
  const [input, setInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { sendTyping } = useWebSocket();
  const typingSessionIds = useSessionStore((s) => s.typingSessionIds);
  const isVisitorTyping = id ? typingSessionIds.has(id) : false;

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    if (!id) return;
    if (!typingTimer.current) {
      sendTyping(id);
    } else {
      clearTimeout(typingTimer.current);
    }
    typingTimer.current = setTimeout(() => {
      typingTimer.current = null;
    }, 2000);
  }, [id, sendTyping]);

  useEffect(() => {
    if (!id) return;
    fetchSession(id);
    fetchMessages(id);
    fetchNotes(id);
  }, [id, fetchSession, fetchMessages, fetchNotes]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    // Mark unread visitor messages
    if (id) {
      const unread = messages.filter((m) => m.sender_type === 'visitor' && !m.is_read).map((m) => m.id);
      if (unread.length > 0) markRead(id, unread);
    }
  }, [messages, id, markRead]);

  const handleSend = async () => {
    if (!input.trim() || !id) return;
    await sendMessage(id, input.trim());
    setInput('');
  };

  const handleAddNote = async () => {
    if (!noteInput.trim() || !id) return;
    await addNote(id, noteInput.trim());
    setNoteInput('');
  };

  const formatPhone = (phone: string | null) => {
    if (!phone) return 'Без телефона';
    return phone.replace(/^\+7/, '8');
  };

  if (!activeSession) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Header title={`${activeSession.visitor_name} — ${formatPhone(activeSession.visitor_phone)}`} />

      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Chat area */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Session info bar */}
          <Box sx={{ p: 1.5, display: 'flex', gap: 1, alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
            <Chip
              label={activeSession.status === 'open' ? 'Открыта' : 'Закрыта'}
              color={activeSession.status === 'open' ? 'success' : 'default'}
              size="small"
            />
            {activeSession.visitor_org && (
              <Typography variant="body2" color="text.secondary">{activeSession.visitor_org}</Typography>
            )}
            {activeSession.status === 'open' && (
              <Button
                size="small"
                color="warning"
                startIcon={<CloseIcon />}
                onClick={() => id && closeSession(id)}
                sx={{ ml: 'auto' }}
              >
                Закрыть
              </Button>
            )}
            {activeSession.status === 'closed' && (
              <Button
                size="small"
                color="primary"
                startIcon={<RefreshIcon />}
                onClick={() => id && reopenSession(id)}
                sx={{ ml: 'auto' }}
              >
                Переоткрыть
              </Button>
            )}
          </Box>

          {/* Messages */}
          <Box sx={{ flex: 1, overflow: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {messages.map((msg) => (
              <Box
                key={msg.id}
                sx={{
                  alignSelf: msg.sender_type === 'visitor' ? 'flex-start' : 'flex-end',
                  maxWidth: '70%',
                }}
              >
                <Paper
                  sx={{
                    p: 1.5,
                    bgcolor: msg.sender_type === 'visitor' ? 'grey.100' : 'primary.main',
                    color: msg.sender_type === 'visitor' ? 'text.primary' : 'white',
                    borderRadius: 2,
                  }}
                >
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {msg.content}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.7, display: 'block', textAlign: 'right', mt: 0.5 }}>
                    {new Date(msg.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </Typography>
                </Paper>
              </Box>
            ))}
            {isVisitorTyping && (
              <Typography variant="caption" color="text.secondary" sx={{ pl: 1, fontStyle: 'italic' }}>
                Посетитель печатает...
              </Typography>
            )}
            <div ref={messagesEndRef} />
          </Box>

          {/* Input — always visible, agent can write to closed sessions (auto-reopens) */}
          <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              size="small"
              placeholder={activeSession.status === 'closed' ? 'Написать (переоткроет сессию)...' : 'Написать ответ...'}
              value={input}
              onChange={handleInputChange}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              multiline
              maxRows={4}
            />
            <IconButton color="primary" onClick={handleSend} disabled={!input.trim()}>
              <SendIcon />
            </IconButton>
          </Box>
        </Box>

        {/* Notes sidebar */}
        <Box sx={{ width: 300, borderLeft: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="subtitle2">Внутренние заметки</Typography>
          </Box>
          <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
            {notes.map((note) => (
              <Paper key={note.id} variant="outlined" sx={{ p: 1.5, mb: 1 }}>
                <Typography variant="body2">{note.content}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {note.agent_name} — {new Date(note.created_at).toLocaleString('ru-RU')}
                </Typography>
              </Paper>
            ))}
          </Box>
          <Divider />
          <Box sx={{ p: 1.5, display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Заметка..."
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddNote(); } }}
            />
            <Button size="small" onClick={handleAddNote} disabled={!noteInput.trim()}>
              +
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
