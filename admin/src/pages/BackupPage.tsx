import { Backup as BackupIcon, Download as DownloadIcon } from '@mui/icons-material';
import {
  Box, Button, Chip, CircularProgress,
  Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import Header from '../components/Layout/Header';
import api from '../api/client';
import { notifyError } from '../store/notificationStore';
import { useNotificationStore } from '../store/notificationStore';

interface BackupFile {
  name: string;
  size: number;
  size_human: string;
  created_at: string;
  type: 'database' | 'uploads';
}

export default function BackupPage() {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchBackups = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/backup');
      setBackups(data.backups);
    } catch (err) {
      notifyError(err, 'Не удалось загрузить список бэкапов');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchBackups(); }, [fetchBackups]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const { data } = await api.post('/backup');
      if (data.status === 'ok') {
        useNotificationStore.getState().push('Бэкап создан', 'success');
        fetchBackups();
      } else {
        useNotificationStore.getState().push(data.message || 'Ошибка', 'error');
      }
    } catch (err) {
      notifyError(err, 'Не удалось создать бэкап');
    }
    setCreating(false);
  };

  const handleDownload = (name: string) => {
    window.open(`/api/v1/admin/backup/${name}`, '_blank');
  };

  return (
    <Box>
      <Header title="Бэкапы" />
      <Box sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="body2" color="text.secondary">
            Бэкап включает дамп PostgreSQL и загруженные файлы. Хранятся 30 дней.
          </Typography>
          <Button
            variant="contained"
            startIcon={creating ? <CircularProgress size={18} color="inherit" /> : <BackupIcon />}
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? 'Создание...' : 'Создать бэкап'}
          </Button>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : backups.length === 0 ? (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            Бэкапов пока нет
          </Typography>
        ) : (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Файл</TableCell>
                  <TableCell>Тип</TableCell>
                  <TableCell>Размер</TableCell>
                  <TableCell>Дата</TableCell>
                  <TableCell align="right">Действие</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {backups.map((b) => (
                  <TableRow key={b.name}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {b.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={b.type === 'database' ? 'БД' : 'Файлы'}
                        size="small"
                        color={b.type === 'database' ? 'primary' : 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>{b.size_human}</TableCell>
                    <TableCell>
                      {new Date(b.created_at).toLocaleString('ru-RU')}
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        startIcon={<DownloadIcon />}
                        onClick={() => handleDownload(b.name)}
                      >
                        Скачать
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Box>
  );
}
