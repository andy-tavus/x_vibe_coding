import React, { useCallback, useEffect, useState } from 'react';
import {
	DailyAudioTrack,
	DailyVideo,
	useDaily,
	useLocalSessionId,
	useMeetingState,
	useScreenVideoTrack,
	useVideoTrack,
} from '@daily-co/daily-react';
import { ClosedCaptions, ClosedCaptionsProvider } from '../closed-captions';
import { ChatButton, ChatPanel, ChatProvider } from '../chat';
import { ConnectingState, LeavingState } from '../conversation-status';
import { useLocalScreenshare } from '../../hooks/use-local-screenshare';
import { useReplicaIDs } from '../../hooks/use-replica-ids';
import { useCVICall } from '../../hooks/use-cvi-call';
import { AudioWave } from '../audio-wave';

import styles from './conversation.module.css';

interface ConversationProps {
	onLeave: () => void;
	conversationUrl: string;
}

const VideoPreview = React.memo(({ id }: { id: string }) => {
	const videoState = useVideoTrack(id);

	return (
		<div
			className={`${styles.previewVideoContainer} ${videoState.isOff ? styles.previewVideoContainerHidden : ''}`}
		>
			<DailyVideo
				automirror
				sessionId={id}
				type="video"
				fit="cover"
				className={`${styles.previewVideo} ${videoState.isOff ? styles.previewVideoHidden : ''}`}
			/>
			<div className={styles.audioWaveContainer}>
				<AudioWave id={id} />
			</div>
		</div>
	);
});

const PreviewVideos = React.memo(() => {
	const localId = useLocalSessionId();
	const { isScreenSharing } = useLocalScreenshare();
	const replicaIds = useReplicaIDs();
	const replicaId = replicaIds[0];

	return (
		<>
			{isScreenSharing && <VideoPreview id={replicaId} />}
			<VideoPreview id={localId} />
		</>
	);
});

const SelfView = React.memo(() => (
	<div className={styles.selfViewContainer}>
		<PreviewVideos />
	</div>
));

const MainVideo = React.memo(() => {
	const replicaIds = useReplicaIDs();
	const localId = useLocalSessionId();
	const videoState = useVideoTrack(replicaIds[0]);
	const screenVideoState = useScreenVideoTrack(localId);
	const meetingState = useMeetingState();
	const isScreenSharing = !screenVideoState.isOff;
	const replicaId = replicaIds[0];
	const [hasReplicaConnected, setHasReplicaConnected] = useState(false);

	useEffect(() => {
		if (replicaId && videoState.state === 'playable') {
			setHasReplicaConnected(true);
		}
	}, [replicaId, videoState.state]);

	if (meetingState === 'left-meeting' || meetingState === 'error') {
		return <LeavingState />;
	}

	if (!hasReplicaConnected) {
		return <ConnectingState />;
	}

	if (!replicaId) {
		return <ConnectingState />;
	}

	return (
		<div
			className={`${styles.mainVideoContainer} ${isScreenSharing ? styles.mainVideoContainerScreenSharing : ''}`}
		>
			<DailyVideo
				automirror
				sessionId={isScreenSharing ? localId : replicaId}
				type={isScreenSharing ? 'screenVideo' : 'video'}
				className={`${styles.mainVideo}
				${isScreenSharing ? styles.mainVideoScreenSharing : ''}
				${videoState.isOff ? styles.mainVideoHidden : ''}`}
			/>
			<DailyAudioTrack sessionId={replicaId} />
		</div>
	);
});

export const Conversation = React.memo(({ onLeave, conversationUrl }: ConversationProps) => {
	const daily = useDaily();
	const { leaveCall } = useCVICall();
	const meetingState = useMeetingState();

	useEffect(() => {
		if (meetingState === 'error') {
			onLeave();
		}
	}, [meetingState, onLeave]);

	useEffect(() => {
		if (!daily) return;
		const silence = () => {
			const local = daily.participants()?.local;
			if (!local) return;
			if (local.audio) void daily.setLocalAudio(false);
			if (local.video) void daily.setLocalVideo(false);
			if (local.screen) void daily.stopScreenShare();
		};
		const onUpdated = (event?: { participant?: { local?: boolean } }) => {
			if (event?.participant?.local) silence();
		};
		daily.on('joined-meeting', silence);
		daily.on('participant-updated', onUpdated);
		// Wait one tick so React StrictMode can cancel the first mount
		// before the room is joined. Joining on the first tick and leaving
		// in cleanup leaves the call stuck at "new".
		const start = window.setTimeout(() => {
			daily
				.join({
					url: conversationUrl,
					audioSource: false,
					videoSource: false,
					startAudioOff: true,
					startVideoOff: true,
				})
				.then(silence)
				.catch(() => {
					onLeave();
				});
		}, 0);
		return () => {
			window.clearTimeout(start);
			daily.off('joined-meeting', silence);
			daily.off('participant-updated', onUpdated);
			if (daily.meetingState() !== 'new') {
				daily.leave();
			}
		};
	}, [daily, conversationUrl, onLeave]);

	const handleLeave = useCallback(() => {
		leaveCall();
		onLeave();
	}, [leaveCall, onLeave]);

	return (
		<ClosedCaptionsProvider>
			<ChatProvider defaultOpen>
				<div className={styles.containerWrapper}>
					<div className={styles.container}>
						<div className={styles.videoContainer}>
							<div className={styles.mainVideoContainer}>
								<MainVideo />
							</div>

							<SelfView />

							<ClosedCaptions />
						</div>

						<div className={styles.cardSpace}>Choices show up here.</div>

						<ChatPanel />

						<div
							className={`${styles.footer} ${meetingState === 'left-meeting' ? styles.footerLeaving : ''}`}
							aria-hidden={meetingState === 'left-meeting'}
						>
							<div className={styles.footerControls}>
								<ChatButton />
								<button type="button" className={styles.leaveButton} onClick={handleLeave}>
									<span className={styles.leaveButtonIcon}>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="24"
											height="24"
											viewBox="0 0 24 24"
											fill="none"
											role="img"
											aria-label="Leave Call"
										>
											<path
												d="M18 6L6 18M6 6L18 18"
												stroke="currentColor"
												strokeWidth="2"
												strokeLinecap="round"
												strokeLinejoin="round"
											/>
										</svg>
									</span>
								</button>
							</div>
						</div>
					</div>
				</div>
			</ChatProvider>
		</ClosedCaptionsProvider>
	);
});
