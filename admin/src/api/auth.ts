import axios from 'axios';

export async function login(username: string, password: string): Promise<string> {
  const { data } = await axios.post('/api/v1/admin/auth/login', { username, password }, {
    withCredentials: true,
  });
  return data.access_token;
}

export async function logout(): Promise<void> {
  const token = sessionStorage.getItem('access_token');
  await axios.post('/api/v1/admin/auth/logout', null, {
    headers: { Authorization: `Bearer ${token}` },
    withCredentials: true,
  }).catch(() => {});
  sessionStorage.removeItem('access_token');
}
