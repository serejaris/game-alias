import { useEffect } from 'react';
import { useSwipeCard } from '../hooks/useSwipeCard';
import type { Role, SwipeDirection, Team } from '../types/game';

interface GameScreenProps {
  active: boolean;
  role: Role | null;
  scores: { 1: number; 2: number };
  timerLeft: number;
  timerProgressOffset: number;
  timerProgressClass: string;
  timerContainerClass: string;
  currentWord: string;
  playingTeam: Team;
  wordResult: 'guessed' | 'skipped' | null;
  overlayVisible: boolean;
  pauseSeconds: number;
  stealOverlayVisible: boolean;
  stealSeconds: number;
  stealCanSubmit: boolean;
  onGuesserAction: (direction: SwipeDirection) => boolean;
  onStealWord: () => void;
}

export function GameScreen({
  active,
  role,
  scores,
  timerLeft,
  timerProgressOffset,
  timerProgressClass,
  timerContainerClass,
  currentWord,
  playingTeam,
  wordResult,
  overlayVisible,
  pauseSeconds,
  stealOverlayVisible,
  stealSeconds,
  stealCanSubmit,
  onGuesserAction,
  onStealWord
}: GameScreenProps) {
  const swipe = useSwipeCard({
    enabled: role === 'guesser',
    onSwipe: onGuesserAction
  });

  useEffect(() => {
    if (!active || role !== 'guesser') return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;

      if (event.key === 'ArrowRight' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        swipe.triggerSwipe('right');
      }

      if (event.key === 'ArrowLeft' || event.key === 'Backspace') {
        event.preventDefault();
        swipe.triggerSwipe('left');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, role, swipe]);

  return (
    <div id="game" className={`screen ${active ? 'active' : ''}`}>
      <div className="game-header">
        <div className="scores">
          <span className="score team-1-score">{scores[1]}</span>
          <span className="score-divider">:</span>
          <span className="score team-2-score">{scores[2]}</span>
        </div>

        <div className={timerContainerClass}>
          <svg className="timer-ring" viewBox="0 0 100 100">
            <circle className="timer-bg" cx="50" cy="50" r="45" />
            <circle
              className={timerProgressClass}
              cx="50"
              cy="50"
              r="45"
              style={{ strokeDashoffset: timerProgressOffset }}
            />
          </svg>
          <span id="timer-text" className="timer-text">{Math.max(0, timerLeft)}</span>
        </div>
      </div>

      <div id="explainer-view" className={`game-role ${role === 'explainer' ? '' : 'hidden'}`}>
        <div className="role-label">Вы объясняете</div>
        <div id="current-word" className="word-display">{currentWord}</div>
      </div>

      <div id="guesser-view" className={`game-role ${role === 'guesser' ? '' : 'hidden'}`}>
        <div className="role-label">Вы угадываете</div>

        <div id="swipe-area" className="swipe-area">
          <div id="swipe-hint-left" className="swipe-hint swipe-hint-left" style={{ opacity: swipe.hintLeftOpacity }}>
            Пропуск
          </div>
          <div id="swipe-hint-right" className="swipe-hint swipe-hint-right" style={{ opacity: swipe.hintRightOpacity }}>
            Угадал!
          </div>

          <div
            id="swipe-card"
            className={swipe.cardClassName}
            style={swipe.cardStyle}
            onPointerDown={swipe.bindings.onPointerDown}
            onPointerMove={swipe.bindings.onPointerMove}
            onPointerUp={swipe.bindings.onPointerUp}
            onPointerCancel={swipe.bindings.onPointerCancel}
          >
            <div className="swipe-card-icon">👂</div>
            <div className="swipe-card-text">Слушайте объяснение</div>
            <div className="swipe-card-hint">
              <span className="hint-left">← Пропуск</span>
              <span className="hint-right">Угадал! →</span>
            </div>
          </div>
        </div>

        <div className="guesser-buttons">
          <button type="button" id="btn-guess" className="btn-game btn-guess" onClick={() => swipe.triggerSwipe('right')}>
            ✓
          </button>
          <button type="button" id="btn-skip" className="btn-game btn-skip" onClick={() => swipe.triggerSwipe('left')}>
            ✗
          </button>
        </div>
      </div>

      <div id="observer-view" className={`game-role ${role === 'observer' ? '' : 'hidden'}`}>
        <div className="role-label">Ход команды <span id="playing-team">{playingTeam}</span></div>
        <div className="waiting-message">Ждём ход...</div>
      </div>

      <div id="word-result" className={`word-result ${wordResult ? wordResult : 'hidden'}`}>
        {wordResult === 'guessed' ? '+1' : wordResult === 'skipped' ? '-1' : ''}
      </div>

      <div id="turn-overlay" className={`overlay ${overlayVisible ? '' : 'hidden'}`}>
        <div className="overlay-content">
          <h2>Конец раунда</h2>
          <div className="overlay-scores">
            <span className="team-1-score">{scores[1]}</span> : <span className="team-2-score">{scores[2]}</span>
          </div>
          <div id="pause-countdown" className="pause-countdown">
            Следующий раунд через <span id="pause-seconds">{pauseSeconds}</span>
          </div>
        </div>
      </div>

      <div id="steal-overlay" className={`overlay ${stealOverlayVisible ? '' : 'hidden'}`}>
        <div className="overlay-content steal-overlay-content">
          <h2>Перехват слова</h2>
          <p className="steal-text">Ход команды <span id="steal-playing-team">{playingTeam}</span> завершён.</p>
          <p className="steal-countdown">Окно перехвата: <span id="steal-seconds">{stealSeconds}</span></p>
          <button
            type="button"
            id="btn-steal-word"
            className={`btn btn-primary ${stealCanSubmit ? '' : 'hidden'}`}
            onClick={onStealWord}
            disabled={!stealCanSubmit}
          >
            Перехват +1
          </button>
        </div>
      </div>
    </div>
  );
}
