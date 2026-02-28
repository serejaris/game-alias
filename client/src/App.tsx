import { ROUND_TIME_OPTIONS, TARGET_SCORE_OPTIONS } from './config/constants';
import { CreateScreen } from './components/CreateScreen';
import { GameScreen } from './components/GameScreen';
import { HomeScreen } from './components/HomeScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { ResultsScreen } from './components/ResultsScreen';
import { Toast } from './components/Toast';
import { useAliasGame } from './hooks/useAliasGame';

export function App() {
  const { state, actions } = useAliasGame();

  return (
    <>
      <HomeScreen
        active={state.screen === 'home'}
        showJoinForm={state.showJoinForm}
        joinCode={state.joinCode}
        joinName={state.joinName}
        onSetScreen={actions.setScreen}
        onToggleJoinForm={actions.toggleJoinForm}
        onJoinCodeChange={actions.setJoinCode}
        onJoinNameChange={actions.setJoinName}
        onJoinSubmit={actions.joinRoom}
      />

      <CreateScreen
        active={state.screen === 'create'}
        categories={state.categories}
        selectedCategories={state.selectedCategories}
        targetScoreOptions={TARGET_SCORE_OPTIONS}
        roundTimeOptions={ROUND_TIME_OPTIONS}
        targetScore={state.targetScore}
        roundTime={state.roundTime}
        createName={state.createName}
        onToggleCategory={actions.toggleCategory}
        onSelectTargetScore={actions.selectTargetScore}
        onSelectRoundTime={actions.selectRoundTime}
        onCreateNameChange={actions.setCreateName}
        onCreateRoom={actions.createRoom}
      />

      <LobbyScreen
        active={state.screen === 'lobby'}
        roomCode={state.roomCode}
        lobbyStatus={state.lobbyStatus}
        players={state.players}
        myId={state.myId}
        hostId={state.hostId}
        isHost={state.isHost}
        team1Count={state.team1Count}
        team2Count={state.team2Count}
        readyToStart={state.readyToStart}
        onCopyCode={actions.copyCode}
        onSwitchTeam={actions.switchTeam}
        onStartGame={actions.startGame}
      />

      <GameScreen
        active={state.screen === 'game'}
        role={state.role}
        scores={state.scores}
        timerLeft={state.timerLeft}
        timerProgressOffset={state.timerProgressOffset}
        timerProgressClass={state.timerProgressClass}
        timerContainerClass={state.timerContainerClass}
        currentWord={state.currentWord}
        playingTeam={state.playingTeam}
        wordResult={state.wordResult}
        overlayVisible={state.overlayVisible}
        pauseSeconds={state.pauseSeconds}
        stealOverlayVisible={state.stealOverlayVisible}
        stealSeconds={state.stealSeconds}
        stealCanSubmit={state.stealCanSubmit}
        onGuesserAction={actions.submitGuesserAction}
        onStealWord={actions.submitStealWord}
      />

      <ResultsScreen
        active={state.screen === 'results'}
        winner={state.winner}
        scores={state.scores}
        onPlayAgain={actions.playAgain}
      />

      <Toast message={state.toast} />
    </>
  );
}
