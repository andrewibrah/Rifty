const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
const size = 12

const resolveCrypto = (): Crypto | undefined => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    return globalThis.crypto
  }
  try {
    // eslint-disable-next-line global-require
    const { webcrypto } = require('crypto') as { webcrypto?: Crypto }
    if (webcrypto?.getRandomValues) {
      return webcrypto
    }
  } catch (error) {
    // Ignore require failures and fall through
  }
  return undefined
}

export const nanoid = (): string => {
  const cryptoObj = resolveCrypto()
  if (!cryptoObj) {
    throw new Error('Secure random generation is not supported in this environment.')
  }

  const result: string[] = []
  const limit = Math.floor(256 / alphabet.length) * alphabet.length

  const randomBytes = new Uint8Array(size * 2)
  while (result.length < size) {
    cryptoObj.getRandomValues(randomBytes)
    for (let i = 0; i < randomBytes.length && result.length < size; i += 1) {
      const randomByte = randomBytes[i]!
      if (randomByte >= limit) {
        continue
      }
      const index = randomByte % alphabet.length
      result.push(alphabet.charAt(index))
    }
  }

  return result.join('')
}
