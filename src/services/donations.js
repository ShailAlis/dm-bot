function getDonationProviders() {
  const providers = []

  if (process.env.DONATION_STRIPE_URL) {
    providers.push({
      id: 'stripe',
      label: 'Donar con Stripe',
      url: process.env.DONATION_STRIPE_URL,
    })
  }

  if (process.env.DONATION_PAYPAL_URL) {
    providers.push({
      id: 'paypal',
      label: 'Donar con PayPal',
      url: process.env.DONATION_PAYPAL_URL,
    })
  }

  return providers
}

function donationsEnabled() {
  return getDonationProviders().length > 0
}

function buildDonationMessage() {
  const providers = getDonationProviders()

  if (providers.length === 0) {
    return 'Las donaciones todavia no estan configuradas.'
  }

  const intro = process.env.DONATION_MESSAGE
    || 'Si quieres apoyar este proyecto, puedes hacerlo con una donacion. Cada aportacion ayuda a mantener el bot vivo y mejorarlo.'

  const lines = [
    '*Apoya Este Proyecto*',
    '',
    intro,
    '',
    'Elige una plataforma para donar:',
  ]

  providers.forEach((provider) => {
    lines.push(`- ${provider.label}`)
  })

  return lines.join('\n')
}

module.exports = {
  getDonationProviders,
  donationsEnabled,
  buildDonationMessage,
}
