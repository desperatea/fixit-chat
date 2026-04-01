import { PersonAdd as PersonAddIcon } from '@mui/icons-material';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Paper, Switch, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import Header from '../components/Layout/Header';
import { createAgent, deactivateAgent, getAgents } from '../api/agents';
import type { Agent } from '../types';

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', display_name: '' });
  const [error, setError] = useState('');

  const load = () => getAgents().then(setAgents);

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    setError('');
    try {
      await createAgent(form);
      setOpen(false);
      setForm({ username: '', password: '', display_name: '' });
      load();
    } catch (err) {
      setError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Ошибка');
    }
  };

  const handleToggle = async (agent: Agent) => {
    if (agent.is_active) {
      await deactivateAgent(agent.id);
    }
    load();
  };

  return (
    <Box>
      <Header title="Агенты" />
      <Box sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => setOpen(true)}>
            Добавить агента
          </Button>
        </Box>

        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Имя</TableCell>
                <TableCell>Логин</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell>Последний вход</TableCell>
                <TableCell>Активен</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {agents.map((a) => (
                <TableRow key={a.id}>
                  <TableCell><Typography fontWeight={500}>{a.display_name}</Typography></TableCell>
                  <TableCell>{a.username}</TableCell>
                  <TableCell>
                    <Chip
                      label={a.is_active ? 'Активен' : 'Отключён'}
                      color={a.is_active ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {a.last_seen_at
                      ? new Date(a.last_seen_at).toLocaleString('ru-RU')
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <Switch checked={a.is_active} onChange={() => handleToggle(a)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>Новый агент</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
            {error && <Typography color="error" variant="body2">{error}</Typography>}
            <TextField
              label="Имя для отображения"
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              required
            />
            <TextField
              label="Логин"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
            />
            <TextField
              label="Пароль"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              helperText="Минимум 8 символов"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)}>Отмена</Button>
            <Button variant="contained" onClick={handleCreate}>Создать</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
}
