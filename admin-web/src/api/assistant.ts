import client from './client'

export interface McpStatusSnapshot {
  enabled: boolean
  local_server_running: boolean
  local_sse_url: string | null
  official_endpoint_configured: boolean
  official_bridge_enabled: boolean
  official_bridge_connected: boolean
  tools: string[]
  reason: string | null
}

export interface AssistantStatusSnapshot {
  enabled: boolean
  mode: 'official' | 'local'
  local_available: boolean
  configured: boolean
  pairing_required: boolean
  codec_available: boolean
  device_id: string | null
  client_id: string | null
  endpoint_host: string | null
  input_sample_rate: number
  output_sample_rate: number
  frame_duration_ms: number
  mcp: McpStatusSnapshot | null
}

export async function getAssistantStatus(): Promise<AssistantStatusSnapshot> {
  const resp = await client.get('/assistant/status')
  return resp.data as AssistantStatusSnapshot
}
