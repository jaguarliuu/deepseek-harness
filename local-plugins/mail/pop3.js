/** Bounded, read-only POP3 transactions. */
import Pop3Command from 'node-pop3'

export class MailError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

async function collect(stream, limit) {
  const chunks = []
  let bytes = 0
  for await (const chunk of stream) {
    bytes += chunk.length
    if (bytes > limit) throw new MailError('size', 'The POP3 response exceeds the configured size limit.')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function parseListing(bytes, uidl) {
  const entries = new Map()
  for (const line of bytes.toString('ascii').split('\r\n')) {
    if (!line) continue
    const match = /^(\d+) +([!-~]{1,70})$/.exec(line)
    const number = Number(match?.[1])
    const value = match?.[2]
    if (!Number.isSafeInteger(number) || number < 1 || entries.has(number)
      || (!uidl && !/^\d+$/.test(value))) {
      throw new MailError('listing', 'The POP3 server returned an invalid mail listing.')
    }
    entries.set(number, uidl ? value : Number(value))
  }
  return entries
}

/** Run a single authenticated transaction, closing its socket on cancellation or failure. */
export async function withPop3(config, password, signal, operation) {
  if (/[\r\n\0]|\s$/.test(password)) throw new MailError('credential', 'The POP3 credential contains an invalid character.')
  const client = new Pop3Command({
    host: config.host, port: config.port, user: config.username, password, tls: true,
    ...(config.ca ? { tlsOptions: { ca: config.ca } } : {}),
    timeout: config.timeoutMs, parseStreamToString: false,
  })
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs)])
  // node-pop3 exposes no public way to abort an in-flight transaction.
  let socket
  const close = () => socket?.destroy()
  const command = async (name, ...args) => {
    deadline.throwIfAborted()
    return client.command(name, ...args)
  }
  deadline.throwIfAborted()
  deadline.addEventListener('abort', close, { once: true })
  try {
    try {
      const connected = client.connect()
      socket = client._socket
      // An EOF during a command or multiline response must reject its consumer.
      socket.once('close', () => client.emit('error', new MailError('connection', 'The POP3 connection closed.')))
      await connected
    } catch {
      throw new MailError('connection', 'POP3 connection failed. Check the network, port and TLS certificate.')
    }
    try {
      await command('USER', config.username)
      await command('PASS', password)
    } catch {
      throw new MailError('auth', 'POP3 login failed. Check the login and credential.')
    }
    let identifiers
    try {
      const [, stream] = await command('UIDL')
      identifiers = parseListing(await collect(stream, config.maxListingBytes), true)
    } catch (error) {
      if (error instanceof MailError) throw error
      if (error.command === 'UIDL' && error.eventName === 'error' && !deadline.aborted) {
        throw new MailError('uidl', 'POP3 UIDL was rejected. Check UIDL support with the mail administrator.')
      }
      throw error
    }
    const result = await operation({
      identifiers,
      async sizes() {
        const [, stream] = await command('LIST')
        return parseListing(await collect(stream, config.maxListingBytes), false)
      },
      async fetch(number, headers) {
        let stream
        try {
          const result = headers ? await command('TOP', number, 0) : await command('RETR', number)
          stream = result[1]
        } catch (error) {
          if (headers && error.command === `TOP ${number} 0` && error.eventName === 'error') {
            throw new MailError('top-unsupported', 'The POP3 server rejected TOP.')
          }
          throw error
        }
        const bytes = await collect(stream, config.maxMessageBytes)
        return Buffer.from(bytes.toString('latin1').replace(/(^|\r\n)\.\./g, '$1.'), 'latin1')
      },
    })
    await command('QUIT')
    return result
  } catch (error) {
    signal.throwIfAborted()
    if (deadline.aborted) throw new MailError('timeout', 'The POP3 check timed out. Try again or check the network.')
    if (error instanceof MailError) throw error
    throw new MailError('pop3', 'The POP3 operation failed. Check the mail server and retry.')
  } finally {
    deadline.removeEventListener('abort', close)
    close()
  }
}
