import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('zitask_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('zitask_token')
      localStorage.removeItem('zitask_user')
      window.location.reload()
    }
    return Promise.reject(err)
  }
)

export default api
