from typing import List

from ..schemas.goal import GoalContextItem

_goal_context: List[GoalContextItem] = []


def seed_goal_context(goals: List[GoalContextItem]) -> None:
    global _goal_context
    _goal_context = goals


async def list_active_goals_with_context(limit: int = 5) -> List[GoalContextItem]:
    return _goal_context[:limit]

