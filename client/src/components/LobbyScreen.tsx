import type { Player } from '../types/game';

interface PlayerTagProps {
  player: Player;
  myId: string;
  hostId: string | null;
  isHost: boolean;
  onSwitchTeam: (player: Player) => void;
}

function PlayerTag({ player, myId, hostId, isHost, onSwitchTeam }: PlayerTagProps) {
  return (
    <div
      className={`player-tag ${player.disconnected ? 'disconnected' : ''}`}
      onClick={() => onSwitchTeam(player)}
      style={{ cursor: isHost ? 'pointer' : 'default' }}
      role={isHost ? 'button' : undefined}
      tabIndex={isHost ? 0 : -1}
      onKeyDown={(event) => {
        if (!isHost) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSwitchTeam(player);
        }
      }}
    >
      <span>
        {player.name}
        {player.id === myId ? ' (Вы)' : ''}
        {player.disconnected ? ' (оффлайн)' : ''}
      </span>
      {player.id === hostId ? <span className="host-badge">Хост</span> : null}
    </div>
  );
}

interface LobbyScreenProps {
  active: boolean;
  roomCode: string;
  lobbyStatus: string;
  players: Player[];
  myId: string;
  hostId: string | null;
  isHost: boolean;
  team1Count: number;
  team2Count: number;
  readyToStart: boolean;
  onCopyCode: () => Promise<void>;
  onSwitchTeam: (player: Player) => void;
  onStartGame: () => void;
}

export function LobbyScreen({
  active,
  roomCode,
  lobbyStatus,
  players,
  myId,
  hostId,
  isHost,
  team1Count,
  team2Count,
  readyToStart,
  onCopyCode,
  onSwitchTeam,
  onStartGame
}: LobbyScreenProps) {
  const team1Players = players.filter((player) => player.team === 1);
  const team2Players = players.filter((player) => player.team === 2);
  const unassignedPlayers = players.filter((player) => !player.team);

  return (
    <div id="lobby" className={`screen ${active ? 'active' : ''}`}>
      <div className="room-code">
        Код: <span id="room-code-display">{roomCode}</span>
        <button type="button" id="btn-copy-code" className="btn-icon" title="Скопировать" onClick={onCopyCode}>
          📋
        </button>
      </div>
      <p id="lobby-status" className="lobby-status">{lobbyStatus}</p>

      <div className="teams-container">
        <div className="team team-1">
          <h3>Команда 1</h3>
          <div id="team-1-players" className="player-list">
            {team1Players.map((player) => (
              <PlayerTag
                key={player.id}
                player={player}
                myId={myId}
                hostId={hostId}
                isHost={isHost}
                onSwitchTeam={onSwitchTeam}
              />
            ))}
          </div>
        </div>

        <div className="team team-2">
          <h3>Команда 2</h3>
          <div id="team-2-players" className="player-list">
            {team2Players.map((player) => (
              <PlayerTag
                key={player.id}
                player={player}
                myId={myId}
                hostId={hostId}
                isHost={isHost}
                onSwitchTeam={onSwitchTeam}
              />
            ))}
          </div>
        </div>
      </div>

      <div id="unassigned-players" className="unassigned">
        <h4>Без команды</h4>
        <div id="unassigned-list" className="player-list">
          {unassignedPlayers.map((player) => (
            <PlayerTag
              key={player.id}
              player={player}
              myId={myId}
              hostId={hostId}
              isHost={isHost}
              onSwitchTeam={onSwitchTeam}
            />
          ))}
        </div>
      </div>

      <button
        type="button"
        id="btn-start"
        className={`btn btn-primary ${isHost ? '' : 'hidden'}`}
        disabled={!readyToStart}
        onClick={onStartGame}
      >
        {readyToStart ? 'Начать игру' : `Начать игру (${team1Count}/2 vs ${team2Count}/2)`}
      </button>
    </div>
  );
}
