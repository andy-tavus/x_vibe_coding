import { createHash, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { get, put } from '@vercel/blob'
import { LESSON_CONVERSATION_NAME, LESSON_PAL_ID } from '../src/lesson-name.ts'

const STATE_PATH = 'lesson-control.json'
const LOCAL_PATH = '.data/lesson-control.json'
const TAVUS_API_BASE = 'https://tavusapi.com/v2'
const LOCK_MS = 15 * 60 * 1000
const MAX_FAILURES = 8
const PAGE_LIMIT = 50
const MAX_PAGES = 40

type State = {
	enabled: boolean
	failures: number
	lockedUntil: number
}

type ConversationRow = {
	conversation_id?: string
	conversation_name?: string
	pal_id?: string
	persona_id?: string
}

const DEFAULT_STATE: State = { enabled: true, failures: 0, lockedUntil: 0 }

function noStore(response: Response): Response {
	const headers = new Headers(response.headers)
	headers.set('Cache-Control', 'no-store')
	return new Response(response.body, { status: response.status, headers })
}

function sameSecret(input: string, expected: string): boolean {
	const left = createHash('sha256').update(input).digest()
	const right = createHash('sha256').update(expected).digest()
	return timingSafeEqual(left, right)
}

function cleanState(value: unknown): State {
	if (!value || typeof value !== 'object') return { ...DEFAULT_STATE }
	const row = value as Partial<State>
	return {
		enabled: row.enabled !== false,
		failures: typeof row.failures === 'number' && row.failures > 0 ? Math.floor(row.failures) : 0,
		lockedUntil: typeof row.lockedUntil === 'number' && row.lockedUntil > 0 ? row.lockedUntil : 0,
	}
}

async function readLocal(): Promise<State> {
	try {
		return cleanState(JSON.parse(await readFile(LOCAL_PATH, 'utf8')))
	} catch {
		return { ...DEFAULT_STATE }
	}
}

async function writeLocal(state: State): Promise<void> {
	await mkdir('.data', { recursive: true })
	await writeFile(LOCAL_PATH, JSON.stringify(state))
}

async function readState(): Promise<State> {
	if (!process.env.BLOB_READ_WRITE_TOKEN) return readLocal()
	const result = await get(STATE_PATH, { access: 'private', useCache: false })
	if (!result || result.statusCode !== 200) return { ...DEFAULT_STATE }
	try {
		return cleanState(JSON.parse(await new Response(result.stream).text()))
	} catch {
		return { ...DEFAULT_STATE }
	}
}

async function writeState(state: State): Promise<void> {
	if (!process.env.BLOB_READ_WRITE_TOKEN) {
		await writeLocal(state)
		return
	}
	await put(STATE_PATH, JSON.stringify(state), {
		access: 'private',
		addRandomSuffix: false,
		allowOverwrite: true,
		contentType: 'application/json',
		cacheControlMaxAge: 60,
	})
}

export async function lessonIsOpen(): Promise<boolean> {
	return (await readState()).enabled
}

export function stampLessonParams(params: Record<string, unknown>): Record<string, unknown> {
	const next: Record<string, unknown> = { ...params, pal_id: LESSON_PAL_ID, conversation_name: LESSON_CONVERSATION_NAME }
	delete next.persona_id
	return next
}

export async function endActiveLessonCalls(): Promise<{ ended: number; failed: number; truncated: boolean }> {
	const apiKey = process.env.TAVUS_API_KEY
	if (!apiKey) return { ended: 0, failed: 0, truncated: false }
	const key = apiKey

	const ids: string[] = []
	let truncated = false
	let total = Number.POSITIVE_INFINITY
	let scanned = 0

	for (let page = 1; page <= MAX_PAGES && scanned < total; page += 1) {
		const response = await fetch(
			`${TAVUS_API_BASE}/conversations?status=active&limit=${PAGE_LIMIT}&page=${page}`,
			{ headers: { 'x-api-key': key } },
		)
		if (!response.ok) return { ended: 0, failed: ids.length + 1, truncated: true }
		const body = (await response.json()) as { data?: ConversationRow[]; total_count?: number }
		const rows = Array.isArray(body.data) ? body.data : []
		if (typeof body.total_count === 'number') total = body.total_count
		scanned += rows.length
		for (const row of rows) {
			const pal = row.pal_id || row.persona_id
			if (pal === LESSON_PAL_ID && row.conversation_name === LESSON_CONVERSATION_NAME && row.conversation_id) {
				ids.push(row.conversation_id)
			}
		}
		if (rows.length < PAGE_LIMIT) break
		if (page === MAX_PAGES && scanned < total) truncated = true
	}

	let ended = 0
	let failed = 0
	let cursor = 0
	async function worker() {
		for (;;) {
			const index = cursor
			cursor += 1
			const id = ids[index]
			if (!id) return
			const response = await fetch(`${TAVUS_API_BASE}/conversations/${id}/end`, {
				method: 'POST',
				headers: { 'x-api-key': key },
			})
			if (response.ok || response.status === 404 || response.status === 409) ended += 1
			else failed += 1
		}
	}
	await Promise.all(Array.from({ length: Math.min(4, ids.length) }, () => worker()))
	return { ended, failed, truncated }
}

export async function handleLessonHttp(request: Request): Promise<Response> {
	if (request.method === 'GET') {
		return noStore(Response.json({ enabled: await lessonIsOpen() }))
	}
	if (request.method !== 'POST') {
		return noStore(new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, POST' } }))
	}

	const expected = process.env.ADMIN_PASSWORD
	if (!expected) {
		return noStore(Response.json({ error: 'The lesson switch is not configured.' }, { status: 500 }))
	}

	let body: { password?: unknown; enabled?: unknown }
	try {
		body = (await request.json()) as { password?: unknown; enabled?: unknown }
	} catch {
		return noStore(Response.json({ error: 'Invalid JSON body' }, { status: 400 }))
	}

	const password = typeof body.password === 'string' ? body.password : ''
	const state = await readState()
	if (state.lockedUntil > Date.now()) {
		return noStore(Response.json({ error: 'Too many tries. Wait a few minutes.' }, { status: 429 }))
	}
	if (!sameSecret(password, expected)) {
		const failures = state.failures + 1
		await writeState({
			...state,
			failures,
			lockedUntil: failures >= MAX_FAILURES ? Date.now() + LOCK_MS : 0,
		})
		return noStore(Response.json({ error: 'The password was not accepted.' }, { status: 401 }))
	}

	let enabled = state.enabled
	let ended = 0
	let failed = 0
	let truncated = false
	try {
		if (typeof body.enabled === 'boolean') {
			enabled = body.enabled
			await writeState({ enabled, failures: 0, lockedUntil: 0 })
			if (!enabled) {
				const result = await endActiveLessonCalls()
				ended = result.ended
				failed = result.failed
				truncated = result.truncated
			}
		} else {
			await writeState({ ...state, failures: 0, lockedUntil: 0 })
		}
	} catch {
		return noStore(Response.json({ error: 'The lesson switch did not save.' }, { status: 500 }))
	}

	return noStore(Response.json({ enabled, ended, failed, truncated }))
}
