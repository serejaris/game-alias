# Alias Game UX Mechanics Research (2026-02-28)

## Goal

Собрать прикладной UX-рекомендации для текущей версии игры Alias и превратить их в конкретный backlog для внедрения.

Фокус:
- корректность ролей (кнопки у нужного игрока);
- читаемый переход между раундами (без "мгновенного" старта);
- качество взаимодействия для угадывающего (swipe + fallback);
- доступность и устойчивость под реконнекты.

---

## What External Research Says

### 1) System status must be immediate and explicit

- NN/g: интерфейс должен быстро показывать, что происходит, иначе пользователи начинают повторно нажимать и теряют доверие.
- Для действий дольше ~1с нужно показывать прогресс/ожидание.

Implication for Alias:
- на каждое действие `guess/skip/start` нужен мгновенный визуальный отклик;
- фаза `turn-end` должна быть явно отделена от `game-started` с видимым countdown.

### 2) Waiting UX: 2-10s = spinner/countdown; 10s+ = percent-done

- NN/g + Nielsen response-time limits:
  - ~0.1s: "мгновенно";
  - ~1s: уже заметно;
  - >1s: нужен feedback;
  - 2-10s: индикатор ожидания уместен;
  - >10s: нужен более информативный progress.

Implication for Alias:
- ваш пауза-экран на 5 секунд это корректный паттерн;
- countdown должен тикать стабильно и быть синхронизирован сервером (источник истины).

### 3) Swipe не может быть единственным способом действия

- WCAG 2.2 SC 2.5.7: любое действие через drag/swipe должно иметь альтернативу single-pointer без drag.

Implication for Alias:
- swipe-карточка ок как "ускоритель";
- fallback-кнопки `guess/skip` обязательны и должны всегда оставаться рабочими.

### 4) Touch-target size matters for mobile speed/accuracy

- Apple: минимум 44x44pt hit target.
- Android: рекомендуется минимум 48x48dp.
- WCAG 2.2: минимум 24x24 CSS px (AA), лучше больше.

Implication for Alias:
- все игровые кнопки (особенно fallback) держать не меньше 48px по меньшей стороне;
- между интерактивными зонами нужен зазор, чтобы снизить мисклики.

### 5) Socket identity must not rely on transient socket.id

- Socket.IO docs: `socket.id` по умолчанию эфемерен и меняется при реконнекте/refresh.

Implication for Alias:
- роль игрока нельзя устойчиво держать только на `socket.id`;
- нужна стабильная `playerSessionId` (cookie/localStorage/auth payload) + серверная привязка.

---

## Alias-Specific Mechanics (EXA)

Это выводы из материалов именно по Alias/Party Alias:

1. Минусовые очки за ошибки/пропуски — часть базовой петли
- В официальных quick rules встречается явная логика: mistakes/skipped words = steps backward.

2. Таймерный "hard stop" + перехват последнего слова
- После окончания времени другие команды кричат "stop".
- Если слово ещё не закрыто, возможен "open guess / steal" (кто быстрее, тот получает +1).

3. Обязательная ротация объясняющего
- В правилах команды ходят по очереди, и объясняющий меняется по раундам.
- Это ключ к честности и ощущению равного участия.

4. Category freshness — критична для Alias
- Alias позиционирует регулярные новые слова/пакеты.
- В цифровой версии stale-словари быстро снижают вовлечённость.

5. Сильный уклон в social/remote формат
- У Alias есть официальные варианты для video chat и mobile.
- Это подтверждает ценность явных фаз, подсказок ролей и коротких межраундовых пауз.

---

## Current Risk Assessment in This Repo

### A) "Кнопки не у того человека" (P0 bug risk)

Observed architectural risk:
- реконнект сейчас завязан на `playerName` + актуальный `socket.id`;
- если совпадают имена или сессия неоднозначна, можно "перехватить" player-slot;
- `socket.id` эфемерен по спецификации Socket.IO.

Likely effect:
- клиент может получить/интерпретировать роль не для того пользователя;
- угадывающий/объясняющий может "переехать" после reconnect.

### B) "Следующий раунд стартует сразу" (P0/P1)

Уже частично исправлено паузой, но остаются риски:
- нет отдельного `turnPhaseId`/`turnNonce` для защиты от дублей/гонок при reconnect;
- клиент countdown локальный, без серверной коррекции при длительных лагах.

---

## Recommended UX Mechanics to Add (Prioritized Backlog)

## P0 — Reliability & Role Correctness

1. Stable player identity
- Add `playerSessionId` (uuid) на клиенте в `localStorage`.
- Передавать в `join-room`.
- На сервере reconnection искать сначала по `playerSessionId`, а не по имени.

2. Authoritative role assignment
- В `game-started` передавать не только `explainerId/guesserId`, но и серверно вычисленный `myRole` персонально в сокет.
- Клиент рендерит роль по `myRole`, а не только сравнением id.

3. Phase-state contract
- Ввести `phase: lobby | playing | round_pause | finished`.
- Во время `round_pause` блокировать `guess/skip`.

4. Turn nonce
- Добавить `turnId` (монотонный).
- Клиент игнорирует запоздалые `game-started/turn-end` со старым `turnId`.

## P1 — Round Transition UX

5. Deterministic 5s pause
- Сервер шлет `turn-end` с `pauseDuration` и `pauseEndsAt` (server timestamp).
- Клиент считает countdown от server time, а не только от локального интервала.

6. Better inter-round overlay
- Показать: "Кто следующий", "Кто объясняет", "Кто угадывает".
- Это снимает когнитивную нагрузку на старте нового раунда.

7. Alias-consistent optional steal window
- После `timer=0` дать 1.5-2.0с окно "Перехват последнего слова".
- Сервер авторитативно фиксирует first valid steal и только потом запускает паузу/следующий ход.

8. Explicit action lock
- На период overlay отключать свайп и fallback-кнопки визуально (`disabled + opacity`).

## P2 — Guesser Interaction Quality

9. Swipe affordance discoverability
- Первый раунд: краткий обучающий hint ("Свайп вправо = угадал, влево = пропуск").
- После первого успешного свайпа скрывать hint.

10. Swipe robustness
- Добавить dead-zone + velocity guard, чтобы уменьшить ложные срабатывания.
- Добавить `pointercancel`/`mouseleave` обработку.

11. Accessible fallback always available
- Кнопки не прятать полностью в режимах reduced motion / assistive tech.

## P3 — Accessibility & Input

12. WCAG alignment
- Проверка `dragging alternative` (SC 2.5.7) уже соблюдается fallback-кнопками.
- Пройтись по target-size и spacing в lobby/game controls.

13. Keyboard support (desktop / tablet keyboards)
- Enter/Space для guess/skip.
- Стрелки в lobby для смены выделения/команды (опционально).

14. Reduced motion
- Для `prefers-reduced-motion` выключить агрессивные swipe/countdown анимации.

---

## Test Plan (Must-have)

1. 4-client role integrity matrix
- fresh start (4 игрока),
- reconnect explainer during turn,
- reconnect guesser during pause,
- duplicate-name join attempt.

2. Timing integrity
- проверить, что `turn-end` держится ровно 5с перед `game-started`;
- при network throttling countdown не "скачет" в отрицательные значения.

3. Input safety
- explainer не может отправить `guess/skip` ни через UI, ни через hotkeys;
- observer не может отправить `guess/skip`;
- guesser может через swipe и через fallback.

---

## Suggested Implementation Order

1. `playerSessionId` + серверная reconnection-модель (P0).
2. `turnId` + phase-contract (P0).
3. server-timestamped countdown (P1).
4. swipe discoverability + reduced motion + keyboard fallback (P2/P3).

---

## Sources

- NN/g — Response time limits: https://www.nngroup.com/articles/response-times-3-important-limits/
- NN/g — Progress indicators: https://www.nngroup.com/articles/progress-indicators/
- NN/g — 10 usability heuristics (Visibility/Error prevention): https://www.nngroup.com/articles/ten-usability-heuristics/
- W3C WCAG 2.2 — Target size (minimum): https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- W3C WCAG 2.2 — Dragging movements: https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements
- Apple design tips (hit targets): https://developer.apple.com/design/tips/
- Apple HIG accessibility (size + spacing guidance): https://developer.apple.com/design/human-interface-guidelines/accessibility
- Android haptics principles: https://developer.android.com/develop/ui/views/haptics/haptics-principles
- Android accessibility touch targets (48dp): https://developer.android.com/codelabs/starting-android-accessibility
- Socket.IO client socket instance (`socket.id` ephemeral caution): https://socket.io/docs/v4/client-socket-instance/
- Apple GameKit turn-based guidance (context continuity): https://developer.apple.com/library/archive/documentation/NetworkingInternet/Conceptual/GameKit_Guide/ImplementingaTurn-BasedMatch/ImplementingaTurn-BasedMatch.html
- Alias rules hub (official): https://alias.eu/about-alias/rules/
- Alias official site: https://alias.eu/
- Tactic Original Alias product page: https://games.tactic.net/en/tuote/original-alias/
- Alias original rules PDF (official asset): https://alias.eu/wp-content/uploads/2015/09/Alias_Original_rules_US-UK_D.pdf
- Party Alias rules PDF: http://www.tactic.net/site/rules/US/02677.pdf
- Video Chat Alias (official): https://alias.eu/video-chat-alias/
