import { AttachFile as AttachIcon, Close as CloseIcon, Refresh as RefreshIcon, Send as SendIcon } from '@mui/icons-material';
import {
  Box, Button, Chip, Divider, IconButton, Paper, TextField, Typography,
} from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import Header from '../components/Layout/Header';
import { uploadFile } from '../api/sessions';
import { useSessionStore } from '../store/sessionStore';
import { notifyError } from '../store/notificationStore';
import { useWebSocket } from '../hooks/useWebSocket';

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const {
    activeSession, messages, notes, fetchSession, fetchMessages, fetchNotes,
    sendMessage, closeSession, reopenSession, addNote, markRead,
  } = useSessionStore();
  const [input, setInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    try {
      const msg = await uploadFile(id, file);
      useSessionStore.getState().addIncomingMessage(msg);
    } catch (err) {
      notifyError(err, 'Не удалось загрузить файл');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
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

          {/* Messages + inline ratings */}
          <Box sx={{ flex: 1, overflow: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {(() => {
              // Merge messages and ratings into a single timeline
              const ratingItems = (activeSession.ratings || []).map((r) => ({
                type: 'rating' as const,
                id: `rating-${r.id}`,
                created_at: r.created_at,
                rating: r.rating,
              }));
              const msgItems = messages.map((m) => ({
                type: 'message' as const,
                id: m.id,
                created_at: m.created_at,
                msg: m,
              }));
              const timeline = [...msgItems, ...ratingItems].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
              );

              return timeline.map((item) => {
                if (item.type === 'rating') {
                  return (
                    <Box key={item.id} id={item.id} sx={{ alignSelf: 'center', my: 0.5 }}>
                      <Chip
                        label={`Оценка: ${'★'.repeat(item.rating)}${'☆'.repeat(5 - item.rating)}`}
                        size="small"
                        color={item.rating >= 4 ? 'success' : item.rating >= 3 ? 'warning' : 'error'}
                        variant="outlined"
                        sx={{ fontSize: '0.75rem' }}
                      />
                    </Box>
                  );
                }
                const msg = item.msg;
                if (msg.sender_type === 'system') {
                  return (
                    <Box key={msg.id} sx={{ alignSelf: 'center', my: 0.5 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                        {msg.content}
                        {' — '}
                        {new Date(msg.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      </Typography>
                    </Box>
                  );
                }
                return (
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
                      {/* Hide "(файл)" text when message has attachments */}
                      {!(msg.content === '(файл)' && msg.attachments?.length > 0) && (
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                          {msg.content}
                        </Typography>
                      )}
                      {msg.attachments?.map((att) => {
                        const url = `/api/v1/admin/sessions/${msg.session_id}/files/${att.id}`;
                        return att.mime_type.startsWith('image/') ? (
                          <Box key={att.id} sx={{ mt: 0.5 }}>
                            <img
                              src={url}
                              alt={att.file_name}
                              style={{ maxWidth: 200, maxHeight: 200, borderRadius: 8, cursor: 'pointer', display: 'block' }}
                              onClick={() => window.open(url, '_blank')}
                            />
                          </Box>
                        ) : (
                          <Box key={att.id} sx={{ mt: 0.5 }}>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: 13, color: 'inherit' }}
                            >
                              📎 {att.file_name} ({(att.file_size / 1024).toFixed(0)} KB)
                            </a>
                          </Box>
                        );
                      })}
                      <Typography variant="caption" sx={{ opacity: 0.7, display: 'block', textAlign: 'right', mt: 0.5 }}>
                        {new Date(msg.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      </Typography>
                    </Paper>
                  </Box>
                );
              });
            })()}
            {isVisitorTyping && (
              <Typography variant="caption" color="text.secondary" sx={{ pl: 1, fontStyle: 'italic' }}>
                Посетитель печатает...
              </Typography>
            )}
            <div ref={messagesEndRef} />
          </Box>

          {/* Input — always visible, agent can write to closed sessions (auto-reopens) */}
          <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', display: 'flex', gap: 1 }}>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            <IconButton color="default" onClick={() => fileInputRef.current?.click()} title="Прикрепить файл">
              <AttachIcon />
            </IconButton>
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

        {/* Sidebar: Ratings + Notes */}
        <Box sx={{ width: 300, borderLeft: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
          {/* Ratings section */}
          {activeSession.ratings && activeSession.ratings.length > 0 && (
            <>
              <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="subtitle2">Оценки</Typography>
              </Box>
              <Box sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
                {activeSession.ratings.map((r) => (
                  <Box
                    key={r.id}
                    sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' }, borderRadius: 1, px: 0.5 }}
                    onClick={() => {
                      const el = document.getElementById(`rating-${r.id}`);
                      if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        el.style.transition = 'background 0.3s';
                        el.style.background = '#fff3cd';
                        setTimeout(() => { el.style.background = ''; }, 1500);
                      }
                    }}
                  >
                    <Chip
                      label={'★'.repeat(r.rating) + '☆'.repeat(5 - r.rating)}
                      size="small"
                      color={r.rating >= 4 ? 'success' : r.rating >= 3 ? 'warning' : 'error'}
                      variant="outlined"
                    />
                    <Typography variant="caption" color="text.secondary">
                      {new Date(r.created_at).toLocaleString('ru-RU')}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </>
          )}

          {/* Notes section */}
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
