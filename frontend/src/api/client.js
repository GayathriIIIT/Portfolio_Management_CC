async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (res.status === 204) return null

  const isJson = res.headers.get('content-type')?.includes('application/json')
  const body = isJson ? await res.json() : null

  if (!res.ok) {
    throw new Error(body?.error || `Request failed with status ${res.status}`)
  }

  return body
}

export const get = (path) => request(path)
export const post = (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) })
export const put = (path, data) => request(path, { method: 'PUT', body: JSON.stringify(data) })
export const del = (path) => request(path, { method: 'DELETE' })
