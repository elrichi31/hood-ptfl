import { Client } from '@modelcontextprotocol/sdk/client/index.js'
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

export async function callTool(name: string, args: Record<string, unknown> = {}) {
  if (!READ_ONLY.test(name)) throw new Error(`Tool "${name}" is not allowed (read-only app)`)
  const client = newClient()
  await client.connect(
    createTransport(() => {
      throw new Error('Robinhood session expired. Run: node ace robinhood:login')
    })
  )
  try {
    return await client.callTool({ name, arguments: args })
  } finally {
    await client.close()
  }
}
