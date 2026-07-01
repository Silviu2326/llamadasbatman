export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('vozia_token')
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (res.status === 401) {
    localStorage.removeItem('vozia_token')
    localStorage.removeItem('vozia_user')
    window.location.href = '/login'
  }
  return res
}
