import { Save as SaveIcon } from '@mui/icons-material';
import {
  Alert, Box, Button, Card, CardContent, Grid2 as Grid, Snackbar,
  TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import Header from '../components/Layout/Header';
import { useSettingsStore } from '../store/settingsStore';

export default function SettingsPage() {
  const { settings, loading, fetch, update } = useSettingsStore();
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saved, setSaved] = useState(false);
  // Keep array fields as raw strings during editing to preserve cursor position
  const [fileTypesStr, setFileTypesStr] = useState('');
  const [originsStr, setOriginsStr] = useState('');
  const [ipWhitelistStr, setIpWhitelistStr] = useState('');

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => {
    if (settings) {
      setForm(settings as never);
      setFileTypesStr((settings.allowed_file_types || []).join(', '));
      setOriginsStr((settings.allowed_origins || []).join(', '));
      setIpWhitelistStr((settings.admin_ip_whitelist || []).join(', '));
    }
  }, [settings]);

  const parseList = (s: string) => s.split(',').map((v) => v.trim()).filter(Boolean);

  const handleSave = async () => {
    await update({
      ...form,
      allowed_file_types: parseList(fileTypesStr).map((s) => s.toLowerCase()),
      allowed_origins: parseList(originsStr),
      admin_ip_whitelist: parseList(ipWhitelistStr),
    });
    setSaved(true);
  };

  const set = (key: string, value: unknown) => setForm({ ...form, [key]: value });

  if (!settings) return null;

  return (
    <Box>
      <Header title="Настройки виджета" />
      <Box sx={{ p: 3 }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Внешний вид</Typography>
                <TextField
                  fullWidth label="Заголовок" margin="normal"
                  value={(form.header_title as string) || ''}
                  onChange={(e) => set('header_title', e.target.value)}
                />
                <TextField
                  fullWidth label="Цвет (HEX)" margin="normal"
                  value={(form.primary_color as string) || ''}
                  onChange={(e) => set('primary_color', e.target.value)}
                />
                <TextField
                  fullWidth label="Приветственное сообщение" margin="normal" multiline rows={3}
                  value={(form.welcome_message as string) || ''}
                  onChange={(e) => set('welcome_message', e.target.value)}
                />
                <TextField
                  fullWidth label="Сообщение при закрытии чата" margin="normal" multiline rows={2}
                  value={(form.close_message as string) || ''}
                  onChange={(e) => set('close_message', e.target.value)}
                  helperText="Системное сообщение, которое увидит посетитель при закрытии сессии"
                />
                <TextField
                  fullWidth label="URL логотипа" margin="normal"
                  value={(form.logo_url as string) || ''}
                  onChange={(e) => set('logo_url', e.target.value)}
                />
                <TextField
                  fullWidth label="URL политики конфиденциальности" margin="normal"
                  value={(form.privacy_policy_url as string) || ''}
                  onChange={(e) => set('privacy_policy_url', e.target.value)}
                />
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>Telegram</Typography>
                <TextField
                  fullWidth label="Bot Token" margin="normal"
                  value={(form.telegram_bot_token as string) || ''}
                  onChange={(e) => set('telegram_bot_token', e.target.value)}
                />
                <TextField
                  fullWidth label="Chat ID" margin="normal"
                  value={(form.telegram_chat_id as string) || ''}
                  onChange={(e) => set('telegram_chat_id', e.target.value)}
                />
              </CardContent>
            </Card>

            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>Файлы</Typography>
                <TextField
                  fullWidth label="Разрешённые типы (через запятую)" margin="normal"
                  value={fileTypesStr}
                  onChange={(e) => setFileTypesStr(e.target.value)}
                  helperText="Расширения: jpg, png, gif, webp, pdf, doc, docx, xls, xlsx"
                />
                <TextField
                  fullWidth label="Макс. размер файла (МБ)" margin="normal" type="number"
                  value={(form.max_file_size_mb as number) || 10}
                  onChange={(e) => set('max_file_size_mb', parseInt(e.target.value) || 10)}
                  helperText="По умолчанию 10 МБ"
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Безопасность</Typography>
                <TextField
                  fullWidth label="Допустимые домены (через запятую)" margin="normal"
                  value={originsStr}
                  onChange={(e) => setOriginsStr(e.target.value)}
                  helperText="Например: https://fixitmail.ru"
                />
                <TextField
                  fullWidth label="IP whitelist для админки (через запятую)" margin="normal"
                  value={ipWhitelistStr}
                  onChange={(e) => setIpWhitelistStr(e.target.value)}
                  helperText="Пусто = доступ со всех IP"
                />
                <TextField
                  fullWidth label="Автозакрытие (мин)" margin="normal" type="number"
                  value={(form.auto_close_minutes as number) || 1440}
                  onChange={(e) => set('auto_close_minutes', parseInt(e.target.value))}
                />
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained" size="large"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </Box>

        <Snackbar open={saved} autoHideDuration={3000} onClose={() => setSaved(false)}>
          <Alert severity="success">Настройки сохранены</Alert>
        </Snackbar>
      </Box>
    </Box>
  );
}
