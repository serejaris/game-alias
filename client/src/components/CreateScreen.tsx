interface CreateScreenProps {
  active: boolean;
  categories: string[];
  selectedCategories: string[];
  targetScoreOptions: readonly number[];
  roundTimeOptions: readonly number[];
  targetScore: number;
  roundTime: number;
  createName: string;
  onToggleCategory: (category: string) => void;
  onSelectTargetScore: (value: number) => void;
  onSelectRoundTime: (value: number) => void;
  onCreateNameChange: (value: string) => void;
  onCreateRoom: () => void;
}

export function CreateScreen({
  active,
  categories,
  selectedCategories,
  targetScoreOptions,
  roundTimeOptions,
  targetScore,
  roundTime,
  createName,
  onToggleCategory,
  onSelectTargetScore,
  onSelectRoundTime,
  onCreateNameChange,
  onCreateRoom
}: CreateScreenProps) {
  return (
    <div id="create" className={`screen ${active ? 'active' : ''}`}>
      <h2>Новая игра</h2>

      <div className="form-group">
        <label>Категории</label>
        <div id="categories-list" className="categories">
          {categories.map((category) => {
            const selected = selectedCategories.includes(category);
            return (
              <button
                key={category}
                type="button"
                className={`category-chip ${selected ? 'selected' : ''}`}
                onClick={() => onToggleCategory(category)}
              >
                {category}
              </button>
            );
          })}
        </div>
      </div>

      <div className="form-group">
        <label>Очков для победы</label>
        <div className="radio-group" id="target-score-group">
          {targetScoreOptions.map((option) => (
            <button
              key={option}
              type="button"
              className={`radio-btn ${targetScore === option ? 'selected' : ''}`}
              onClick={() => onSelectTargetScore(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label>Время раунда</label>
        <div className="radio-group" id="round-time-group">
          {roundTimeOptions.map((option) => (
            <button
              key={option}
              type="button"
              className={`radio-btn ${roundTime === option ? 'selected' : ''}`}
              onClick={() => onSelectRoundTime(option)}
            >
              {option}с
            </button>
          ))}
        </div>
      </div>

      <input
        id="input-name-create"
        type="text"
        maxLength={20}
        value={createName}
        onChange={(event) => onCreateNameChange(event.target.value)}
        placeholder="Ваше имя"
      />
      <button type="button" id="btn-create-room" className="btn btn-primary" onClick={onCreateRoom}>
        Создать
      </button>
    </div>
  );
}
