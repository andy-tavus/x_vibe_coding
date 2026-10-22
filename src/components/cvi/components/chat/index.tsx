import React, {
	createContext,
	memo,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { useChat, type ChatMessage } from '../../hooks/use-chat';
import styles from './chat.module.css';
import whatWeSaid from '../../../../assets/what-we-said.jpg';
import sendLabel from '../../../../assets/send.png';
import { useLessonControls } from '../../../../lesson-controls';

type ChatContextValue = {
	isOpen: boolean;
	toggle: () => void;
	close: () => void;
	messages: ChatMessage[];
	sendMessage: (text: string) => void;
	conversationId: string | null;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export const ChatProvider = ({
	children,
	defaultOpen = false,
}: {
	children: React.ReactNode;
	defaultOpen?: boolean;
}) => {
	const [isOpen, setIsOpen] = useState(defaultOpen);
	const { messages, sendMessage, conversationId } = useChat();
	const toggle = useCallback(() => setIsOpen((v) => !v), []);
	const close = useCallback(() => setIsOpen(false), []);
	const value = useMemo(
		() => ({ isOpen, toggle, close, messages, sendMessage, conversationId }),
		[isOpen, toggle, close, messages, sendMessage, conversationId]
	);
	return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

const useChatContext = (): ChatContextValue => {
	const ctx = useContext(ChatContext);
	if (!ctx) {
		throw new Error('Chat components must be used within <ChatProvider>');
	}
	return ctx;
};

export const ChatButton = memo(() => {
	const { isOpen, toggle } = useChatContext();
	return (
		<button
			type="button"
			onClick={toggle}
			aria-pressed={isOpen}
			aria-label={isOpen ? 'Close chat' : 'Open chat'}
			className={`${styles.chatButton} ${isOpen ? styles.chatButtonActive : ''}`}
		>
			<span className={styles.chatButtonIcon}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
					focusable="false"
				>
					<path
						d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</span>
		</button>
	);
});

ChatButton.displayName = 'ChatButton';

const MessageBubble = memo(({ message }: { message: ChatMessage }) => {
	const isUser = message.role === 'user';
	return (
		<li
			className={`${styles.messageRow} ${isUser ? styles.messageRowUser : styles.messageRowReplica}`}
			aria-busy={message.pending || undefined}
		>
			<span
				className={`${styles.messageRole} ${
					isUser ? styles.messageRoleUser : styles.messageRoleReplica
				}`}
			>
				{isUser ? 'You' : 'Mr. Wertner'}
			</span>
			<span
				className={`${styles.messageBubble} ${
					isUser ? styles.messageBubbleUser : styles.messageBubbleReplica
				}`}
			>
				{message.text}
			</span>
		</li>
	);
});

MessageBubble.displayName = 'MessageBubble';

const PAGE_SIGNALS = new Set(['Start.', 'Next.']);

export const ChatPanel = memo(() => {
	const { isOpen, messages: allMessages, sendMessage, conversationId } = useChatContext();
	const { slidesDone, introStarted, nextBusy, advancePicture } = useLessonControls();
	const messages = useMemo(
		() => allMessages.filter((m) => !(m.role === 'user' && PAGE_SIGNALS.has(m.text.trim()))),
		[allMessages]
	);
	const [draft, setDraft] = useState('');
	const listRef = useRef<HTMLUListElement | null>(null);
	const tail = messages.length > 0 ? messages[messages.length - 1].text : '';

	useEffect(() => {
		const el = listRef.current;
		if (!el) return;
		const pin = () => {
			el.scrollTop = el.scrollHeight;
		};
		pin();
		const observer = new ResizeObserver(pin);
		observer.observe(el);
		return () => observer.disconnect();
	}, [messages.length, tail]);

	const submit = useCallback(() => {
		const trimmed = draft.trim();
		if (!trimmed || !conversationId) {
			return;
		}
		sendMessage(trimmed);
		setDraft('');
	}, [draft, sendMessage, conversationId]);

	const onKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
				e.preventDefault();
				submit();
			}
		},
		[submit]
	);

	const canSend = !!draft.trim() && !!conversationId;

	return (
		<aside
			className={`${styles.panel} ${isOpen ? styles.panelOpen : ''}`}
			aria-hidden={!isOpen}
			inert={!isOpen}
		>
			<header className={styles.header}>
				<img src={whatWeSaid} alt="What we said" />
			</header>

			<ul ref={listRef} className={styles.messageList} role="log" aria-live="polite">
				{messages.length === 0 ? (
					<li className={styles.empty}>
						{conversationId
							? 'Mr. Wertner will talk here. You can type in the box below.'
							: 'Connecting.'}
					</li>
				) : (
					messages.map((m) => <MessageBubble key={m.id} message={m} />)
				)}
			</ul>

			<div className={styles.suggestions} aria-label="Shortcuts">
				{introStarted && !slidesDone ? (
					<button type="button" onClick={advancePicture} disabled={nextBusy}>
						Next
					</button>
				) : null}
				<button
					type="button"
					disabled={!slidesDone || !conversationId}
					onClick={() => sendMessage('Give me choices.')}
				>
					Choices
				</button>
				<button
					type="button"
					disabled={!slidesDone || !conversationId}
					onClick={() => sendMessage('Explain more.')}
				>
					Explain
				</button>
			</div>

			<form
				className={styles.composer}
				onSubmit={(e) => {
					e.preventDefault();
					submit();
				}}
			>
				<textarea
					className={styles.composerInput}
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={onKeyDown}
					placeholder={conversationId ? 'Type your answer here.' : 'Connecting.'}
					disabled={!conversationId}
					rows={3}
					aria-label="Your answer"
				/>
				<button type="submit" className={styles.sendButton} aria-label="Send" disabled={!canSend}>
					<img src={sendLabel} alt="" />
				</button>
			</form>
		</aside>
	);
});

ChatPanel.displayName = 'ChatPanel';
