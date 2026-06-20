import random
from copy import deepcopy

LEVEL_CLUES = {
    'easy': 42,
    'medium': 36,
    'hard': 32,
    'expert': 28,
    'master': 24,
}


def _valid(grid, row, col, value):
    for idx in range(9):
        if grid[row][idx] == value or grid[idx][col] == value:
            return False
    block_row = (row // 3) * 3
    block_col = (col // 3) * 3
    for r in range(block_row, block_row + 3):
        for c in range(block_col, block_col + 3):
            if grid[r][c] == value:
                return False
    return True


def _flatten(grid):
    return [cell for row in grid for cell in row]


def _find_empty(grid):
    for r in range(9):
        for c in range(9):
            if grid[r][c] == 0:
                return r, c
    return None


def _solve(grid):
    empty = _find_empty(grid)
    if not empty:
        return True
    row, col = empty
    for value in range(1, 10):
        if _valid(grid, row, col, value):
            grid[row][col] = value
            if _solve(grid):
                return True
            grid[row][col] = 0
    return False


def _count_solutions(grid, limit=2):
    empty = _find_empty(grid)
    if not empty:
        return 1
    row, col = empty
    solutions = 0
    for value in range(1, 10):
        if _valid(grid, row, col, value):
            grid[row][col] = value
            solutions += _count_solutions(grid, limit)
            grid[row][col] = 0
            if solutions >= limit:
                break
    return solutions


def _generate_full_grid():
    grid = [[0] * 9 for _ in range(9)]
    numbers = list(range(1, 10))
    for row in range(9):
        for col in range(9):
            random.shuffle(numbers)
            for value in numbers:
                if _valid(grid, row, col, value):
                    grid[row][col] = value
                    if _solve(grid):
                        break
                    grid[row][col] = 0
            if grid[row][col] == 0:
                return _generate_full_grid()
    return grid


def generate_solution():
    full_grid = _generate_full_grid()
    return _flatten(full_grid)


def generate_puzzle(difficulty='medium'):
    solution = _generate_full_grid()
    puzzle = deepcopy(solution)
    clues = LEVEL_CLUES.get(difficulty, LEVEL_CLUES['medium'])
    coordinates = [(r, c) for r in range(9) for c in range(9)]
    random.shuffle(coordinates)
    removed = 0
    max_remove = 81 - clues
    for row, col in coordinates:
        if removed >= max_remove:
            break
        backup = puzzle[row][col]
        puzzle[row][col] = 0
        grid_copy = deepcopy(puzzle)
        if _count_solutions(grid_copy, limit=2) != 1:
            puzzle[row][col] = backup
            continue
        removed += 1
    return _flatten(puzzle)


def generate_puzzle_with_solution(difficulty='medium'):
    solution_grid = _generate_full_grid()
    puzzle_grid = deepcopy(solution_grid)
    clues = LEVEL_CLUES.get(difficulty, LEVEL_CLUES['medium'])
    coordinates = [(r, c) for r in range(9) for c in range(9)]
    random.shuffle(coordinates)
    removed = 0
    max_remove = 81 - clues
    for row, col in coordinates:
        if removed >= max_remove:
            break
        backup = puzzle_grid[row][col]
        puzzle_grid[row][col] = 0
        grid_copy = deepcopy(puzzle_grid)
        if _count_solutions(grid_copy, limit=2) != 1:
            puzzle_grid[row][col] = backup
            continue
        removed += 1
    return _flatten(puzzle_grid), _flatten(solution_grid)
