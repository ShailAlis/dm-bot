const crypto = require('crypto')
const http = require('http')
const storage = require('./storage')

function shouldStartWebhookServer() {
  return Boolean(process.env.PORT || process.env.WEBHOOK_PORT)
}

function getWebhookPort() {
  return Number.parseInt(process.env.PORT || process.env.WEBHOOK_PORT || '3000', 10)
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(payload))
}

function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []

    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    request.on('end', () => resolve(Buffer.concat(chunks)))
    request.on('error', reject)
  })
}

function verifyStripeSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false

  const entries = Object.fromEntries(
    signatureHeader.split(',').map((part) => {
      const [key, value] = part.split('=')
      return [key, value]
    }),
  )

  if (!entries.t || !entries.v1) return false

  const signedPayload = `${entries.t}.${rawBody.toString('utf8')}`
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(entries.v1))
  } catch {
    return false
  }
}

function parseStripeDonation(event) {
  const session = event.data?.object || {}
  const amount = typeof session.amount_total === 'number' ? session.amount_total / 100 : null

  return {
    provider: 'stripe',
    providerEventId: event.id,
    providerReference: session.payment_intent || session.id || null,
    status: event.type,
    amount,
    currency: session.currency ? String(session.currency).toUpperCase() : null,
    donorName: session.customer_details?.name || null,
    donorEmail: session.customer_details?.email || null,
    message: session.metadata?.message || null,
    rawPayload: event,
  }
}

async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET
  const mode = (process.env.PAYPAL_MODE || 'live').toLowerCase()
  const baseUrl = mode === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com'

  if (!clientId || !clientSecret) {
    throw new Error('Faltan PAYPAL_CLIENT_ID o PAYPAL_CLIENT_SECRET')
  }

  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!response.ok) {
    throw new Error(`PayPal OAuth fallo con estado ${response.status}`)
  }

  const data = await response.json()
  return { accessToken: data.access_token, baseUrl }
}

async function verifyPayPalWebhook(headers, eventBody) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID
  if (!webhookId) throw new Error('Falta PAYPAL_WEBHOOK_ID')

  const { accessToken, baseUrl } = await getPayPalAccessToken()
  const response = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: webhookId,
      webhook_event: eventBody,
    }),
  })

  if (!response.ok) {
    throw new Error(`Verificacion de PayPal fallo con estado ${response.status}`)
  }

  const data = await response.json()
  return data.verification_status === 'SUCCESS'
}

function buildPayPalName(resource) {
  const given = resource?.payer?.name?.given_name || resource?.payer_info?.first_name || ''
  const surname = resource?.payer?.name?.surname || resource?.payer_info?.last_name || ''
  return `${given} ${surname}`.trim() || null
}

function parsePayPalDonation(event) {
  const resource = event.resource || {}
  const amountObject = resource.amount || resource.amount_with_breakdown || {}
  const amountValue = amountObject.value || amountObject.total || null
  const amount = amountValue === null ? null : Number.parseFloat(amountValue)
  const currency = amountObject.currency_code || amountObject.currency || null

  return {
    provider: 'paypal',
    providerEventId: event.id,
    providerReference: resource.id || resource.sale_id || resource.supplementary_data?.related_ids?.order_id || null,
    status: event.event_type || 'paypal_event',
    amount: Number.isNaN(amount) ? null : amount,
    currency: currency ? String(currency).toUpperCase() : null,
    donorName: buildPayPalName(resource),
    donorEmail: resource?.payer?.email_address || resource?.payer_info?.email || null,
    message: resource?.custom_id || resource?.invoice_id || null,
    rawPayload: event,
  }
}

async function handleStripeWebhook(request, response) {
  const rawBody = await readRawBody(request)
  const signature = request.headers['stripe-signature']

  if (!verifyStripeSignature(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET)) {
    sendJson(response, 400, { ok: false, error: 'Firma de Stripe no valida' })
    return
  }

  const event = JSON.parse(rawBody.toString('utf8'))
  const supportedEvents = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded'])

  if (supportedEvents.has(event.type)) {
    await storage.upsertDonation(parseStripeDonation(event))
  }

  sendJson(response, 200, { ok: true })
}

async function handlePayPalWebhook(request, response) {
  const rawBody = await readRawBody(request)
  const event = JSON.parse(rawBody.toString('utf8'))

  const verified = await verifyPayPalWebhook(request.headers, event)
  if (!verified) {
    sendJson(response, 400, { ok: false, error: 'Firma de PayPal no valida' })
    return
  }

  const supportedEvents = new Set(['PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.SALE.COMPLETED'])
  if (supportedEvents.has(event.event_type)) {
    await storage.upsertDonation(parsePayPalDonation(event))
  }

  sendJson(response, 200, { ok: true })
}

function startWebhookServer() {
  if (!shouldStartWebhookServer()) return null

  const server = http.createServer(async (request, response) => {
    await handleWebhookRequest(request, response)
  })

  const port = getWebhookPort()
  server.listen(port, () => {
    console.log(`Servidor de webhooks escuchando en el puerto ${port}`)
  })

  return server
}

async function handleWebhookRequest(request, response) {
  try {
    if (request.method === 'GET' && request.url === '/health') {
      sendJson(response, 200, { ok: true })
      return true
    }

    if (request.method === 'POST' && request.url === '/webhooks/stripe') {
      await handleStripeWebhook(request, response)
      return true
    }

    if (request.method === 'POST' && request.url === '/webhooks/paypal') {
      await handlePayPalWebhook(request, response)
      return true
    }

    return false
  } catch (error) {
    console.error('Error procesando webhook:', error)
    sendJson(response, 500, { ok: false, error: 'Error interno' })
    return true
  }
}

function sendWebhookNotFound(response) {
  sendJson(response, 404, { ok: false, error: 'Ruta no encontrada' })
}

module.exports = {
  handleWebhookRequest,
  sendWebhookNotFound,
  startWebhookServer,
}
