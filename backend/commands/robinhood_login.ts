import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync } from 'node:fs'
import { CALLBACK_PORT, createTransport, newClient } from '#services/robinhood'

export default class RobinhoodLogin extends BaseCommand {
  static commandName = 'robinhood:login'
  static description =
    'Authorize this app with Robinhood (OAuth), then dump tool list + raw get_accounts/get_portfolio to storage/probe.json'
  static options: CommandOptions = { startApp: false }

  /** Starts the localhost callback server; resolves with the auth code. */
  private waitForCode(state: string) {
    return new Promise<string>((resolve, reject) => {
      const server = createServer((req, res) => {
        const url = new URL(req.url!, `http://127.0.0.1:${CALLBACK_PORT}`)
        if (url.pathname !== '/callback') return res.writeHead(404).end()
        const code = url.searchParams.get('code')
        const ok = code && url.searchParams.get('state') === state
        res.end(ok ? 'Robinhood connected. You can close this tab.' : 'Authorization failed.')
        server.close()
        ok ? resolve(code) : reject(new Error('Bad OAuth callback (missing code or state mismatch)'))
      })
      server.listen(CALLBACK_PORT, '127.0.0.1')
    })
  }

  async run() {
    const state = randomUUID()
    const codePromise = this.waitForCode(state)
    codePromise.catch(() => {}) // surfaced below only if we actually await it

    const transport = createTransport((url) => {
      this.logger.info('Open this URL in your desktop browser and approve access:')
      console.log(`\n${url}\n`)
    }, state)

    let client = newClient()
    try {
      await client.connect(transport)
    } catch (e) {
      if (!(e instanceof UnauthorizedError)) throw e
      await transport.finishAuth(await codePromise)
      client = newClient()
      await client.connect(createTransport(() => {}, state))
    }
    this.logger.success('Connected to Robinhood MCP')

    const { tools } = await client.listTools()
    this.logger.info(`${tools.length} tools: ${tools.map((t) => t.name).join(', ')}`)

    const call = (name: string) =>
      client.callTool({ name, arguments: {} }).catch((err) => ({ error: String(err) }))
    mkdirSync('storage', { recursive: true })
    writeFileSync(
      'storage/probe.json',
      JSON.stringify(
        { tools, accounts: await call('get_accounts'), portfolio: await call('get_portfolio') },
        null,
        2
      )
    )
    this.logger.success('Wrote storage/probe.json (contains account numbers — do not commit)')
    await client.close()
    process.exit(0)
  }
}
