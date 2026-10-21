import type { VercelRequest, VercelResponse } from '@vercel/node'

const TAVUS_API_BASE = 'https://tavusapi.com/v2'

type Body = {
	action?: string
	params?: Record<string, unknown>
	conversationId?: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (req.method !== 'POST') {
		res.setHeader('Allow', 'POST')
		res.status(405).send('Method not allowed')
		return
	}

	const apiKey = process.env.TAVUS_API_KEY
	if (!apiKey) {
		res.status(500).json({ error: 'TAVUS_API_KEY is not set in the server environment.' })
		return
	}

	const body = (req.body ?? {}) as Body

	if (body.action === 'create') {
		const response = await fetch(`${TAVUS_API_BASE}/conversations`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
			body: JSON.stringify(body.params ?? {}),
		})
		const text = await response.text()
		if (!response.ok) {
			res.status(response.status).json({ error: `Tavus create failed: ${text}` })
			return
		}
		res.status(200).json(JSON.parse(text))
		return
	}

	if (body.action === 'end' && body.conversationId) {
		const response = await fetch(`${TAVUS_API_BASE}/conversations/${body.conversationId}/end`, {
			method: 'POST',
			headers: { 'x-api-key': apiKey },
		})
		if (!response.ok) {
			res.status(response.status).json({ error: `Tavus end failed: ${await response.text()}` })
			return
		}
		res.status(204).end()
		return
	}

	res.status(400).json({ error: 'Unknown action' })
}
