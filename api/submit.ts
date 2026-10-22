import type { VercelRequest, VercelResponse } from '@vercel/node'

type Submission = {
	grade?: string
	firstName?: string
	lastInitial?: string
	appName?: string
	need?: string
	blueprint?: string
	codingPrompt?: string
	conversationId?: string
}

const LIMITS: Record<keyof Submission, number> = {
	grade: 20,
	firstName: 40,
	lastInitial: 1,
	appName: 80,
	need: 500,
	blueprint: 12000,
	codingPrompt: 12000,
	conversationId: 80,
}

function text(value: unknown, max: number): string {
	return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (req.method !== 'POST') {
		res.setHeader('Allow', 'POST')
		res.status(405).json({ status: 'error', error: 'Method not allowed' })
		return
	}

	const token = process.env.SUBMISSION_API_TOKEN
	const sheetUrl = process.env.SUBMISSION_URL
	const secret = process.env.SUBMISSION_SECRET
	if (!token || !sheetUrl || !secret) {
		res.status(500).json({ status: 'error', error: 'Submission is not configured.' })
		return
	}
	if (req.headers.authorization !== `Bearer ${token}`) {
		res.status(401).json({ status: 'error', error: 'Unauthorized' })
		return
	}

	const body = (req.body ?? {}) as Submission
	const row: Required<Submission> = {
		grade: text(body.grade, LIMITS.grade),
		firstName: text(body.firstName, LIMITS.firstName),
		lastInitial: text(body.lastInitial, LIMITS.lastInitial).toUpperCase(),
		appName: text(body.appName, LIMITS.appName),
		need: text(body.need, LIMITS.need),
		blueprint: text(body.blueprint, LIMITS.blueprint),
		codingPrompt: text(body.codingPrompt, LIMITS.codingPrompt),
		conversationId: text(body.conversationId, LIMITS.conversationId),
	}
	if (!row.grade || !row.firstName || !/^[A-Z]$/.test(row.lastInitial) || !row.blueprint || !row.codingPrompt) {
		res.status(400).json({ status: 'error', error: 'The submission is missing the student or the plan.' })
		return
	}

	const response = await fetch(sheetUrl, {
		method: 'POST',
		redirect: 'follow',
		headers: { 'Content-Type': 'text/plain;charset=utf-8' },
		body: JSON.stringify({ secret, ...row }),
	})
	const result = await response.text()
	if (!response.ok || !result.includes('ok')) {
		res.status(502).json({ status: 'error', error: 'The teacher sheet did not accept the plan.' })
		return
	}
	res.status(200).json({ status: 'ok' })
}
