import type { Screen } from '../types/game';

interface HomeScreenProps {
  active: boolean;
  showJoinForm: boolean;
  joinCode: string;
  joinName: string;
  onSetScreen: (screen: Screen) => void;
  onToggleJoinForm: () => void;
  onJoinCodeChange: (value: string) => void;
  onJoinNameChange: (value: string) => void;
  onJoinSubmit: () => void;
}

export function HomeScreen({
  active,
  showJoinForm,
  joinCode,
  joinName,
  onSetScreen,
  onToggleJoinForm,
  onJoinCodeChange,
  onJoinNameChange,
  onJoinSubmit
}: HomeScreenProps) {
  return (
    <div id="home" className={`screen ${active ? 'active' : ''}`}>
      <div className="logo">ALIAS</div>
      <p className="subtitle">Угадай слово!</p>
      <button type="button" id="btn-create" className="btn btn-primary" onClick={() => onSetScreen('create')}>
        Создать игру
      </button>
      <button type="button" id="btn-join" className="btn btn-secondary" onClick={onToggleJoinForm}>
        Войти по коду
      </button>

      <div id="join-form" className={showJoinForm ? '' : 'hidden'}>
        <input
          id="input-code"
          type="text"
          maxLength={4}
          value={joinCode}
          onChange={(event) => onJoinCodeChange(event.target.value)}
          placeholder="Код комнаты"
          inputMode="numeric"
        />
        <input
          id="input-name-join"
          type="text"
          maxLength={20}
          value={joinName}
          onChange={(event) => onJoinNameChange(event.target.value)}
          placeholder="Ваше имя"
        />
        <button type="button" id="btn-join-submit" className="btn btn-primary" onClick={onJoinSubmit}>
          Войти
        </button>
      </div>
    </div>
  );
}
