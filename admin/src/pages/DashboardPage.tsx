import { Box, Card, CardContent, Grid2 as Grid, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Header from '../components/Layout/Header';
import { getStats, getDailyStats } from '../api/settings';
import type { DashboardStats, DailyStats } from '../types';

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [daily, setDaily] = useState<DailyStats[]>([]);

  useEffect(() => {
    getStats().then(setStats);
    getDailyStats(30).then(setDaily);
  }, []);

  const cards = stats ? [
    { label: 'Всего сессий', value: stats.total_sessions, color: '#1976d2' },
    { label: 'Открытых', value: stats.open_sessions, color: '#2e7d32' },
    { label: 'Закрытых', value: stats.closed_sessions, color: '#757575' },
    { label: 'Сообщений', value: stats.total_messages, color: '#ed6c02' },
    { label: 'Средняя оценка', value: stats.avg_rating?.toFixed(1) ?? '—', color: '#9c27b0' },
  ] : [];

  return (
    <Box>
      <Header title="Дашборд" />
      <Box sx={{ p: 3 }}>
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {cards.map((card) => (
            <Grid key={card.label} size={{ xs: 6, md: 2.4 }}>
              <Card>
                <CardContent sx={{ textAlign: 'center' }}>
                  <Typography variant="h4" fontWeight={700} color={card.color}>
                    {card.value}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {card.label}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {daily.length > 0 && (
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Сессии за 30 дней</Typography>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="sessions" stroke="#1976d2" name="Сессии" />
                  <Line type="monotone" dataKey="messages" stroke="#ed6c02" name="Сообщения" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </Box>
    </Box>
  );
}
