import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const MCP_URL = new URL('https://agent.robinhood.com/mcp/trading')
export const CALLBACK_PORT = 8976
const STORE = 'storage/robinhood.json'

type Store = {
  clientInformation?: OAuthClientInformationMixed
  tokens?: OAuthTokens
  codeVerifier?: string
}

export const load = (): Store => {
  // Fresh server volume: seed the store once from ROBINHOOD_AUTH (base64 of a local
  // storage/robinhood.json). After that the file wins, since refreshed tokens land there.
  const seed = process.env.ROBINHOOD_AUTH
  if (!existsSync(STORE) && seed) {
    mkdirSync('storage', { recursive: true })
    writeFileSync(STORE, Buffer.from(seed, 'base64'), { mode: 0o600 })
  }
  return existsSync(STORE) ? JSON.parse(readFileSync(STORE, 'utf8')) : {}
}
const save = (patch: Store) => {
  mkdirSync('storage', { recursive: true })
  writeFileSync(STORE, JSON.stringify({ ...load(), ...patch }, null, 2), { mode: 0o600 })
}

/** OAuth state (client id, tokens, PKCE verifier) persisted in storage/robinhood.json. */
class FileAuthProvider implements OAuthClientProvider {
  constructor(
    private onRedirect: (url: URL) => void,
    private stateValue?: string
  ) {}

  get redirectUrl() {
    return `http://127.0.0.1:${CALLBACK_PORT}/callback`
  }
  get clientMetadata() {
    return {
      client_name: 'Robinhood Dashboard (local)',
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'internal',
    }
  }
  state = () => this.stateValue ?? ''
  clientInformation = () => load().clientInformation
  saveClientInformation = (clientInformation: OAuthClientInformationMixed) =>
    save({ clientInformation })
  tokens = () => load().tokens
  saveTokens = (tokens: OAuthTokens) => save({ tokens })
  saveCodeVerifier = (codeVerifier: string) => save({ codeVerifier })
  codeVerifier = () => load().codeVerifier ?? ''
  redirectToAuthorization = (url: URL) => this.onRedirect(url)
}

export function createTransport(onRedirect: (url: URL) => void, state?: string) {
  return new StreamableHTTPClientTransport(MCP_URL, {
    authProvider: new FileAuthProvider(onRedirect, state),
  })
}

export const newClient = () => new Client({ name: 'robinhood-dashboard', version: '0.1.0' })

/**
 * Read-only guard: this app never calls order/watchlist/scan-mutating tools.
 * ponytail: prefix match, switch to an explicit allowlist once the endpoints settle.
 */
const READ_ONLY = /^get_/

type ToolClient = Pick<Client, 'callTool' | 'close'>

/**
 * One shared MCP session instead of a new client (OAuth handshake + initialize) per call: a single
 * dashboard refresh makes dozens of calls, and the handshake dominated their latency.
 *
 * - Concurrent callers share one in-flight connect and then one session (MCP multiplexes requests).
 * - A transport-level failure drops the session and retries once on a fresh one, which is exactly
 *   what every call did before, so the worst case is the old behaviour.
 * - A protocol answer from the server (McpError other than a timeout/closed connection) means the
 *   session is healthy: no retry and no teardown.
 * - The session is recycled after MAX_AGE_MS so a stale server-side session can't linger.
 */
export function createToolPool(
  connect: () => Promise<ToolClient>,
  { maxAgeMs = 15 * 60_000, now = Date.now }: { maxAgeMs?: number; now?: () => number } = {}
) {
  let current: { client: Promise<ToolClient>; at: number } | null = null

  const retire = (client: Promise<ToolClient>, delayMs = 0) => {
    // Delay lets calls still in flight on a recycled session finish before it closes.
    const t = setTimeout(() => client.then((c) => c.close()).catch(() => {}), delayMs)
    t.unref?.()
  }

  const session = () => {
    if (current && now() - current.at < maxAgeMs) return current
    const previous = current
    const client = connect()
    const next = { client, at: now() }
    current = next
    client.catch(() => {
      if (current === next) current = null
    })
    if (previous) retire(previous.client, 30_000)
    return next
  }

  const drop = (entry: { client: Promise<ToolClient> }) => {
    if (current === entry) current = null
    retire(entry.client)
  }

  return async function call(name: string, args: Record<string, unknown>) {
    for (let attempt = 0; ; attempt++) {
      const entry = session()
      try {
        const client = await entry.client
        return await client.callTool({ name, arguments: args })
      } catch (err) {
        const healthy =
          err instanceof McpError &&
          err.code !== ErrorCode.RequestTimeout &&
          err.code !== ErrorCode.ConnectionClosed
        if (healthy) throw err
        drop(entry)
        if (attempt >= 1) throw err
      }
    }
  }
}

const pool = createToolPool(async () => {
  const client = newClient()
  await client.connect(
    createTransport(() => {
      throw new Error('Robinhood session expired. Run: node ace robinhood:login')
    })
  )
  return client
})

export async function callTool(name: string, args: Record<string, unknown> = {}) {
  if (!READ_ONLY.test(name)) throw new Error(`Tool "${name}" is not allowed (read-only app)`)
  return pool(name, args)
}
