import axios, { AxiosError, type AxiosRequestConfig } from 'axios'
import { sessionStore } from '@/auth/session-store'
import type { ApiErrorBody, ApiErrorCode } from './contracts'

export type ClientErrorCode = ApiErrorCode | 'NETWORK' | 'TIMEOUT' | 'CANCELED' | 'UNKNOWN'

/** Normalized error every hook and component receives. */
export class ApiError extends Error {
  status: number
  code: ClientErrorCode
  fields: Record<string, string>
  details: unknown
  constructor(status: number, code: ClientErrorCode, message: string, fields: Record<string, string> = {}, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
    this.details = details
  }
  /** Transient failures are safe to retry (network, timeout, 5xx). */
  get transient() {
    return this.code === 'NETWORK' || this.code === 'TIMEOUT' || this.status >= 500
  }
}

export const http = axios.create({ baseURL: '/api', timeout: 8000 })

http.interceptors.request.use((config) => {
  const { token } = sessionStore.get()
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  config.headers.set('X-Cart-Id', sessionStore.guestCartId())
  return config
})

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    if (axios.isCancel(error)) return Promise.reject(new ApiError(0, 'CANCELED', 'Requisição cancelada.'))
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return Promise.reject(new ApiError(0, 'TIMEOUT', 'O servidor demorou para responder.'))
    }
    if (!error.response) return Promise.reject(new ApiError(0, 'NETWORK', 'Sem conexão com o servidor.'))
    const { status, data } = error.response
    const body = data?.error
    const apiError = new ApiError(status, body?.code ?? 'UNKNOWN', body?.message ?? 'Erro inesperado.', body?.fields ?? {}, body?.details)
    // A 401 on an authenticated request means *that* session is no longer valid. A late 401 for an
    // older token (sent before a new login) must not sign out the newer session.
    const sentAuth = String(error.config?.headers?.Authorization ?? '')
    const current = sessionStore.get().token
    if (status === 401 && current && sentAuth === `Bearer ${current}` && (apiError.code === 'SESSION_EXPIRED' || apiError.code === 'UNAUTHENTICATED')) {
      sessionStore.signOut('expired')
    }
    return Promise.reject(apiError)
  },
)

export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await http.request<T>(config)
  return response.data
}
