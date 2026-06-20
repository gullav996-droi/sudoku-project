const ThemeController = (() => {
    const storageKey = 'sudoku-theme';
    const root = document.documentElement;
    let initialized = false;

    const getPreferredTheme = () => {
        try {
            const savedTheme = localStorage.getItem(storageKey);
            if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
        } catch (error) {
            // Keep the app usable if storage is unavailable.
        }
        return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    };

    const updateControls = (theme) => {
        document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
            const isDark = theme === 'dark';
            button.setAttribute('aria-pressed', String(isDark));
            button.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} mode`);
            const icon = button.querySelector('.theme-toggle-icon');
            const text = button.querySelector('.theme-toggle-text');
            if (icon) icon.textContent = isDark ? 'L' : 'D';
            if (text) text.textContent = isDark ? 'Light' : 'Dark';
        });
    };

    const setTheme = (theme, persist = true) => {
        const nextTheme = theme === 'dark' ? 'dark' : 'light';
        root.dataset.theme = nextTheme;
        document.body?.setAttribute('data-theme', nextTheme);
        updateControls(nextTheme);
        if (!persist) return;
        try {
            localStorage.setItem(storageKey, nextTheme);
        } catch (error) {
            // Theme still changes for this session.
        }
    };

    const init = () => {
        if (initialized) {
            updateControls(root.dataset.theme || getPreferredTheme());
            return;
        }
        initialized = true;
        setTheme(root.dataset.theme || getPreferredTheme(), false);
        document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
            button.addEventListener('click', () => {
                setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
            });
        });
    };

    return { init };
})();

const SudokuApp = (() => {
    const boardEl = document.getElementById('sudoku-board');
    const timerEl = document.getElementById('timer-value');
    const modeEl = document.getElementById('game-mode');
    const difficultyEl = document.getElementById('game-difficulty');
    const scoreEl = document.getElementById('score-value');
    const mistakesEl = document.getElementById('mistake-count');
    const hintEl = document.getElementById('hint-count');
    const noteToggle = document.getElementById('note-toggle');
    const pauseBtn = document.getElementById('pause-board');
    const undoBtn = document.getElementById('undo-move');
    const redoBtn = document.getElementById('redo-move');
    const resetBtn = document.getElementById('reset-board');
    const solveBtn = document.getElementById('solve-board');
    const replayTutorialBtn = document.getElementById('replay-tutorial');
    const noteIndicator = document.getElementById('note-mode-indicator');
    const statusEl = document.getElementById('game-status');
    const numberPad = document.querySelectorAll('.note-panel button[data-number]');
    const state = {
        puzzle: [],
        userGrid: [],
        solution: [],
        notes: [],
        activeIndex: null,
        selectedNumber: null,
        noteMode: false,
        timer: null,
        seconds: 0,
        mistakes: 0,
        hintCount: 3,
        history: [],
        future: [],
        gameOver: false,
        paused: false,
        sessionSaved: false,
        statusTimeout: null,
        saveTimeout: null,
        cellEls: [],
        cellInputs: [],
    };

    const emptyNotes = () => Array.from({ length: 81 }, () => []);

    const cloneNotes = (notes) => notes.map((items) => [...items]);

    const normalizeNotes = (notes) => {
        if (!Array.isArray(notes) || notes.length !== 81) return emptyNotes();
        return notes.map((items) => {
            if (!Array.isArray(items)) return [];
            return [...new Set(items.map(Number).filter((number) => number >= 1 && number <= 9))].sort((a, b) => a - b);
        });
    };

    const parseDatasetJSON = (name, fallback) => {
        try {
            const raw = boardEl?.dataset?.[name];
            return raw ? JSON.parse(raw) : fallback;
        } catch (error) {
            return fallback;
        }
    };

    const storageKey = () => {
        const sessionId = boardEl?.dataset?.sessionId || 'anonymous';
        const puzzleSignature = state.puzzle.join('');
        return `sudoku-game-state:${sessionId}:${puzzleSignature}`;
    };

    const createCells = () => {
        if (!boardEl) return;
        boardEl.innerHTML = '';
        for (let idx = 0; idx < 81; idx += 1) {
            const wrapper = document.createElement('div');
            wrapper.className = 'sudoku-cell';
            wrapper.dataset.index = idx;
            wrapper.setAttribute('role', 'gridcell');
            wrapper.tabIndex = -1;
            wrapper.addEventListener('pointerdown', () => setActiveCell(idx));
            const input = document.createElement('input');
            input.type = 'text';
            input.maxLength = 1;
            input.dataset.index = idx;
            input.autocomplete = 'off';
            input.inputMode = 'numeric';
            input.ariaLabel = `Sudoku cell ${idx + 1}`;
            input.addEventListener('focus', () => setActiveCell(idx));
            input.addEventListener('click', () => setActiveCell(idx));
            input.addEventListener('input', handleCellInput);
            input.addEventListener('keydown', handleKeyDown);
            const notes = document.createElement('div');
            notes.className = 'cell-notes';
            notes.setAttribute('aria-hidden', 'true');
            for (let note = 1; note <= 9; note += 1) {
                const marker = document.createElement('span');
                marker.dataset.note = String(note);
                notes.appendChild(marker);
            }
            wrapper.appendChild(input);
            wrapper.appendChild(notes);
            boardEl.appendChild(wrapper);
        }
        state.cellEls = Array.from(boardEl.querySelectorAll('.sudoku-cell'));
        state.cellInputs = Array.from(boardEl.querySelectorAll('input'));
    };

    const loadPuzzle = () => {
        state.puzzle = parseDatasetJSON('puzzle', []);
        state.solution = parseDatasetJSON('solution', []);
        if (state.puzzle.length !== 81 || state.solution.length !== 81) return;
        state.userGrid = parseDatasetJSON('progress', state.puzzle).slice(0, 81);
        if (state.userGrid.length !== 81) state.userGrid = state.puzzle.slice();
        state.notes = normalizeNotes(parseDatasetJSON('notes', emptyNotes()));
        state.seconds = 0;
        state.mistakes = 0;
        state.hintCount = 3;
        restoreLocalGameState();
        state.history = [];
        state.future = [];
        state.gameOver = false;
        state.paused = false;
        document.body.classList.remove('game-won');
        highlightDifficulty();
        renderGrid();
        setGameStatus();
        startTimer();
        updateCounters();
        updatePauseButton();
        updateSolveButtonState();
        updateNoteModeUI();
    };

    const highlightDifficulty = () => {
        if (difficultyEl) {
            difficultyEl.textContent = boardEl.dataset.difficulty || 'Medium';
        }
        if (modeEl) {
            modeEl.textContent = boardEl.dataset.mode || 'Random Puzzle';
        }
    };

    const normalizeValue = (value) => {
        const number = Number(value);
        return Number.isInteger(number) && number >= 1 && number <= 9 ? number : null;
    };

    const isFixedCell = (index) => normalizeValue(state.puzzle[index]) !== null;

    const renderGrid = () => {
        state.cellInputs.forEach((cell, idx) => {
            const value = getCellValue(idx);
            cell.value = value || '';
            cell.readOnly = isFixedCell(idx) || state.gameOver || state.paused;
            cell.disabled = false;
            cell.setAttribute('aria-readonly', String(cell.readOnly));
            cell.setAttribute('aria-label', buildCellLabel(idx));
            const wrapper = cell.parentElement;
            wrapper.classList.toggle('fixed', isFixedCell(idx));
            wrapper.classList.toggle('is-disabled', state.gameOver || state.paused);
            wrapper.classList.toggle('user-entry', !isFixedCell(idx) && Boolean(value));
            wrapper.classList.toggle('has-notes', !value && state.notes[idx]?.length > 0);
            wrapper.dataset.value = value || '';
            wrapper.classList.remove('duplicate', 'active', 'selected-row', 'selected-col', 'selected-block', 'same-number');
            renderCellNotes(wrapper, idx, value);
        });
    };

    const buildCellLabel = (index) => {
        const row = Math.floor(index / 9) + 1;
        const col = (index % 9) + 1;
        const value = getCellValue(index);
        if (value) return `Row ${row}, column ${col}, value ${value}`;
        const notes = state.notes[index] || [];
        return `Row ${row}, column ${col}, empty${notes.length ? `, notes ${notes.join(', ')}` : ''}`;
    };

    const renderCellNotes = (wrapper, index, value) => {
        const noteGrid = wrapper.querySelector('.cell-notes');
        if (!noteGrid) return;
        const notes = new Set(value ? [] : state.notes[index]);
        noteGrid.querySelectorAll('span').forEach((span) => {
            const note = Number(span.dataset.note);
            span.textContent = notes.has(note) ? String(note) : '';
            span.classList.toggle('is-visible', notes.has(note));
        });
    };

    const setActiveCell = (index) => {
        if (!Number.isInteger(index) || index < 0 || index >= 81) return;
        state.activeIndex = index;
        state.selectedNumber = getCellValue(index) || null;
        refreshHighlights();
        setNumberPadActive();
    };

    const clearSelection = () => {
        state.activeIndex = null;
        state.selectedNumber = null;
        refreshHighlights();
        setNumberPadActive();
    };

    const getCellValue = (index) => normalizeValue(state.userGrid[index]) || normalizeValue(state.puzzle[index]);

    const syncSelectedNumber = () => {
        state.selectedNumber = state.activeIndex !== null ? getCellValue(state.activeIndex) || null : null;
        setNumberPadActive();
    };

    const refreshHighlights = () => {
        const activeIndex = state.activeIndex;
        const selectedNumber = state.selectedNumber;
        const activeRow = activeIndex !== null ? Math.floor(activeIndex / 9) : null;
        const activeCol = activeIndex !== null ? activeIndex % 9 : null;
        const activeBlockRow = activeIndex !== null ? Math.floor(activeRow / 3) : null;
        const activeBlockCol = activeIndex !== null ? Math.floor(activeCol / 3) : null;

        state.cellEls.forEach((cell) => {
            const idx = Number(cell.dataset.index);
            const row = Math.floor(idx / 9);
            const col = idx % 9;
            const blockRow = Math.floor(row / 3);
            const blockCol = Math.floor(col / 3);
            const value = getCellValue(idx);
            cell.dataset.value = value || '';

            cell.classList.remove('active', 'selected-row', 'selected-col', 'selected-block', 'same-number', 'duplicate');

            if (activeIndex !== null) {
                if (row === activeRow) cell.classList.add('selected-row');
                if (col === activeCol) cell.classList.add('selected-col');
                if (blockRow === activeBlockRow && blockCol === activeBlockCol) cell.classList.add('selected-block');
                if (idx === activeIndex) cell.classList.add('active');
            }

            if (selectedNumber && value === selectedNumber) {
                cell.classList.add('same-number');
            }

            const hasError = state.userGrid[idx] && state.userGrid[idx] !== state.solution[idx];
            if (hasError) {
                cell.classList.add('duplicate');
            }
        });
    };

    const handleCellInput = (event) => {
        const value = event.target.value.trim();
        const index = Number(event.target.dataset.index);
        if (!/^[1-9]$/.test(value)) {
            event.target.value = '';
            updateCell(index, 0);
            return;
        }
        if (state.noteMode) {
            event.target.value = '';
            toggleNote(index, Number(value));
            return;
        }
        const number = Number(value);
        updateCell(index, number);
    };

    const handleKeyDown = (event) => {
        if (state.activeIndex === null) return;
        if (state.paused) {
            event.preventDefault();
            return;
        }
        if (/^[1-9]$/.test(event.key)) {
            event.preventDefault();
            handleNumber(Number(event.key));
            return;
        }
        if (event.key === 'Backspace' || event.key === 'Delete') {
            event.preventDefault();
            clearCell(state.activeIndex);
            return;
        }
        if (event.key.startsWith('Arrow')) {
            event.preventDefault();
            moveSelection(event.key);
        }
    };

    const updateCell = (index, value) => {
        if (isFixedCell(index) || state.gameOver || state.paused) return;
        const previousValue = state.userGrid[index];
        if (previousValue === value) return;
        saveHistory();
        state.userGrid[index] = value;
        if (value) state.notes[index] = [];
        if (index === state.activeIndex) {
            state.selectedNumber = value || null;
        }
        if (value && value !== state.solution[index]) {
            state.mistakes += 1;
            if (mistakesEl) mistakesEl.textContent = state.mistakes;
            state.userGrid[index] = 0;
            syncSelectedNumber();
            renderGrid();
            const cell = state.cellEls[index];
            cell.classList.add('duplicate');
            setTimeout(() => cell.classList.remove('duplicate'), 1000);
            refreshHighlights();
            updateCounters();
            updateSolveButtonState();
            scheduleSave();
            return;
        }
        renderGrid();
        syncSelectedNumber();
        refreshHighlights();
        updateCounters();
        updateSolveButtonState();
        scheduleSave();
        checkWinCondition();
    };

    const clearCell = (index) => {
        if (isFixedCell(index) || state.gameOver || state.paused) return;
        if (!state.userGrid[index] && !state.notes[index]?.length) return;
        saveHistory();
        state.userGrid[index] = 0;
        state.notes[index] = [];
        renderGrid();
        syncSelectedNumber();
        refreshHighlights();
        updateCounters();
        updateSolveButtonState();
        scheduleSave();
    };

    const toggleNote = (index, number) => {
        if (isFixedCell(index) || state.gameOver || state.paused || getCellValue(index)) return;
        saveHistory();
        const notes = new Set(state.notes[index] || []);
        if (notes.has(number)) {
            notes.delete(number);
        } else {
            notes.add(number);
        }
        state.notes[index] = [...notes].sort((a, b) => a - b);
        state.selectedNumber = number;
        renderGrid();
        refreshHighlights();
        setNumberPadActive();
        scheduleSave();
    };

    const handleNumber = (number) => {
        if (!Number.isInteger(number) || state.activeIndex === null) return;
        if (state.noteMode) {
            toggleNote(state.activeIndex, number);
            return;
        }
        updateCell(state.activeIndex, number);
    };

    const moveSelection = (key) => {
        const current = state.activeIndex ?? 0;
        const row = Math.floor(current / 9);
        const col = current % 9;
        let next = current;
        if (key === 'ArrowUp') next = Math.max(0, row - 1) * 9 + col;
        if (key === 'ArrowDown') next = Math.min(8, row + 1) * 9 + col;
        if (key === 'ArrowLeft') next = row * 9 + Math.max(0, col - 1);
        if (key === 'ArrowRight') next = row * 9 + Math.min(8, col + 1);
        setActiveCell(next);
        state.cellInputs[next]?.focus();
    };

    const saveHistory = () => {
        state.history.push({
            userGrid: [...state.userGrid],
            notes: cloneNotes(state.notes),
            mistakes: state.mistakes,
            hintCount: state.hintCount,
        });
        state.future = [];
    };

    const setNumberPadActive = () => {
        numberPad.forEach((button) => {
            const number = Number(button.dataset.number);
            const activeNote = state.activeIndex !== null && state.noteMode && state.notes[state.activeIndex]?.includes(number);
            button.classList.toggle('active', state.selectedNumber === number || activeNote);
        });
    };

    const undoMove = () => {
        if (!state.history.length) return;
        state.future.push({
            userGrid: [...state.userGrid],
            notes: cloneNotes(state.notes),
            mistakes: state.mistakes,
            hintCount: state.hintCount,
        });
        const previous = state.history.pop();
        state.userGrid = previous.userGrid;
        state.notes = previous.notes;
        state.mistakes = previous.mistakes;
        state.hintCount = previous.hintCount;
        renderGrid();
        syncSelectedNumber();
        refreshHighlights();
        updateCounters();
        updateSolveButtonState();
        scheduleSave();
    };

    const redoMove = () => {
        if (!state.future.length) return;
        state.history.push({
            userGrid: [...state.userGrid],
            notes: cloneNotes(state.notes),
            mistakes: state.mistakes,
            hintCount: state.hintCount,
        });
        const next = state.future.pop();
        state.userGrid = next.userGrid;
        state.notes = next.notes;
        state.mistakes = next.mistakes;
        state.hintCount = next.hintCount;
        renderGrid();
        syncSelectedNumber();
        refreshHighlights();
        updateCounters();
        updateSolveButtonState();
        scheduleSave();
    };

    const updateCounters = () => {
        if (scoreEl) scoreEl.textContent = Math.max(0, 1000 - state.mistakes * 12 - Math.floor(state.seconds / 2));
        if (hintEl) hintEl.textContent = state.hintCount;
        if (mistakesEl) mistakesEl.textContent = state.mistakes;
    };

    const getBlockIndices = (blockIndex) => {
        const blockRow = Math.floor(blockIndex / 3);
        const blockCol = blockIndex % 3;
        const indices = [];
        for (let row = 0; row < 3; row += 1) {
            for (let col = 0; col < 3; col += 1) {
                indices.push((blockRow * 3 + row) * 9 + blockCol * 3 + col);
            }
        }
        return indices;
    };

    const isBlockComplete = (blockIndex) => {
        const indices = getBlockIndices(blockIndex);
        return indices.every((idx) => state.userGrid[idx] !== 0);
    };

    const canEnableSolve = () => {
        if (state.gameOver) return false;
        const completedBlocks = Array.from({ length: 9 }, (_, idx) => isBlockComplete(idx))
            .filter(Boolean).length;
        return completedBlocks >= 6;
    };

    const updateSolveButtonState = () => {
        if (!solveBtn) return;
        solveBtn.disabled = !canEnableSolve();
    };

    const updatePauseButton = () => {
        if (!pauseBtn) return;
        pauseBtn.textContent = state.paused ? 'Resume' : 'Pause';
    };

    const updateNoteModeUI = () => {
        noteToggle?.classList.toggle('active', state.noteMode);
        noteToggle?.setAttribute('aria-pressed', String(state.noteMode));
        if (noteToggle) noteToggle.textContent = state.noteMode ? 'Note ON' : 'Note';
        if (noteIndicator) {
            noteIndicator.textContent = state.noteMode ? 'Note Mode: ON' : 'Note Mode: OFF';
            noteIndicator.classList.toggle('active', state.noteMode);
        }
        setNumberPadActive();
    };

    const pauseBoard = () => {
        state.paused = !state.paused;
        if (state.paused) {
            stopTimer();
        } else {
            startTimer();
        }
        renderGrid();
        syncSelectedNumber();
        refreshHighlights();
        updatePauseButton();
        updateSolveButtonState();
    };

    const showTemporaryStatus = (message, variant = 'warning', duration = 1500) => {
        setGameStatus(message, variant);
        if (state.statusTimeout) {
            clearTimeout(state.statusTimeout);
        }
        state.statusTimeout = setTimeout(() => {
            setGameStatus();
            state.statusTimeout = null;
        }, duration);
    };

    const getCookie = (name) => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        return parts.length === 2 ? parts.pop().split(';').shift() : '';
    };

    const sendCompleteGameSession = () => {
        if (state.sessionSaved) return;
        const sessionId = boardEl.dataset.sessionId;
        const completeUrl = boardEl.dataset.completeUrl;
        if (!sessionId || !completeUrl) return;

        const payload = {
            session_id: Number(sessionId),
            progress: state.userGrid,
            notes: state.notes,
            mistakes: state.mistakes,
            hints_used: 3 - state.hintCount,
            elapsed_seconds: state.seconds,
            score: Math.max(0, 1000 - state.mistakes * 12 - Math.floor(state.seconds / 2)),
        };

        fetch(completeUrl, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken'),
            },
            body: JSON.stringify(payload),
        }).finally(() => {
            state.sessionSaved = true;
            clearLocalGameState();
        });
    };

    const scheduleSave = () => {
        persistLocalGameState();
        if (!boardEl?.dataset?.sessionId || !boardEl?.dataset?.saveUrl) return;
        if (state.saveTimeout) clearTimeout(state.saveTimeout);
        state.saveTimeout = setTimeout(sendSaveGameSession, 500);
    };

    const sendSaveGameSession = () => {
        const sessionId = boardEl.dataset.sessionId;
        const saveUrl = boardEl.dataset.saveUrl;
        if (!sessionId || !saveUrl || state.gameOver) return;
        fetch(saveUrl, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken'),
            },
            body: JSON.stringify({
                session_id: Number(sessionId),
                progress: state.userGrid,
                notes: state.notes,
                mistakes: state.mistakes,
                hints_used: 3 - state.hintCount,
                elapsed_seconds: state.seconds,
                score: Math.max(0, 1000 - state.mistakes * 12 - Math.floor(state.seconds / 2)),
            }),
        }).catch(() => {});
    };

    const persistLocalGameState = () => {
        try {
            localStorage.setItem(storageKey(), JSON.stringify({
                userGrid: state.userGrid,
                notes: state.notes,
                mistakes: state.mistakes,
                hintCount: state.hintCount,
            }));
        } catch (error) {}
    };

    const restoreLocalGameState = () => {
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey()) || 'null');
            if (!saved) return;
            if (Array.isArray(saved.userGrid) && saved.userGrid.length === 81) {
                state.userGrid = saved.userGrid;
            }
            state.notes = normalizeNotes(saved.notes);
            state.mistakes = Number(saved.mistakes) || 0;
            state.hintCount = Number.isInteger(saved.hintCount) ? saved.hintCount : 3;
        } catch (error) {}
    };

    const clearLocalGameState = () => {
        try {
            localStorage.removeItem(storageKey());
        } catch (error) {}
    };

    const startTimer = () => {
        stopTimer();
        if (!timerEl) return;
        state.timer = setInterval(() => {
            state.seconds += 1;
            const minutes = String(Math.floor(state.seconds / 60)).padStart(2, '0');
            const seconds = String(state.seconds % 60).padStart(2, '0');
            timerEl.textContent = `${minutes}:${seconds}`;
            updateCounters();
        }, 1000);
    };

    const stopTimer = () => {
        if (state.timer) {
            clearInterval(state.timer);
            state.timer = null;
        }
    };

    const hintMove = () => {
        if (state.gameOver || state.hintCount <= 0) return;
        const emptyIndexes = state.userGrid
            .map((value, idx) => (value === 0 ? idx : -1))
            .filter((idx) => idx >= 0);
        if (!emptyIndexes.length) return;
        const index = emptyIndexes[Math.floor(Math.random() * emptyIndexes.length)];
        saveHistory();
        state.userGrid[index] = state.solution[index];
        state.notes[index] = [];
        state.hintCount -= 1;
        updateCounters();
        renderGrid();
        syncSelectedNumber();
        refreshHighlights();
        updateSolveButtonState();
        scheduleSave();
        setGameStatus('Hint placed. Keep going!', 'info');
        checkWinCondition();
    };

    const resetBoard = () => {
        stopTimer();
        state.userGrid = state.puzzle.slice();
        state.notes = emptyNotes();
        state.mistakes = 0;
        state.seconds = 0;
        state.hintCount = 3;
        state.history = [];
        state.future = [];
        state.gameOver = false;
        state.paused = false;
        state.sessionSaved = false;
        renderGrid();
        syncSelectedNumber();
        refreshHighlights();
        updateCounters();
        updatePauseButton();
        updateSolveButtonState();
        setGameStatus();
        scheduleSave();
        startTimer();
    };

    const solveBoard = () => {
        stopTimer();
        state.userGrid = state.solution.slice();
        state.notes = emptyNotes();
        state.gameOver = true;
        state.paused = false;
        renderGrid();
        syncSelectedNumber();
        refreshHighlights();
        updateCounters();
        updateSolveButtonState();
        updatePauseButton();
        setGameStatus('Puzzle solved. Review the completed board.', 'info');
        sendCompleteGameSession();
    };

    const checkWinCondition = () => {
        const complete = state.userGrid.every((value, idx) => value === state.solution[idx] && value !== 0);
        if (complete) {
            state.gameOver = true;
            stopTimer();
            setGameStatus('Puzzle complete! Well played.', 'success');
            document.body.classList.add('game-won');
            if (window.confetti) {
                window.confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
            }
            sendCompleteGameSession();
        }
    };

    const setGameStatus = (message = '', variant = 'success') => {
        if (!statusEl) return;
        if (!message) {
            statusEl.classList.add('d-none');
            statusEl.textContent = '';
            statusEl.classList.remove('status-success', 'status-info', 'status-warning');
            return;
        }
        statusEl.textContent = message;
        statusEl.classList.remove('d-none', 'status-success', 'status-info', 'status-warning');
        statusEl.classList.add(`status-${variant}`);
    };

    const attachEvents = () => {
        if (!boardEl) return;
        noteToggle?.addEventListener('click', () => {
            state.noteMode = !state.noteMode;
            updateNoteModeUI();
            setGameStatus(state.noteMode ? 'Note mode enabled.' : 'Note mode disabled.', 'info');
        });
        replayTutorialBtn?.addEventListener('click', () => TutorialController.start(true));
        pauseBtn?.addEventListener('click', pauseBoard);
        undoBtn?.addEventListener('click', undoMove);
        redoBtn?.addEventListener('click', redoMove);
        resetBtn?.addEventListener('click', resetBoard);
        solveBtn?.addEventListener('click', solveBoard);
        document.addEventListener('keydown', (event) => {
            if (/^[1-9]$/.test(event.key) && state.activeIndex !== null && !event.ctrlKey && !event.metaKey && !event.altKey) {
                const insideBoard = boardEl.contains(document.activeElement);
                if (insideBoard) {
                    event.preventDefault();
                    handleNumber(Number(event.key));
                }
            }
            if (event.key === 'Escape') {
                clearSelection();
            }
        });
        document.addEventListener('pointerdown', (event) => {
            const target = event.target;
            if (boardEl.contains(target) || target.closest('.note-panel')) return;
            clearSelection();
        });
        document.addEventListener('focusin', (event) => {
            const target = event.target;
            if (boardEl.contains(target) || target.closest('.note-panel')) return;
            clearSelection();
        });
        numberPad.forEach((button) => {
            button.addEventListener('click', () => {
                const number = Number(button.dataset.number);
                handleNumber(number);
            });
        });
        document.getElementById('hint-button')?.addEventListener('click', hintMove);
        window.addEventListener('beforeunload', () => {
            if (state.saveTimeout) clearTimeout(state.saveTimeout);
            persistLocalGameState();
            sendSaveGameSession();
        });
    };

    const attachPasswordToggleEvents = () => {
        const toggles = document.querySelectorAll('.password-toggle');
        toggles.forEach((toggle) => {
            const targetSelector = toggle.dataset.target;
            const targetInput = targetSelector ? document.querySelector(targetSelector) : null;
            if (!targetInput) return;
            toggle.addEventListener('click', () => {
                const isPassword = targetInput.type === 'password';
                targetInput.type = isPassword ? 'text' : 'password';
                toggle.textContent = isPassword ? 'Hide' : 'Show';
            });
        });
    };

    const init = () => {
        if (boardEl) {
            createCells();
            loadPuzzle();
            attachEvents();
        }
        attachPasswordToggleEvents();
    };

    return { init };
})();

const TutorialController = (() => {
    const board = document.getElementById('sudoku-board');
    const steps = [
        { title: 'Choose an empty cell', text: 'Sudoku starts by selecting an open square. The highlighted cell is ready for your move.', selector: '.sudoku-cell:not(.fixed)' },
        { title: 'Pick a number', text: 'Use the number pad, keyboard, mouse, or touch. The same controls work on mobile.', selector: '.note-panel' },
        { title: 'Learn the three rules', text: 'Every row, every column, and every 3x3 box must contain 1-9 exactly once.', selector: '#sudoku-board' },
        { title: 'See a correct move', text: 'A correct placement fills the cell and clears pencil marks from that square.', selector: '.sudoku-cell:not(.fixed)' },
        { title: 'Understand mistakes', text: 'An invalid move flashes red so you can see why it cannot stay in the puzzle.', selector: '.sudoku-cell:not(.fixed)' },
    ];
    let overlay = null;
    let index = 0;

    const completedKey = 'sudoku-tutorial-completed';

    const shouldAutoStart = () => {
        if (!board) return false;
        if (board.dataset.tutorialCompleted === 'true') return false;
        try {
            if (localStorage.getItem(completedKey) === 'true') return false;
        } catch (error) {}
        return true;
    };

    const start = (force = false) => {
        if (!board || (!force && !shouldAutoStart())) return;
        index = 0;
        createOverlay();
        render();
    };

    const createOverlay = () => {
        close(false);
        overlay = document.createElement('div');
        overlay.className = 'tutorial-overlay';
        overlay.innerHTML = `
            <div class="tutorial-card" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
                <div class="tutorial-visual" aria-hidden="true"><span class="tutorial-cursor"></span></div>
                <span class="eyebrow">First-time tutorial</span>
                <h2 id="tutorial-title"></h2>
                <p data-tutorial-text></p>
                <div class="tutorial-rules" hidden>
                    <span>Rows: 1-9 once</span>
                    <span>Columns: 1-9 once</span>
                    <span>3x3 boxes: 1-9 once</span>
                </div>
                <div class="tutorial-actions">
                    <button type="button" class="button button-secondary" data-tutorial-prev>Previous</button>
                    <button type="button" class="button button-secondary" data-tutorial-skip>Skip</button>
                    <button type="button" class="button button-primary" data-tutorial-next>Start Learning</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('[data-tutorial-prev]').addEventListener('click', previous);
        overlay.querySelector('[data-tutorial-skip]').addEventListener('click', finish);
        overlay.querySelector('[data-tutorial-next]').addEventListener('click', next);
        document.addEventListener('keydown', handleKeys);
    };

    const render = () => {
        if (!overlay) return;
        const step = steps[index];
        clearHighlights();
        const target = document.querySelector(step.selector);
        target?.classList.add('tutorial-highlight');
        overlay.querySelector('#tutorial-title').textContent = step.title;
        overlay.querySelector('[data-tutorial-text]').textContent = step.text;
        overlay.querySelector('.tutorial-rules').hidden = index !== 2;
        overlay.querySelector('[data-tutorial-prev]').disabled = index === 0;
        overlay.querySelector('[data-tutorial-next]').textContent = index === steps.length - 1 ? 'Finish' : (index === 0 ? 'Start Learning' : 'Next');
        overlay.querySelector('.tutorial-card').focus?.();
        animateStep(index, target);
    };

    const animateStep = (stepIndex, target) => {
        if (!target) return;
        if (stepIndex === 0 || stepIndex === 3) target.classList.add('tutorial-click-demo');
        if (stepIndex === 1) target.querySelector('button')?.classList.add('tutorial-click-demo');
        if (stepIndex === 4) target.classList.add('duplicate', 'tutorial-click-demo');
        setTimeout(() => {
            target.classList.remove('tutorial-click-demo');
            target.querySelector('button')?.classList.remove('tutorial-click-demo');
        }, 900);
    };

    const next = () => {
        if (index >= steps.length - 1) {
            finish();
            return;
        }
        index += 1;
        render();
    };

    const previous = () => {
        index = Math.max(0, index - 1);
        render();
    };

    const finish = () => {
        markComplete();
        close();
    };

    const markComplete = () => {
        try {
            localStorage.setItem(completedKey, 'true');
        } catch (error) {}
        const url = board?.dataset?.tutorialCompleteUrl;
        if (!url) return;
        fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'X-CSRFToken': getCookie('csrftoken') },
        }).catch(() => {});
    };

    const close = (removeListener = true) => {
        clearHighlights();
        overlay?.remove();
        overlay = null;
        if (removeListener) document.removeEventListener('keydown', handleKeys);
    };

    const clearHighlights = () => {
        document.querySelectorAll('.tutorial-highlight, .tutorial-click-demo').forEach((el) => {
            el.classList.remove('tutorial-highlight', 'tutorial-click-demo', 'duplicate');
        });
    };

    const getCookie = (name) => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        return parts.length === 2 ? parts.pop().split(';').shift() : '';
    };

    const handleKeys = (event) => {
        if (!overlay) return;
        if (event.key === 'ArrowRight' || event.key === 'Enter') next();
        if (event.key === 'ArrowLeft') previous();
        if (event.key === 'Escape') finish();
    };

    return { start };
})();

const LearningApp = (() => {
    const page = document.querySelector('[data-learning-page]');
    if (!page) return { init: () => {} };
    const parseJSONScript = (id, fallback) => {
        try {
            return JSON.parse(document.getElementById(id)?.textContent || JSON.stringify(fallback));
        } catch (error) {
            return fallback;
        }
    };
    const lessons = parseJSONScript('learning-lessons-data', []);
    const initialProgress = parseJSONScript('learning-progress-data', {});
    const firstLessonId = lessons[0]?.id || 1;
    const lastLessonId = lessons[lessons.length - 1]?.id || 1;
    const state = {
        selectedLesson: initialProgress.current_lesson || firstLessonId,
        unlockedLesson: initialProgress.current_lesson || firstLessonId,
        completed: new Set((initialProgress.completed_lessons || []).map(Number)),
        xp: initialProgress.xp || 0,
        achievements: new Set(initialProgress.achievements || []),
        selectedAnswers: new Set(),
        selectedCellIndex: null,
        cellAnswers: new Map(),
        solvedThisView: false,
        saving: false,
    };

    const init = () => {
        if (!lessons.length) {
            showFeedback('Lessons could not be loaded. Please refresh the page.', 'error');
            return;
        }
        page.querySelectorAll('[data-lesson-id]').forEach((button) => {
            button.addEventListener('click', () => {
                if (button.getAttribute('aria-disabled') === 'true') return;
                selectLesson(Number(button.dataset.lessonId));
            });
        });
        page.querySelector('[data-check-practice]')?.addEventListener('click', checkPractice);
        page.querySelector('[data-prev-lesson]')?.addEventListener('click', previousLesson);
        page.querySelector('[data-next-lesson]')?.addEventListener('click', nextLesson);
        page.addEventListener('keydown', handlePracticeKeydown);
        restoreAnonymousProgress();
        state.unlockedLesson = Math.max(state.unlockedLesson, getUnlockedFromCompleted());
        selectLesson(Math.min(state.selectedLesson, state.unlockedLesson));
        renderProgress();
    };

    const selectLesson = (lessonId) => {
        if (!canOpenLesson(lessonId)) {
            showFeedback('Complete the current practice challenge before moving ahead.', 'error');
            return;
        }
        const lesson = lessons.find((item) => item.id === lessonId) || lessons[0];
        if (!lesson) return;
        state.selectedLesson = lesson.id;
        resetPracticeState();
        setText('[data-lesson-kicker]', `Lesson ${lesson.id}`);
        setText('[data-lesson-title]', lesson.title);
        setText('[data-lesson-summary]', lesson.summary);
        setText('[data-lesson-focus]', lesson.focus);
        setText('[data-practice-question]', lesson.practice?.question || 'Choose the correct answer.');
        clearFeedback();
        renderPractice(lesson);
        renderProgress();
    };

    const renderPractice = (lesson) => {
        const boardEl = page.querySelector('[data-practice-board]');
        const optionsEl = page.querySelector('[data-practice-options]');
        if (!boardEl || !optionsEl) {
            showFeedback('Practice controls are missing from the page.', 'error');
            return;
        }
        boardEl.innerHTML = '';
        optionsEl.innerHTML = '';
        setText('[data-practice-instruction]', lesson.practice?.type === 'multi'
            ? 'Click the empty cell, then choose candidate notes from the number pad.'
            : 'Click the empty cell, then choose a number from the number pad.');
        const values = lesson.practice?.values || [];
        const boardMode = getPracticeBoardMode(lesson);
        boardEl.className = `practice-board practice-board-${boardMode}`;
        values.forEach((value, idx) => {
            const empty = value === '';
            const cell = document.createElement(empty ? 'button' : 'span');
            if (empty) {
                cell.type = 'button';
                cell.addEventListener('click', () => selectPracticeCell(idx));
            }
            cell.textContent = empty ? '' : value;
            cell.className = `practice-cell${empty ? ' is-empty' : ''}${value === 'x' ? ' is-blocked' : ''}`;
            cell.dataset.cellIndex = String(idx);
            if (empty) cell.setAttribute('aria-pressed', 'false');
            cell.setAttribute('aria-label', empty ? `Empty cell at position ${idx + 1}` : `Value ${value}`);
            boardEl.appendChild(cell);
            if (empty && state.selectedCellIndex === null) state.selectedCellIndex = idx;
        });
        syncPracticeCells();
        for (let number = 1; number <= 9; number += 1) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'button button-secondary';
            button.textContent = String(number);
            button.setAttribute('aria-pressed', 'false');
            button.addEventListener('click', () => {
                clearFeedback();
                setPracticeAnswer(String(number), lesson.practice?.type === 'multi');
            });
            optionsEl.appendChild(button);
        }
        renderOptionState(optionsEl);
    };

    const getPracticeBoardMode = (lesson) => {
        const values = lesson.practice?.values || [];
        if (values.length !== 9) return 'wide';
        const title = (lesson.title || '').toLowerCase();
        if (title.includes('column')) return 'column';
        if (title.includes('row') || lesson.id === firstLessonId) return 'row';
        return 'grid';
    };

    const resetPracticeState = () => {
        state.selectedAnswers = new Set();
        state.selectedCellIndex = null;
        state.cellAnswers = new Map();
        state.solvedThisView = false;
    };

    const selectPracticeCell = (idx) => {
        state.selectedCellIndex = idx;
        syncPracticeCells();
        page.querySelector(`[data-practice-board] [data-cell-index="${idx}"]`)?.focus();
    };

    const handlePracticeKeydown = (event) => {
        if (!/^[1-9]$/.test(event.key)) return;
        const lesson = lessons.find((item) => item.id === state.selectedLesson);
        if (!lesson?.practice) return;
        clearFeedback();
        setPracticeAnswer(event.key, lesson.practice.type === 'multi');
    };

    const setPracticeAnswer = (value, allowMultiple = false) => {
        if (state.selectedCellIndex === null) {
            const firstEmpty = page.querySelector('[data-practice-board] .practice-cell.is-empty');
            if (firstEmpty) state.selectedCellIndex = Number(firstEmpty.dataset.cellIndex);
        }
        if (allowMultiple) {
            if (state.selectedAnswers.has(value)) state.selectedAnswers.delete(value);
            else state.selectedAnswers.add(value);
            updateSelectedCellFromAnswer(true);
        } else {
            state.selectedAnswers = new Set([value]);
            updateSelectedCellFromAnswer();
        }
        renderOptionState(page.querySelector('[data-practice-options]'));
        syncPracticeCells();
    };

    const updateSelectedCellFromAnswer = (allowMultiple = false) => {
        if (state.selectedCellIndex === null) return;
        const answer = allowMultiple ? [...state.selectedAnswers].sort() : ([...state.selectedAnswers].slice(-1)[0] || '');
        if ((Array.isArray(answer) && answer.length) || answer) state.cellAnswers.set(state.selectedCellIndex, answer);
        else state.cellAnswers.delete(state.selectedCellIndex);
    };

    const renderCellAnswer = (answer) => {
        if (Array.isArray(answer)) {
            if (!answer.length) return '';
            return `<span class="practice-notes">${answer.map((value) => `<em>${value}</em>`).join('')}</span>`;
        }
        return answer || '';
    };

    const syncPracticeCells = () => {
        page.querySelectorAll('[data-practice-board] .practice-cell').forEach((cell) => {
            const idx = Number(cell.dataset.cellIndex);
            const answer = state.cellAnswers.get(idx);
            if (cell.classList.contains('is-empty')) {
                cell.innerHTML = renderCellAnswer(answer);
                cell.setAttribute('aria-pressed', String(idx === state.selectedCellIndex));
            }
            cell.classList.toggle('is-selected', idx === state.selectedCellIndex);
            cell.classList.remove('is-correct', 'is-incorrect');
        });
    };

    const renderOptionState = (optionsEl) => {
        if (!optionsEl) return;
        optionsEl.querySelectorAll('button').forEach((button) => {
            const active = state.selectedAnswers.has(button.textContent);
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
            button.classList.remove('is-correct', 'is-incorrect');
        });
    };

    const checkPractice = () => {
        if (state.saving) return;
        const lesson = lessons.find((item) => item.id === state.selectedLesson);
        if (!lesson?.practice) {
            showFeedback('This practice challenge is not available. Please choose another lesson.', 'error');
            return;
        }
        if (!state.selectedAnswers.size) {
            showFeedback('Choose an answer first, then check it.', 'error');
            return;
        }
        const expected = Array.isArray(lesson.practice.answer) ? lesson.practice.answer.map(String) : [String(lesson.practice.answer)];
        const selected = [...state.selectedAnswers].sort();
        const correct = expected.slice().sort().join(',') === selected.join(',');
        markAnswerButtons(expected, correct);
        markPracticeCells(correct);
        if (!correct) {
            showFeedback('❌ Incorrect. Try again. 💡 Recheck the row, column, or box clues.', 'error');
            return;
        }
        state.solvedThisView = true;
        showFeedback('✅ Correct! Great job! ⭐ +50 XP', 'success');
        completeLesson(lesson.id);
    };

    const completeLesson = (lessonId) => {
        const wasCompleted = state.completed.has(lessonId);
        const previousCompleted = new Set(state.completed);
        const previousUnlocked = state.unlockedLesson;
        const previousXp = state.xp;
        const previousAchievements = new Set(state.achievements);
        state.completed.add(lessonId);
        state.unlockedLesson = Math.min(lastLessonId, Math.max(state.unlockedLesson, lessonId + 1));
        if (wasCompleted) {
            persistAnonymousProgress();
            renderProgress(false);
            return;
        }
        const url = page.dataset.completeUrl;
        if (!url) {
            state.xp = state.completed.size * 50;
            state.achievements = new Set(calculateBadges());
            persistAnonymousProgress();
            renderProgress(true);
            return;
        }
        state.saving = true;
        setCheckButtonBusy(true);
        fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken'),
            },
            body: JSON.stringify({ lesson_id: lessonId, completed_lessons: [...previousCompleted] }),
        })
            .then((response) => response.json())
            .then((payload) => {
                if (payload.status === 'ok') {
                    state.completed = new Set((payload.completed_lessons || []).map(Number));
                    state.unlockedLesson = Math.max(Number(payload.current_lesson) || state.unlockedLesson, getUnlockedFromCompleted());
                    state.xp = payload.xp || state.xp;
                    state.achievements = new Set(payload.achievements || []);
                } else {
                    state.completed = previousCompleted;
                    state.unlockedLesson = previousUnlocked;
                    state.xp = previousXp;
                    state.achievements = previousAchievements;
                    showFeedback(payload.message || 'Progress could not be saved. Your local progress is still kept.', 'error');
                }
                persistAnonymousProgress();
                renderProgress(payload.status === 'ok');
            })
            .catch(() => {
                state.xp = Math.max(state.xp, state.completed.size * 50);
                state.achievements = new Set(calculateBadges());
                persistAnonymousProgress();
                renderProgress(true);
            })
            .finally(() => {
                state.saving = false;
                setCheckButtonBusy(false);
            });
    };

    const renderProgress = (celebrate = false) => {
        const percent = Math.round((state.completed.size / lessons.length) * 100);
        setText('[data-progress-percent]', `${percent}%`);
        const progressBar = page.querySelector('[data-progress-bar]');
        if (progressBar) progressBar.style.width = `${percent}%`;
        setText('[data-xp]', state.xp || state.completed.size * 50);
        page.querySelectorAll('[data-lesson-id]').forEach((button) => {
            const id = Number(button.dataset.lessonId);
            const locked = id > Math.max(state.unlockedLesson, firstLessonId);
            const complete = state.completed.has(id);
            button.classList.toggle('is-complete', state.completed.has(id));
            button.classList.toggle('is-locked', locked);
            button.classList.toggle('is-active', id === state.selectedLesson);
            button.setAttribute('aria-disabled', String(locked));
            button.querySelector('em').textContent = complete ? 'Complete' : (locked ? 'Locked' : 'Ready');
            const marker = button.querySelector('[data-lesson-marker]');
            if (marker) marker.textContent = complete ? '✓' : String(id);
        });
        page.querySelectorAll('[data-badge]').forEach((badge) => {
            badge.classList.toggle('is-earned', state.achievements.has(badge.dataset.badge));
        });
        const prevButton = page.querySelector('[data-prev-lesson]');
        const nextButton = page.querySelector('[data-next-lesson]');
        if (prevButton) prevButton.disabled = state.selectedLesson <= firstLessonId;
        if (nextButton) {
            const nextId = state.selectedLesson + 1;
            nextButton.disabled = nextId > lastLessonId || !canOpenLesson(nextId);
            nextButton.textContent = state.selectedLesson >= lastLessonId ? 'Finished' : 'Next';
        }
        if (celebrate) {
            page.querySelector('.lesson-stage')?.classList.add('lesson-celebrate');
            setTimeout(() => page.querySelector('.lesson-stage')?.classList.remove('lesson-celebrate'), 900);
            if (window.confetti) window.confetti({ particleCount: 70, spread: 60, origin: { y: 0.65 } });
        }
    };

    const calculateBadges = () => {
        const badges = [];
        if (state.completed.size) badges.push('beginner');
        if (state.completed.size >= 3) badges.push('quick-learner');
        if (state.completed.has(6)) badges.push('note-master');
        if (state.completed.size >= 8) badges.push('logic-expert');
        if (state.completed.size >= lessons.length) badges.push('sudoku-master');
        return badges;
    };

    const persistAnonymousProgress = () => {
        try {
            localStorage.setItem('sudoku-learning-progress', JSON.stringify({
                completed: [...state.completed],
                currentLesson: state.unlockedLesson,
                selectedLesson: state.selectedLesson,
                xp: state.xp || state.completed.size * 50,
                achievements: [...state.achievements],
            }));
        } catch (error) {}
    };

    const restoreAnonymousProgress = () => {
        try {
            const saved = JSON.parse(localStorage.getItem('sudoku-learning-progress') || 'null');
            if (!saved || initialProgress.completed_lessons?.length) return;
            state.completed = new Set((saved.completed || []).map(Number));
            state.unlockedLesson = Number(saved.currentLesson) || state.unlockedLesson;
            state.selectedLesson = Number(saved.selectedLesson) || state.unlockedLesson;
            state.xp = saved.xp || state.xp;
            state.achievements = new Set(saved.achievements || calculateBadges());
        } catch (error) {}
    };

    const previousLesson = () => {
        selectLesson(Math.max(firstLessonId, state.selectedLesson - 1));
    };

    const nextLesson = () => {
        const nextId = state.selectedLesson + 1;
        if (!canOpenLesson(nextId)) {
            showFeedback('Complete this practice challenge before continuing.', 'error');
            return;
        }
        selectLesson(nextId);
    };

    const canOpenLesson = (lessonId) => lessonId >= firstLessonId && lessonId <= Math.max(state.unlockedLesson, firstLessonId);

    const getUnlockedFromCompleted = () => {
        let unlocked = firstLessonId;
        lessons.forEach((lesson) => {
            if (state.completed.has(lesson.id)) unlocked = Math.max(unlocked, Math.min(lastLessonId, lesson.id + 1));
        });
        return unlocked;
    };

    const markAnswerButtons = (expected, correct) => {
        const expectedSet = new Set(expected.map(String));
        page.querySelectorAll('[data-practice-options] button').forEach((button) => {
            const selected = state.selectedAnswers.has(button.textContent);
            button.classList.toggle('is-correct', correct && expectedSet.has(button.textContent));
            button.classList.toggle('is-incorrect', !correct && selected);
        });
    };

    const markPracticeCells = (correct) => {
        page.querySelectorAll('[data-practice-board] .practice-cell.is-empty').forEach((cell) => {
            const hasAnswer = Boolean(state.cellAnswers.get(Number(cell.dataset.cellIndex)) || state.selectedAnswers.size);
            cell.classList.toggle('is-correct', correct && hasAnswer);
            cell.classList.toggle('is-incorrect', !correct && hasAnswer);
        });
    };

    const showFeedback = (message, variant) => {
        const feedback = page.querySelector('[data-practice-feedback]');
        if (!feedback) return;
        feedback.textContent = message;
        feedback.classList.toggle('is-success', variant === 'success');
        feedback.classList.toggle('is-error', variant === 'error');
    };

    const clearFeedback = () => {
        showFeedback('', '');
        page.querySelectorAll('[data-practice-options] button').forEach((button) => {
            button.classList.remove('is-correct', 'is-incorrect');
        });
        page.querySelectorAll('[data-practice-board] .practice-cell').forEach((cell) => {
            cell.classList.remove('is-correct', 'is-incorrect');
        });
    };

    const setText = (selector, value) => {
        const element = page.querySelector(selector);
        if (element) element.textContent = value;
    };

    const setCheckButtonBusy = (busy) => {
        const button = page.querySelector('[data-check-practice]');
        if (!button) return;
        button.disabled = busy;
        button.textContent = busy ? 'Saving...' : 'Check Answer';
    };

    const getCookie = (name) => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        return parts.length === 2 ? parts.pop().split(';').shift() : '';
    };

    return { init };
})();

window.addEventListener('DOMContentLoaded', () => {
    ThemeController.init();
    SudokuApp.init();
    TutorialController.start();
    LearningApp.init();
});
