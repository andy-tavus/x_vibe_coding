import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import type { CanvasInteractionEvent } from './components/cvi/components/magic-canvas/runtime'
import {
  getShownCanvasComponent,
  isCanvasToolCallMessage,
  parseCanvasControlCommand,
} from './components/cvi/components/magic-canvas/runtime'
import { useObservableEvent, useSendAppMessage } from './components/cvi/hooks/cvi-events-hooks'

type LessonControlsValue = {
  ready: boolean
  slidesDone: boolean
  pictureUp: boolean
  advancePicture: () => void
  onInteraction: (event: CanvasInteractionEvent) => void
}

const LessonControlsContext = createContext<LessonControlsValue | null>(null)

export function useLessonControls() {
  const value = useContext(LessonControlsContext)
  if (!value) throw new Error('Lesson controls are only available during a call.')
  return value
}

// The PAL only speaks again after a student turn. Picture advances wait until he
// stops, because a message sent while he is talking is dropped. Choices and
// Explain do not use this queue. They send immediately, the same way typing does.
export function LessonControlsProvider({ children }: { children: ReactNode }) {
  const sendAppMessage = useSendAppMessage()
  const started = useRef(false)
  const speaking = useRef(false)
  const conversationId = useRef<string | null>(null)
  const pendingPrompt = useRef<string | null>(null)
  const advanced = useRef(false)
  const seenPictures = useRef(new Set<string>())
  const [ready, setReady] = useState(false)
  const [pictureUp, setPictureUp] = useState(false)
  const [slidesDone, setSlidesDone] = useState(false)

  const respond = useCallback(
    (id: string, text: string) =>
      sendAppMessage({
        message_type: 'conversation',
        event_type: 'conversation.respond',
        conversation_id: id,
        properties: { text },
      }),
    [sendAppMessage],
  )

  const flush = useCallback(() => {
    const id = conversationId.current
    const text = pendingPrompt.current
    if (!id || !text) return
    pendingPrompt.current = null
    respond(id, text)
  }, [respond])

  useObservableEvent<unknown>(
    useCallback(
      (event) => {
        if (event.event_type === 'conversation.tool_call' && isCanvasToolCallMessage(event)) {
          const shown = getShownCanvasComponent(event)
          if (shown === 'canvas.image') {
            const id = event.properties.tool_call_id
            if (id) seenPictures.current.add(id)
            advanced.current = false
            setPictureUp(true)
            return
          }
          if (shown) {
            setPictureUp(false)
            setSlidesDone(true)
            return
          }
          try {
            const control = parseCanvasControlCommand(event)
            if (control?.kind === 'clear') setPictureUp(false)
          } catch {
            // A malformed canvas command is not a picture advance.
          }
          return
        }

        if (event.event_type === 'conversation.started_speaking') {
          conversationId.current = event.conversation_id
          setReady(true)
          if (event.properties.role !== 'user') speaking.current = true
          return
        }
        if (event.event_type !== 'conversation.stopped_speaking') return
        conversationId.current = event.conversation_id
        setReady(true)
        if (event.properties.role === 'user') return
        speaking.current = false
        if (!started.current) {
          started.current = true
          respond(event.conversation_id, 'Start.')
        } else {
          flush()
        }
      },
      [flush, respond],
    ),
  )

  const request = useCallback(
    (text: string) => {
      const id = conversationId.current
      if (!id) return
      if (speaking.current) pendingPrompt.current = text
      else respond(id, text)
    },
    [respond],
  )

  const finishPicture = useCallback(() => {
    if (advanced.current) return
    advanced.current = true
    setPictureUp(false)
    if (seenPictures.current.size >= 5) setSlidesDone(true)
    request('Next.')
  }, [request])

  const onInteraction = useCallback(
    (event: CanvasInteractionEvent) => {
      if (event.component !== 'canvas.image' || event.type !== 'dismiss') return
      conversationId.current = event.conversation_id
      finishPicture()
    },
    [finishPicture],
  )

  return (
    <LessonControlsContext.Provider
      value={{ ready, slidesDone, pictureUp, advancePicture: finishPicture, onInteraction }}
    >
      {children}
    </LessonControlsContext.Provider>
  )
}
