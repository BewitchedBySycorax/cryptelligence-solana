import http from 'node:http'
import https from 'node:https'

import * as solanaWeb3 from '@solana/web3.js'

const PORT = process.env.PORT || 8000

const { JUP_TOKEN, ALCHEMY_API_KEY } = process.env

const URL_DEXSCREENER = `https://api.dexscreener.com/latest/dex/tokens/${JUP_TOKEN}`
const URL_ALCHEMY = `https://solana-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`

const solanaConnection = new solanaWeb3.Connection(URL_ALCHEMY)
const tokenMintAddress = new solanaWeb3.PublicKey(JUP_TOKEN)

const routing = {
  token: '/token/'
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET') {
      switch(req.url) {
        case routing.token:
          const jupData = await getJupData()
  
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(jupData))
          break
        default:
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ msg: 'Not found!' }))
      }
    }
  } catch (e) {
    console.error('Error in requestHandler of http.createServer()', e)
  }
})

server.listen(PORT, () => {
  console.log('Server is running on port', PORT)
})

//

async function getJupData() {
  try {
    const jupUsdLiquidity = await getJupUsdLiquidity()
    const tokenAccounts = await getLargestTokenAccounts()
    let transactionInfo = null
  
    if (tokenAccounts?.length > 0) {
      transactionInfo = await getLastTokenPurchaseTransactionForAccounts(tokenAccounts)
    }

    return {
      jupUsdLiquidity,
      transactionInfo
    }
  } catch (e) {
    console.error('Error in getJupData()', e)
  }
}

async function getJupUsdLiquidity() {
  try {
    const pairsByTokenAddress = await getHTTPS(URL_DEXSCREENER)
    const jupUsdLiquidity = JSON.parse(pairsByTokenAddress).pairs[0].liquidity.usd 

    console.log('JUP / USD Liquidity:', jupUsdLiquidity)

    return jupUsdLiquidity
  } catch (e) {
    console.error('Error in getJupUsdLiquidity()', e)
  }
}

async function getLargestTokenAccounts() {
  try {
    const response = await solanaConnection.getTokenLargestAccounts(tokenMintAddress)
    const tokenAccounts = response.value.map(account => account.address.toBase58())

    console.log('Token Accounts:', tokenAccounts)

    return tokenAccounts
  } catch (e) {
    console.error('Error in getLargestTokenAccounts():', e)
  }
}

async function getLastTokenPurchaseTransactionForAccounts(tokenAccounts) {
  try {
    for (let accountAddress of tokenAccounts) {
      const accountPublicKey = new solanaWeb3.PublicKey(accountAddress)
      const signatures = await solanaConnection.getSignaturesForAddress(accountPublicKey)

      for (let signatureInfo of signatures) {
        const transaction = await solanaConnection.getTransaction(signatureInfo.signature, { maxSupportedTransactionVersion: 0 })

        if (transaction) {
          const { meta, transaction: { message } } = transaction

          // Возможно, в message есть полезная информация

          if (meta?.preTokenBalances && meta?.postTokenBalances) {
            const uniqueTokens = new Set()

            meta.preTokenBalances.forEach(balance => uniqueTokens.add(balance.mint))
            meta.postTokenBalances.forEach(balance => uniqueTokens.add(balance.mint))

            if (uniqueTokens.size > 1) {
              console.log('Last Token Purchase Transaction:', transaction)
              console.log('Slot Number:', transaction.slot)

              return {
                transaction,
                slot: transaction.slot
              }
            }
          }
        }
      }
    }

    console.log('No token purchase transactions found.')

    return null
  } catch (e) {
    console.error('Error in getLastTokenPurchaseTransactionForAccounts():', e)
  }
}

async function getHTTPS(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = ''
    
      res.on('data', (chunk) => {
        data += chunk
      })
    
      res.on('end', () => {
        resolve(data)
      })
    })

    req.on('error', (e) => {
      reject(e)
    })

    req.end()
  })
}
