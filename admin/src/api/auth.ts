import axios from 'axios';

export async function login(username: string, password: string): Promise<void> {
  await axios.post('/api/v1/admin/auth/login', { username, password }, {
    withCredentials: true,
  });
  // Access token is set as httpOnly cookie by the server — nothing to store
}

export async function logout(): Promise<void> {
  await axios.post('/api/v1/admin/auth/logout', null, {
    withCredentials: true,
  }).catch(() => {});
}

export async function checkAuth(): Promise<boolean> {
  try {
    await axios.get('/api/v1/admin/auth/me', { withCredentials: true });
    return true;
  } catch {
    return false;
  }
}
