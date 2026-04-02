import { Chat as ChatIcon } from '@mui/icons-material';
import {
  Box, Chip, IconButton, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, TextField, ToggleButton, ToggleButtonGroup,
  Typography, Badge, TablePagination,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Layout/Header';
import { useSessionStore } from '../store/sessionStore';

function formatPhone(phone: string | null): string {
  if (!phone) return '—';
  return phone.replace(/^\+7/, '8');
}

export default function SessionListPage() {
  const { sessions, total, loading, fetchSessions } = useSessionStore();
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const limit = 20;
  const navigate = useNavigate();

  useEffect(() => {
    fetchSessions({
      status: status || undefined,
      search: search || undefined,
      offset: page * limit,
      limit,
    });
  }, [status, search, page, fetchSessions]);

  return (
    <Box>
      <Header title="Сессии" />
      <Box sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder="Поиск по имени..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            sx={{ width: 300 }}
          />
          <ToggleButtonGroup
            size="small"
            value={status}
            exclusive
            onChange={(_, v) => { setStatus(v || ''); setPage(0); }}
          >
            <ToggleButton value="">Все</ToggleButton>
            <ToggleButton value="open">Открытые</ToggleButton>
            <ToggleButton value="closed">Закрытые</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Имя</TableCell>
                <TableCell>Телефон</TableCell>
                <TableCell>Сообщение</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell>Дата</TableCell>
                <TableCell align="center">Чат</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} align="center">Загрузка...</TableCell>
                </TableRow>
              )}
              {!loading && sessions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography color="text.secondary">Нет сессий</Typography>
                  </TableCell>
                </TableRow>
              )}
              {sessions.map((s) => (
                <TableRow
                  key={s.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/admin/sessions/${s.id}`)}
                >
                  <TableCell>
                    <Typography fontWeight={500}>{s.visitor_name}</Typography>
                    {s.visitor_org && (
                      <Typography variant="caption" color="text.secondary">{s.visitor_org}</Typography>
                    )}
                  </TableCell>
                  <TableCell>{formatPhone(s.visitor_phone)}</TableCell>
                  <TableCell sx={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.initial_message}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={s.status === 'open' ? 'Открыта' : 'Закрыта'}
                      color={s.status === 'open' ? 'success' : 'default'}
                      size="small"
                    />
                    {s.rating && <Chip label={`${'★'.repeat(s.rating)}`} size="small" sx={{ ml: 0.5 }} />}
                  </TableCell>
                  <TableCell>
                    {new Date(s.created_at).toLocaleDateString('ru-RU')}
                  </TableCell>
                  <TableCell align="center">
                    <IconButton size="small">
                      <Badge badgeContent={s.unread_count} color="error">
                        <ChatIcon />
                      </Badge>
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={limit}
          rowsPerPageOptions={[limit]}
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} из ${count}`}
        />
      </Box>
    </Box>
  );
}
