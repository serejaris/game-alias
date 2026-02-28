import type { Team } from '../types/game';

interface ResultsScreenProps {
  active: boolean;
  winner: Team | null;
  scores: { 1: number; 2: number };
  onPlayAgain: () => void;
}

export function ResultsScreen({ active, winner, scores, onPlayAgain }: ResultsScreenProps) {
  return (
    <div id="results" className={`screen ${active ? 'active' : ''}`}>
      <div className="winner-banner">
        <h1 id="winner-text">{winner ? `Команда ${winner} победила!` : 'Игра завершена'}</h1>
      </div>
      <div className="final-scores">
        <div className="final-team team-1">
          <h3>Команда 1</h3>
          <span id="final-score-1" className="final-score">{scores[1]}</span>
        </div>
        <div className="final-team team-2">
          <h3>Команда 2</h3>
          <span id="final-score-2" className="final-score">{scores[2]}</span>
        </div>
      </div>
      <button type="button" id="btn-play-again" className="btn btn-primary" onClick={onPlayAgain}>
        Играть снова
      </button>
    </div>
  );
}
