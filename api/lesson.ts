import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleLessonHttp } from './lesson-control.ts'

export const maxDuration = 60

export default async function handler(req: VercelRequest, res: VercelResponse) {
	const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
	const request = new Request('https://x-vibe-coding.vercel.app/api/lesson', {
		method: req.method,
		headers: { 'content-type': 'application/json' },
		body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
	})
	const response = await handleLessonHttp(request)
	res.status(response.status)
	response.headers.forEach((value, key) => {
		res.setHeader(key, value)
	})
	res.send(await response.text())
}
